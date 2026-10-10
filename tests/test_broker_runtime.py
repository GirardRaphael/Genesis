"""Broker workflow integration with deterministic road-provider stand-ins."""

from genesis.broker_runtime import BrokerRuntime
from genesis.dispatch import _project, _trips, fleet_snapshot, materialize_broker_trips
from genesis.llm import LiveUnavailable
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, update
import pytest
from datetime import datetime, timedelta, timezone


def _request():
    return {
        "workflow_kind": "broker", "scenario_id": "BROKER", "policy": "broker_dispatch", "seed": 0,
        "mode": "fixture", "objective": "cost", "budget_usd": None,
        "depot": {"label": "Depot", "coordinates": [-73.5673, 45.5019]},
        "vehicle_ids": ["van1", "van2"],
        "deliveries": [
            {"id": "a", "pickup": {"label": "A pickup", "coordinates": [-73.56, 45.50]}, "dropoff": {"label": "A drop", "coordinates": [-73.55, 45.50]}, "parcels": 5, "deadline_minutes": 120},
            {"id": "b", "pickup": {"label": "B pickup", "coordinates": [-73.54, 45.50]}, "dropoff": {"label": "B drop", "coordinates": [-73.53, 45.50]}, "parcels": 5, "deadline_minutes": 120},
        ],
        "activation_cost_cad": "18", "cost_per_km_cad": "0.95", "driver_cost_per_hour_cad": "28",
        "service_minutes": 2, "balance_value_cad_per_minute": "0.50",
    }


def _matrix(nodes):
    n = len(nodes)
    return {
        "durations": [[0 if i == j else 60 + 20 * abs(i - j) for j in range(n)] for i in range(n)],
        "distances": [[0 if i == j else 100 + 50 * abs(i - j) for j in range(n)] for i in range(n)],
        "source": "fixture static roads", "computed_at": "2026-10-10T00:00:00+00:00",
    }


def _route(stops, **_kwargs):
    coords = [list(s["coordinates"]) for s in stops]
    legs = [{"coordinates": [a, b], "duration_seconds": 60, "distance_meters": 100} for a, b in zip(coords, coords[1:])]
    return {"coordinates": coords, "legs": legs, "duration_seconds": 60 * len(legs), "distance_km": 0.1 * len(legs), "duration_minutes": len(legs), "source": "fixture road geometry"}


def test_five_role_broker_creates_ordered_ready_trip(store, monkeypatch):
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    row = store.create_run(_request(), "broker-1")
    claimed = store.claim("test-worker")
    BrokerRuntime(store, claimed).execute()
    completed = store.get_run(row["id"])
    assert completed["status"] == "succeeded"
    detail = completed["detail"]
    assert [a["role"] for a in detail["agents"]] == ["planning", "traffic", "optimization", "monitoring", "exception"]
    assert detail["certificate"]["valid"]
    assert detail["broker_solution"]["selected_strategy"]
    assert len(detail["created_trip_ids"]) >= 1
    assert len(detail["handoffs"]) == 5
    with store.engine.connect() as conn:
        rows = conn.execute(select(_trips).where(_trips.c.id.in_(detail["created_trip_ids"]))).mappings().all()
    assert all(row["status"] == "ready" for row in rows)
    projected = [_project(dict(row)) for row in rows]
    assert sum(len(item["stops"]) for item in projected) == 4
    assert all(item["stops"][0]["eta_seconds"] == 60 for item in projected)
    assert all(item["route"]["duration_seconds"] == 180 * len(item["stops"]) for item in projected)
    assert all([stop["eta_seconds"] for stop in item["stops"]] == [60 + 180 * i for i in range(len(item["stops"]))] for item in projected)
    assert len({s["id"] for item in projected for s in item["stops"]}) == 4
    assert all(c["name"] in {"freeze_free_fleet", "osrm_static_table", "compare_fleet_strategies", "independent_broker_certificate", "dispatch_admissibility"} for a in detail["agents"] for c in a["tool_calls"])


