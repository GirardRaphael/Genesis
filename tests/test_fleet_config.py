"""Local fixture-only checks for configuration, capacities, and process fencing."""

from datetime import timedelta
import json

from fastapi import HTTPException
from fastapi.testclient import TestClient
from fastapi import FastAPI
from pydantic import ValidationError
import pytest
from sqlalchemy import select, update

from genesis import dispatch
from genesis.broker_api import register_broker
from genesis.broker_runtime import BrokerRuntime
from genesis.db import Store
from genesis.fleet_config import FleetConfig, bind_fleet, default_fleet, load_fleet
from genesis.llm import LiveUnavailable
from test_broker_runtime import _matrix, _request, _route
from test_dispatch import PICKUP, DROP


def roster(count=2, capacity=7):
    return {
        "version": 1,
        "vehicles": [
            {"id": f"local{i}", "name": f"Van {i}", "capacity_parcels": capacity + i}
            for i in range(count)
        ],
    }


def configure(tmp_path, monkeypatch, value):
    path = tmp_path / "fleet.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    monkeypatch.setenv("GENESIS_FLEET_CONFIG", str(path))
    return path


def api_for(store):
    app = FastAPI()
    app.state.store = store
    app.state.reload_local_env = False
    dispatch.register_dispatch(app)
    register_broker(app)
    return TestClient(app)


def trip(vehicle="local0", parcels=7):
    return {
        "vehicle_id": vehicle,
        "deliveries": [{"id": "a", "pickup": PICKUP, "dropoff": DROP, "parcels": parcels}],
    }


@pytest.mark.parametrize("count", [1, 2, 5, 10])
def test_custom_roster_config_and_snapshot_agree(store, tmp_path, monkeypatch, count):
    config = roster(count)
    configure(tmp_path, monkeypatch, config)
    api = api_for(store)
    public = api.get("/api/v1/dispatch/config").json()
    fleet = api.get("/api/v1/dispatch/fleet").json()
    assert public["vehicles"] == config["vehicles"]
    assert public["fleet_config_version"] == fleet["fleet_config_version"]
    assert [
        {k: v[k] for k in ("id", "name", "capacity_parcels")} for v in fleet["vehicles"]
    ] == config["vehicles"]
    assert "fleet.json" not in json.dumps(public)


def test_default_roster_unchanged(store, monkeypatch):
    monkeypatch.delenv("GENESIS_FLEET_CONFIG", raising=False)
    assert bind_fleet(store.engine) == default_fleet()
    assert [(v.id, v.capacity_parcels) for v in bind_fleet(store.engine).vehicles] == [
        (f"van{i}", 40) for i in range(1, 5)
    ]


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", "bad vehicle"),
        ("id", "toolongid"),
        ("id", ""),
        ("capacity_parcels", 0),
        ("capacity_parcels", 41),
        ("capacity_parcels", True),
        ("capacity_parcels", "7"),
        ("name", "  "),
        ("name", "a\nb"),
    ],
)
def test_invalid_vehicle_fields(field, value):
    config = roster(1)
    config["vehicles"][0][field] = value
    with pytest.raises(ValidationError):
        FleetConfig.model_validate(config)


@pytest.mark.parametrize(
    "config",
    [
        {"vehicles": []},
        roster(11),
        {"version": True, "vehicles": roster(1)["vehicles"]},
        {"version": 2, "vehicles": roster(1)["vehicles"]},
        {"vehicles": roster(1)["vehicles"] * 2},
    ],
)
def test_invalid_roster(config):
    with pytest.raises(ValidationError):
        FleetConfig.model_validate(config)


def test_invalid_config_is_sanitized(tmp_path, monkeypatch):
    path = configure(tmp_path, monkeypatch, roster())
    for contents in ("private-invalid-payload", " " * 16_385):
        path.write_text(contents, encoding="utf-8")
        with pytest.raises(ValueError) as error:
            load_fleet()
        assert str(path) not in str(error.value) and contents not in str(error.value)


def test_worker_rejects_invalid_config_before_starting_work(store, tmp_path, monkeypatch):
    from genesis import worker

    path = configure(tmp_path, monkeypatch, roster(1))
    path.write_text("invalid fixture configuration", encoding="utf-8")
    monkeypatch.setattr(worker, "Store", lambda: store)
    monkeypatch.setattr("sys.argv", ["genesis.worker"])
    monkeypatch.setattr(worker, "run_once", lambda *_: pytest.fail("Worker must not claim work"))
    with pytest.raises(ValueError, match="Invalid local fleet configuration"):
        worker.main()