def test_service_dwell_keeps_van_busy_until_last_service(store, monkeypatch):
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    request = _request()
    request["vehicle_ids"] = ["van1"]
    run = store.create_run(request, "dwell")
    BrokerRuntime(store, store.claim("dwell-worker")).execute()
    trip_id = store.get_run(run["id"])["detail"]["created_trip_ids"][0]
    start = datetime(2026, 10, 10, tzinfo=timezone.utc)
    with store.engine.begin() as conn:
        conn.execute(update(_trips).where(_trips.c.id == trip_id).values(status="running", started_at=start.isoformat()))
    monkeypatch.setattr("genesis.dispatch._utc_now", lambda: start + timedelta(seconds=2))
    during_service = fleet_snapshot(store.engine, ["van1"], request["depot"])["vehicles"][0]
    assert not during_service["available"]
    with store.engine.connect() as conn:
        row = dict(conn.execute(select(_trips).where(_trips.c.id == trip_id)).mappings().one())
    early = _project(row)
    assert early["progress"]["completed_stop_count"] == 0
    assert early["progress"]["coordinate"] == early["stops"][0]["coordinates"]
    monkeypatch.setattr("genesis.dispatch._utc_now", lambda: start + timedelta(seconds=13))
    finished = fleet_snapshot(store.engine, ["van1"], request["depot"])["vehicles"][0]
    assert finished["available"]
    assert finished["origin"] == _project(row)["route"]["coordinates"][-1]


def test_busy_vehicle_excluded_and_materialization_idempotent(store, monkeypatch):
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    request = _request()
    first = store.create_run(request, "broker-2")
    runtime = BrokerRuntime(store, store.claim("worker-1"))
    runtime.execute()
    detail = store.get_run(first["id"])["detail"]
    second = store.create_run(request, "broker-3")
    second_runtime = BrokerRuntime(store, store.claim("worker-2"))
    second_runtime.execute()
    second_detail = store.get_run(second["id"])["detail"]
    used = {v for route in detail["broker_solution"]["selected"]["vehicle_routes"] for v in [route["vehicle_id"]]}
    available = {v["id"] for v in second_detail["fleet_snapshot"]["vehicles"] if v["available"]}
    assert not used & available
    planning = detail["node_results"]["planning"]
    selected = detail["broker_solution"]["selected"]
    ids = materialize_broker_trips(store, first["id"], runtime.fence, planning["snapshot"], request, selected, detail["node_results"]["traffic"]["problem"], detail["node_results"]["monitoring"]["certificate_artifact_id"])
    assert set(ids) == set(detail["created_trip_ids"])


def test_stale_fleet_snapshot_refuses_new_trip(store, monkeypatch):
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    request = _request()
    first = store.create_run(request, "broker-race-first")
    first_runtime = BrokerRuntime(store, store.claim("worker-1"))
    first_runtime.execute()
    first_detail = store.get_run(first["id"])["detail"]
    second = store.create_run(request, "broker-race-second")
    second_runtime = BrokerRuntime(store, store.claim("worker-2"))
    old_snapshot = first_detail["node_results"]["planning"]["snapshot"]
    old_problem = first_detail["node_results"]["traffic"]["problem"]
    selected = first_detail["broker_solution"]["selected"]
    with pytest.raises(HTTPException) as error:
        materialize_broker_trips(store, second["id"], second_runtime.fence, old_snapshot, request, selected, old_problem, first_detail["node_results"]["monitoring"]["certificate_artifact_id"])
    assert error.value.detail["code"] == "fleet_changed"
    with store.engine.connect() as conn:
        owned = conn.execute(select(_trips).where(_trips.c.idempotency_key.like(f"broker:{second['id']}:%"))).all()
    assert not owned


def test_broker_http_contract_and_live_preflight(store, monkeypatch):
    from genesis.api import create_app

    api = TestClient(create_app(store))
    body = _request()
    for key in ("workflow_kind", "scenario_id", "policy", "seed"):
        body.pop(key)
    created = api.post("/api/v1/dispatch/plans", json=body, headers={"Idempotency-Key": "http-broker"})
    assert created.status_code == 202
    run_id = created.json()["id"]
    assert created.json()["workflow_kind"] == "broker"
    assert api.post("/api/v1/dispatch/plans", json=body, headers={"Idempotency-Key": "http-broker"}).json()["id"] == run_id
    assert api.get(f"/api/v1/dispatch/plans/{run_id}").json()["request"]["scenario_id"] == "BROKER"
    assert len(api.get("/api/v1/dispatch/fleet").json()["vehicles"]) == 4
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    body["mode"], body["budget_usd"] = "live", "1"
    refused = api.post("/api/v1/dispatch/plans", json=body)
    assert refused.status_code == 503
    assert refused.json()["error"]["code"] == "live_unavailable"


def test_no_free_selected_van_rejects_before_model_call(store, monkeypatch):
    from genesis.api import create_app

    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    request = _request()
    request["vehicle_ids"] = ["van1"]
    first = store.create_run(request, "full-van")
    BrokerRuntime(store, store.claim("fixture-worker")).execute()
    assert store.get_run(first["id"])["detail"]["created_trip_ids"]

    api = TestClient(create_app(store))
    body = {k: v for k, v in request.items() if k not in {"workflow_kind", "scenario_id", "policy", "seed"}}
    blocked = api.post("/api/v1/dispatch/plans", json=body)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "fleet_unavailable"

    live_request = {**request, "mode": "live", "provider": "anthropic", "budget_usd": "1", "model_policy": {}}
    second = store.create_run(live_request, "stale-fleet-live")
    monkeypatch.setattr("genesis.workflow.ModelAdapter", lambda *_args: pytest.fail("Model call after fleet exhaustion"))
    with pytest.raises(LiveUnavailable):
        BrokerRuntime(store, store.claim("live-worker")).execute()
    assert not any(event["kind"] == "model.started" for event in store.history(second["id"]))