def test_manual_create_start_and_unknown_id_use_configured_capacity(store, tmp_path, monkeypatch):
    configure(tmp_path, monkeypatch, roster(1))
    monkeypatch.setattr(dispatch, "_road_route", _route)
    api = api_for(store)
    assert api.post("/api/v1/dispatch/trips", json=trip(parcels=8)).status_code == 422
    assert (
        api.post("/api/v1/dispatch/trips", json=trip("van1")).json()["detail"]["code"]
        == "unknown_vehicle"
    )
    created = api.post("/api/v1/dispatch/trips", json=trip())
    assert created.status_code == 201
    # Start independently recomputes capacity even for an old or damaged persisted request.
    with store.engine.begin() as conn:
        row = conn.execute(select(dispatch._trips)).mappings().one()
        request = json.loads(row["request_json"])
        request["deliveries"][0]["parcels"] = 8
        conn.execute(update(dispatch._trips).values(request_json=json.dumps(request)))
    assert (
        api.post(f"/api/v1/dispatch/trips/{created.json()['id']}/start").json()["detail"]["code"]
        == "route_capacity"
    )


def test_reuse_rechecks_smaller_vehicle_capacity(store, tmp_path, monkeypatch):
    configure(tmp_path, monkeypatch, roster(2))
    monkeypatch.setattr(dispatch, "_road_route", _route)
    api = api_for(store)
    created = api.post("/api/v1/dispatch/trips", json=trip("local1", 8)).json()
    with store.engine.begin() as conn:
        conn.execute(
            update(dispatch._trips)
            .where(dispatch._trips.c.id == created["id"])
            .values(
                status="running", started_at=(dispatch._utc_now() - timedelta(hours=1)).isoformat()
            )
        )
    route = api.get("/api/v1/dispatch/routes").json()["items"][0]
    rejected = api.post(
        f"/api/v1/dispatch/routes/{route['id']}/reuse", json={"vehicle_id": "local0"}
    )
    assert rejected.status_code == 422 and rejected.json()["detail"]["code"] == "route_capacity"


@pytest.mark.parametrize("count", [1, 2, 5])
def test_broker_uses_actual_roster_and_capacity(store, tmp_path, monkeypatch, count):
    configure(tmp_path, monkeypatch, roster(count))
    monkeypatch.setattr(dispatch, "_road_route", _route)
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    api = api_for(store)
    body = {
        k: v
        for k, v in _request().items()
        if k not in {"workflow_kind", "scenario_id", "policy", "seed", "vehicle_ids"}
    }
    body["explanation_policy"] = "none"
    response = api.post("/api/v1/dispatch/plans", json=body)
    assert response.status_code == 202
    run = store.get_run(response.json()["id"])
    assert run["request"]["vehicle_ids"] == [f"local{i}" for i in range(count)]
    runtime = BrokerRuntime(store, store.claim("fleet-test"))
    runtime.execute()
    final = store.get_run(run["id"])
    assert final["status"] == "succeeded" and final["detail"]["certificate"]["valid"]
    snapshot = final["detail"]["fleet_snapshot"]
    assert snapshot["fleet_config_version"] == run["request"]["fleet_config_version"]
    assert [v["capacity_parcels"] for v in snapshot["vehicles"]] == [7 + i for i in range(count)]
    assert (
        api.post("/api/v1/dispatch/plans", json={**body, "vehicle_ids": ["van1"]}).json()["detail"][
            "code"
        ]
        == "unknown_vehicle"
    )


def test_broker_over_capacity_cannot_create_trip(store, tmp_path, monkeypatch):
    configure(tmp_path, monkeypatch, roster(1, 1))
    bind_fleet(store.engine)
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr(dispatch, "_road_route", _route)
    body = _request()
    body["vehicle_ids"] = ["local0"]
    run = store.create_run(body, "over-capacity")
    BrokerRuntime(store, store.claim("small-van")).execute()
    assert store.get_run(run["id"])["detail"]["created_trip_ids"] == []


@pytest.mark.parametrize("state", ["ready", "running", "cargo", "queued"])
def test_restart_cannot_change_roster_with_reserved_work_or_cargo(
    store, tmp_path, monkeypatch, state
):
    path = configure(tmp_path, monkeypatch, roster(1))
    monkeypatch.setattr(dispatch, "_road_route", _route)
    api = api_for(store)
    if state == "queued":
        body = _request()
        body["vehicle_ids"] = ["local0"]
        store.create_run(body, "queued-plan")
    else:
        api.post("/api/v1/dispatch/trips", json=trip())
        if state != "ready":
            now = dispatch._utc_now()
            with store.engine.begin() as conn:
                conn.execute(
                    update(dispatch._trips).values(
                        status="cancelled" if state == "cargo" else "running",
                        started_at=now.isoformat(),
                        cancelled_at=now.isoformat() if state == "cargo" else None,
                    )
                )
    path.write_text(json.dumps(roster(2, 5)), encoding="utf-8")
    restarted = Store(str(store.engine.url))
    with pytest.raises(HTTPException) as error:
        bind_fleet(restarted.engine)
    assert error.value.detail["code"] == "fleet_configuration_changed"
    # The original process still retains the accepted roster and all locks.
    assert api.get("/api/v1/dispatch/fleet").status_code == 200


def test_quiescent_restart_fences_old_process_and_frozen_request(store, tmp_path, monkeypatch):
    path = configure(tmp_path, monkeypatch, roster(1))
    api = api_for(store)
    old_version = api.get("/api/v1/dispatch/config").json()["fleet_config_version"]
    path.write_text(json.dumps(roster(1, 4)), encoding="utf-8")
    restarted = Store(str(store.engine.url))
    assert bind_fleet(restarted.engine).fingerprint != old_version
    assert (
        api.get("/api/v1/dispatch/fleet").json()["detail"]["code"] == "fleet_configuration_changed"
    )
    request = _request()
    request.update(vehicle_ids=["local0"], fleet_config_version=old_version)
    restarted.create_run(request, "stale-worker-request")
    runtime = BrokerRuntime(restarted, restarted.claim("stale-worker"))
    with pytest.raises(LiveUnavailable, match="differs"):
        runtime.planning({}, [])


def test_retired_unknown_cargo_cannot_disappear_at_restart(store, monkeypatch):
    monkeypatch.delenv("GENESIS_FLEET_CONFIG", raising=False)
    monkeypatch.setattr(dispatch, "_road_route", _route)
    api = api_for(store)
    api.post("/api/v1/dispatch/trips", json=trip("van1"))
    now = dispatch._utc_now().isoformat()
    with store.engine.begin() as conn:
        conn.execute(
            update(dispatch._trips).values(
                vehicle_id="retired", status="cancelled", started_at=now, cancelled_at=now
            )
        )
    with pytest.raises(HTTPException):
        bind_fleet(Store(str(store.engine.url)).engine)
    with store.engine.connect() as conn:
        row = conn.execute(select(dispatch._trips)).mappings().one()
        assert row["vehicle_id"] == "retired" and dispatch._held_cargo(row) == 7


def test_idempotent_plan_replay_survives_quiescent_reconfiguration(store, tmp_path, monkeypatch):
    path = configure(tmp_path, monkeypatch, roster(1))
    api = api_for(store)
    body = {
        k: v
        for k, v in _request().items()
        if k not in {"workflow_kind", "scenario_id", "policy", "seed", "vehicle_ids"}
    }
    created = api.post("/api/v1/dispatch/plans", json=body, headers={"Idempotency-Key": "old-plan"})
    assert created.status_code == 202
    from genesis.db import runs

    with store.engine.begin() as conn:
        conn.execute(
            update(runs).where(runs.c.id == created.json()["id"]).values(status="cancelled")
        )
    path.write_text(json.dumps(roster(2)), encoding="utf-8")
    restarted_api = api_for(Store(str(store.engine.url)))
    replay = restarted_api.post(
        "/api/v1/dispatch/plans", json=body, headers={"Idempotency-Key": "old-plan"}
    )
    assert replay.status_code == 202 and replay.json()["id"] == created.json()["id"]


def test_ten_van_separated_search_is_bounded(monkeypatch):
    from genesis import broker_solver
    from genesis.models import content_hash

    vehicles = [
        {
            "id": f"v{i}",
            "start_index": i,
            "capacity": 40,
            "fixed_cost_cents": 0,
            "cost_per_km_cents": 0,
            "driver_hour_cents": 0,
        }
        for i in range(10)
    ]
    nodes = [{"kind": "start", "coordinates": [0, 0]} for _ in vehicles]
    deliveries = []
    for i in range(10):
        nodes.extend(
            [
                {"kind": kind, "delivery_id": str(i), "coordinates": [0, 0]}
                for kind in ("pickup", "dropoff")
            ]
        )
        deliveries.append(
            {"id": str(i), "pickup_index": 10 + 2 * i, "dropoff_index": 11 + 2 * i, "parcels": 1}
        )
    problem = {
        "vehicles": vehicles,
        "deliveries": deliveries,
        "nodes": nodes,
        "durations": [[0] * 30 for _ in nodes],
        "distances": [[0] * 30 for _ in nodes],
    }
    problem["input_hash"] = content_hash(problem)
    budgets, attempted = [], []
    monkeypatch.setattr(
        broker_solver, "_solve", lambda problem, vehicles, seconds: budgets.append(seconds)
    )

    def no_candidate(*args):
        attempted.append(1)
        raise ValueError("fixture rejects candidate")

    monkeypatch.setattr(broker_solver, "_materialize", no_candidate)
    result = broker_solver.compare_strategies(problem)
    assert sum(budgets) == 13 and len(attempted) == 1000
    assert "1000" in result["candidates"][-1]["reason"]


def test_road_matrix_accepts_ten_vans_and_ten_deliveries(monkeypatch):
    nodes = [PICKUP] * 30
    monkeypatch.setattr(dispatch, "_last_route_request", 0)
    monkeypatch.setattr(dispatch, "_provider_json", lambda *_: {
        "code": "Ok", "sources": [{"distance": 0}] * 30,
        "destinations": [{"distance": 0}] * 30,
        "durations": [[0] * 30 for _ in nodes], "distances": [[0] * 30 for _ in nodes],
    })
    assert len(dispatch.road_matrix(nodes)["durations"]) == 30
    with pytest.raises(HTTPException):
        dispatch.road_matrix(nodes + [PICKUP])