def test_geometry_recheck_rejects_changed_deadline(store, monkeypatch):
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    request = _request()
    run = store.create_run(request, "geometry-change")
    runtime = BrokerRuntime(store, store.claim("geometry-worker"))
    planning, _ = runtime.planning({}, [])
    problem = {"nodes": planning["nodes"], "vehicles": planning["vehicles"], "deliveries": planning["deliveries"]}
    problem.update(_matrix(planning["nodes"]))
    from genesis.models import content_hash
    solver_problem = {k: v for k, v in problem.items() if k in {"nodes", "vehicles", "deliveries", "durations", "distances"}}
    solver_problem.update({"objective": "cost", "service_seconds": 120, "balance_value_cents_per_minute": 50, "max_duration_s": 28800})
    solver_problem["input_hash"] = content_hash(solver_problem)
    from genesis.broker_solver import compare_strategies
    solution = compare_strategies(solver_problem)["selected"]
    assert solution

    def slow_route(stops, **_kwargs):
        road = _route(stops)
        for leg in road["legs"]:
            leg["duration_seconds"] = 4000
        road["duration_seconds"] = 4000 * len(road["legs"])
        return road

    monkeypatch.setattr("genesis.dispatch._road_route", slow_route)
    with pytest.raises(HTTPException) as error:
        materialize_broker_trips(store, run["id"], runtime.fence, planning["snapshot"], request, solution, solver_problem, "certificate-fixture")
    assert error.value.detail["code"] == "road_route_changed"


def test_multi_van_geometry_failure_creates_no_partial_trips(store, monkeypatch):
    from genesis.broker_solver import compare_strategies

    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    request = _request()
    run = store.create_run(request, "atomic-geometry")
    runtime = BrokerRuntime(store, store.claim("atomic-worker"))
    planning, _ = runtime.planning({}, [])
    traffic, _ = runtime.traffic({"planning": planning}, [])
    comparison = compare_strategies(traffic["problem"])
    separated = next(c["solution"] for c in comparison["candidates"] if c["strategy"] == "separated")
    assert len(separated["vehicle_routes"]) == 2
    calls = 0

    def one_route_then_failure(stops, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise HTTPException(503, {"code": "provider_unavailable", "message": "Provider unavailable"})
        return _route(stops, **kwargs)

    monkeypatch.setattr("genesis.dispatch._road_route", one_route_then_failure)
    with pytest.raises(HTTPException):
        materialize_broker_trips(store, run["id"], runtime.fence, planning["snapshot"], request, separated, traffic["problem"], "certificate-fixture")
    with store.engine.connect() as conn:
        assert not conn.execute(select(_trips).where(_trips.c.idempotency_key.like(f"broker:{run['id']}:%"))).first()


def test_cancel_between_trip_commit_and_run_finish_retires_ready_trip(store, monkeypatch):
    from genesis.api import create_app

    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    request = _request()
    request["vehicle_ids"] = ["van1"]
    run = store.create_run(request, "cancel-final-window")
    api = TestClient(create_app(store))
    original = store.put_artifact

    def cancel_after_final_artifact(run_id, kind, content, fence=None, invocation_id=None):
        artifact_id = original(run_id, kind, content, fence, invocation_id)
        if kind == "accepted_plan":
            with store.engine.connect() as conn:
                trip_id = conn.execute(select(_trips.c.id).where(_trips.c.idempotency_key.like(f"broker:{run_id}:%"))).scalar_one()
            assert api.post(f"/api/v1/dispatch/trips/{trip_id}/start").status_code == 409
            store.cancel(run_id)
        return artifact_id

    monkeypatch.setattr(store, "put_artifact", cancel_after_final_artifact)
    BrokerRuntime(store, store.claim("cancel-window-worker")).execute()
    assert store.get_run(run["id"])["status"] == "cancelled"
    with store.engine.connect() as conn:
        row = conn.execute(select(_trips).where(_trips.c.idempotency_key.like(f"broker:{run['id']}:%"))).mappings().one()
    assert row["status"] == "cancelled"
    assert fleet_snapshot(store.engine, ["van1"], request["depot"])["vehicles"][0]["available"]
