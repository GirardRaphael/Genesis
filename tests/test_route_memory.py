"""U12 memory tests use disposable SQLite and mocked providers, never customer/GPS data."""

from copy import deepcopy
from datetime import timedelta
import json

from sqlalchemy import insert, select, update

from genesis import dispatch, route_memory
from genesis.db import runs
from test_dispatch import PICKUP, DROP, DROP_2, client, request, road_response


def _save(
    store,
    *,
    status="running",
    deliveries=None,
    stop_order=None,
    policy=None,
    owner=None,
    vehicle="van1",
    duration=120,
):
    body = request(deliveries)
    body["vehicle_id"] = vehicle
    for index, d in enumerate(body["deliveries"]):
        d["id"] = d.get("id") or f"d{index}"
    if stop_order:
        body["stop_order"] = stop_order
    if owner:
        body["owner_run_id"] = owner
        body["broker_policy"] = policy
        body["service_seconds"] = policy["service_minutes"] * 60
        body["broker_plan"] = {
            "input_hash": "problem",
            "solution_hash": "solution",
            "certificate_artifact_id": "certificate",
        }
    stops = [d[k] for d in body["deliveries"] for k in ("pickup", "dropoff")]
    if owner:
        stops.insert(0, PICKUP)
    road = dispatch._road_route(stops)
    road["duration_seconds"] = (
        duration + body.get("service_seconds", 0) * len(body["deliveries"]) * 2
    )
    values = dispatch._ready_values(body, road, "fixture", None)
    values.update(
        status=status,
        started_at=(dispatch._utc_now() - timedelta(hours=1)).isoformat()
        if status != "ready"
        else None,
        cancelled_at=dispatch._stamp() if status == "cancelled" else None,
    )
    with store.engine.begin() as conn:
        conn.execute(insert(dispatch._trips).values(**values))
    return values


def _setup(store, monkeypatch):
    monkeypatch.setattr(dispatch, "_provider_json", road_response)
    monkeypatch.setattr(dispatch.time, "sleep", lambda _: None)
    return client(store)


def _broker(deliveries=None):
    from genesis.broker_api import BrokerRequest

    body = {
        "deliveries": deliveries
        or [{"id": "a", "pickup": PICKUP, "dropoff": DROP, "parcels": 2, "deadline_minutes": 120}],
        "depot": PICKUP,
        "mode": "fixture",
    }
    return BrokerRequest.model_validate(body).model_dump(mode="json")


def _owner(store, owner, trip_ids, status="succeeded"):
    with store.engine.begin() as conn:
        conn.execute(
            insert(runs).values(
                id=owner,
                project_id="test",
                idempotency_key=owner,
                request_hash="fixture",
                request={},
                status=status,
                created_at=dispatch._stamp(),
                detail={
                    "final_kind": "accepted_plan",
                    "created_trip_ids": trip_ids,
                    "certificate": {
                        "valid": True,
                        "input_hash": "problem",
                        "solution_hash": "solution",
                    },
                    "artifact_ids": {"certificate": "certificate"},
                },
            )
        )


def test_history_only_completed_simulations_and_survives_new_app(store, monkeypatch):
    api = _setup(store, monkeypatch)
    first = _save(store, duration=120)
    _save(store, duration=240)
    _save(store, status="ready")
    _save(store, status="cancelled")
    running = _save(store)
    with store.engine.begin() as conn:
        conn.execute(
            update(dispatch._trips)
            .where(dispatch._trips.c.id == running["id"])
            .values(started_at=dispatch._stamp())
        )
    history = client(store).get("/api/v1/dispatch/routes").json()
    item = history["items"][0]
    assert history["scanned_trip_count"] == 5
    assert item["trip_count"] == 5 and item["completed_sample_count"] == 2
    assert item["mean_elapsed_simulation_seconds"] == 180
    assert item["p50_elapsed_simulation_seconds"] == 180
    assert item["deliveries_per_simulation_hour"] == 20
    assert item["on_time_rate"] is None and item["on_time_sample_count"] == 0
    assert item["tracking_mode"] == "simulation"
    assert api.get(f"/api/v1/dispatch/trips/{first['id']}").json()["status"] == "completed"


def test_identity_directions_workload_address_and_variants(store, monkeypatch):
    _setup(store, monkeypatch)
    deliveries = [
        {"id": "a", "pickup": PICKUP, "dropoff": DROP, "parcels": 2},
        {"id": "b", "pickup": PICKUP, "dropoff": DROP_2, "parcels": 3},
    ]
    _save(store, deliveries=deepcopy(deliveries))
    _save(
        store,
        deliveries=deepcopy(deliveries),
        stop_order=["a:pickup", "b:pickup", "a:dropoff", "b:dropoff"],
    )
    shifted = deepcopy(deliveries)
    shifted[0]["pickup"]["coordinates"][0] += 0.00000001
    shifted[0]["pickup"]["label"] = "  RUE Saint-Paul, Montréal  "
    _save(store, deliveries=shifted)
    changed = deepcopy(deliveries)
    changed[0]["pickup"], changed[0]["dropoff"] = changed[0]["dropoff"], changed[0]["pickup"]
    _save(store, deliveries=changed)
    changed = deepcopy(deliveries)
    changed[0]["parcels"] += 1
    _save(store, deliveries=changed)
    changed = deepcopy(deliveries)
    changed[0]["pickup"]["label"] = "Other street number"
    _save(store, deliveries=changed)
    history = route_memory.route_history(store.engine)
    assert len(history["items"]) == 4
    repeated = next(r for r in history["items"] if r["trip_count"] == 3)
    assert repeated["variant_count"] == 2


def test_preview_no_reservation_and_typed_failures(store, monkeypatch):
    api = _setup(store, monkeypatch)
    result = api.post("/api/v1/dispatch/preview", json={"deliveries": request()["deliveries"]})
    assert result.status_code == 200
    assert result.json()["route"]["source"] == "OSRM driving"
    assert len(result.json()["stops"]) == 2
    assert api.get("/api/v1/dispatch/trips").json()["items"] == []
    assert api.get("/api/v1/dispatch/routes").json()["items"] == []
    monkeypatch.setattr(dispatch, "_provider_json", lambda *a, **kw: {"code": "NoRoute"})
    result = api.post("/api/v1/dispatch/preview", json={"deliveries": request()["deliveries"]})
    assert result.status_code == 422 and result.json()["detail"]["code"] == "road_route_unavailable"


def test_reuse_new_ready_trip_rechecks_roads_fleet_and_preserves_original(store, monkeypatch):
    api = _setup(store, monkeypatch)
    saved = _save(store)
    route_id = api.get("/api/v1/dispatch/routes").json()["items"][0]["id"]
    path = f"/api/v1/dispatch/routes/{route_id}/reuse"
    monkeypatch.setattr(dispatch, "_provider_json", lambda *a, **kw: {"code": "NoRoute"})
    assert api.post(path, json={"vehicle_id": "van2"}).status_code == 422
    monkeypatch.setattr(dispatch, "_provider_json", road_response)
    reused = api.post(path, json={"vehicle_id": "van2"}, headers={"Idempotency-Key": "reuse"})
    assert reused.status_code == 201, reused.text
    assert reused.json()["id"] != saved["id"] and reused.json()["status"] == "ready"
    assert reused.json()["started_at"] is None
    assert reused.json()["route"]["coordinates"] == [
        PICKUP["coordinates"],
        PICKUP["coordinates"],
        DROP["coordinates"],
    ]
    assert reused.json()["route"]["duration_seconds"] == 120
    assert [s["eta_seconds"] for s in reused.json()["stops"]] == [0, 120]
    assert (
        api.post(path, json={"vehicle_id": "van2"}, headers={"Idempotency-Key": "reuse"}).json()[
            "id"
        ]
        == reused.json()["id"]
    )
    assert api.post(path, json={"vehicle_id": "van2"}).status_code == 409
    with store.engine.connect() as conn:
        current = dict(
            conn.execute(select(dispatch._trips).where(dispatch._trips.c.id == saved["id"]))
            .mappings()
            .one()
        )
    assert current == saved


def test_reuse_rechecks_fleet_after_provider_call(store, monkeypatch):
    api = _setup(store, monkeypatch)
    _save(store)
    route_id = api.get("/api/v1/dispatch/routes").json()["items"][0]["id"]
    original = dispatch._road_route

    def changed_fleet(*args, **kwargs):
        road = original(*args, **kwargs)
        body = request()
        body["vehicle_id"] = "van2"
        body["deliveries"][0]["id"] = "other"
        with store.engine.begin() as conn:
            conn.execute(
                insert(dispatch._trips).values(**dispatch._ready_values(body, road, "other", None))
            )
        return road

    monkeypatch.setattr(dispatch, "_road_route", changed_fleet)
    result = api.post(f"/api/v1/dispatch/routes/{route_id}/reuse", json={"vehicle_id": "van2"})
    assert result.status_code == 409 and result.json()["detail"]["code"] == "fleet_changed"


def test_reuse_manual_route_includes_known_van_repositioning(store, monkeypatch):
    api = _setup(store, monkeypatch)
    saved = _save(store)
    route_id = api.get("/api/v1/dispatch/routes").json()["items"][0]["id"]
    result = api.post(f"/api/v1/dispatch/routes/{route_id}/reuse", json={"vehicle_id": "van1"})
    assert result.status_code == 201, result.text
    reused = result.json()
    assert reused["route"]["coordinates"] == [
        DROP["coordinates"],
        PICKUP["coordinates"],
        DROP["coordinates"],
    ]
    assert reused["route"]["duration_seconds"] == 240
    assert reused["route"]["distance_km"] == 2
    assert [s["eta_seconds"] for s in reused["stops"]] == [120, 240]
    assert reused["progress"]["coordinate"] == DROP["coordinates"]
    assert (
        api.get(f"/api/v1/dispatch/trips/{saved['id']}").json()["route"]["duration_seconds"] == 120
    )


def test_reuse_manual_route_repositioning_counts_against_deadline(store, monkeypatch):
    api = _setup(store, monkeypatch)
    deliveries = [
        {"id": "a", "pickup": PICKUP, "dropoff": DROP, "parcels": 2, "deadline_minutes": 3}
    ]
    saved = _save(store, deliveries=deliveries)
    route_id = api.get("/api/v1/dispatch/routes").json()["items"][0]["id"]
    result = api.post(f"/api/v1/dispatch/routes/{route_id}/reuse", json={"vehicle_id": "van1"})
    assert result.status_code == 409 and result.json()["detail"]["code"] == "road_route_changed"
    with store.engine.connect() as conn:
        assert conn.execute(select(dispatch._trips.c.id)).scalars().all() == [saved["id"]]


def test_reuse_rejects_cancelled_onboard_cargo(store, monkeypatch):
    api = _setup(store, monkeypatch)
    saved = _save(store)
    held = _save(store, status="cancelled", vehicle="van2")
    from datetime import datetime

    cancelled_at = (datetime.fromisoformat(held["started_at"]) + timedelta(seconds=1)).isoformat()
    with store.engine.begin() as conn:
        conn.execute(
            update(dispatch._trips)
            .where(dispatch._trips.c.id == held["id"])
            .values(cancelled_at=cancelled_at)
        )
    route = next(
        r for r in api.get("/api/v1/dispatch/routes").json()["items"] if r["completed_sample_count"]
    )
    result = api.post(f"/api/v1/dispatch/routes/{route['id']}/reuse", json={"vehicle_id": "van2"})
    assert result.status_code == 409 and result.json()["detail"]["code"] == "vehicle_busy"
    assert api.get(f"/api/v1/dispatch/trips/{saved['id']}").json()["status"] == "completed"


def test_context_exact_policy_and_completed_full_mission_only(store, monkeypatch):
    _setup(store, monkeypatch)
    body = _broker()
    policy = route_memory.constraint_policy(body)
    saved = _save(store, deliveries=deepcopy(body["deliveries"]), policy=policy, owner="run1")
    _owner(store, "run1", [saved["id"]])
    failed = _save(
        store,
        deliveries=deepcopy(body["deliveries"]),
        policy=policy,
        owner="failed",
        status="cancelled",
    )
    _owner(store, "failed", [failed["id"]], status="failed")
    context = route_memory.route_context(store.engine, body)
    assert context["completed_sample_count"] == 1 and len(context["candidates"]) == 1
    assert context["on_time_rate"] == 1 and context["on_time_sample_count"] == 1
    assert context["candidates"][0]["vehicle_routes"] == [
        {"vehicle_id": "van1", "stop_order": ["a:pickup", "a:dropoff"]}
    ]
    assert "Rue" not in json.dumps(context) and "coordinates" not in json.dumps(context)
    changed = deepcopy(body)
    changed["deliveries"][0]["id"] = "new-id"
    assert (
        route_memory.route_context(store.engine, changed)["candidates"][0]["vehicle_routes"][0][
            "stop_order"
        ][0]
        == "new-id:pickup"
    )
    changed["service_minutes"] += 1
    assert route_memory.route_context(store.engine, changed)["candidates"] == []
    changed = deepcopy(body)
    changed["deliveries"][0]["deadline_minutes"] += 1
    assert route_memory.route_context(store.engine, changed)["candidates"] == []
    monkeypatch.setenv("GENESIS_ROUTER_URL", "https://different.example")
    assert not route_memory.route_context(store.engine, body)["candidates"][0]["provider_matches"]


def test_geocode_cache_identity_includes_provider(store, monkeypatch):
    api = _setup(store, monkeypatch)
    dispatch._geocode_cache.clear()
    calls = []

    def geocoder(url, params=None):
        calls.append(url)
        return {"features": []}

    monkeypatch.setattr(dispatch, "_provider_json", geocoder)
    api.get("/api/v1/dispatch/geocode?q=Montréal")
    monkeypatch.setenv("GENESIS_GEOCODER_URL", "https://new.example")
    result = api.get("/api/v1/dispatch/geocode?q=Montréal")
    assert len(calls) == 2 and result.json()["source_url"] == "https://new.example/api"


def test_context_ranks_completed_missions_and_rejects_missing_source_or_incomplete_group(
    store, monkeypatch
):
    _setup(store, monkeypatch)
    body = _broker()
    policy = route_memory.constraint_policy(body)
    for number, duration in enumerate([300, 120, 240, 180]):
        owner = f"run{number}"
        saved = _save(
            store,
            deliveries=deepcopy(body["deliveries"]),
            policy=policy,
            owner=owner,
            duration=duration,
        )
        _owner(store, owner, [saved["id"]])
    orphan = _save(
        store, deliveries=deepcopy(body["deliveries"]), policy=policy, owner="partial", duration=1
    )
    _owner(store, "partial", [orphan["id"], "missing-trip"])
    missing = _save(
        store, deliveries=deepcopy(body["deliveries"]), policy=policy, owner="missing", duration=1
    )
    _owner(store, "missing", [missing["id"]])
    road = json.loads(missing["route_json"])
    road.pop("computed_at")
    road.pop("source_url")
    with store.engine.begin() as conn:
        conn.execute(
            update(dispatch._trips)
            .where(dispatch._trips.c.id == missing["id"])
            .values(route_json=json.dumps(road))
        )
    context = route_memory.route_context(store.engine, body)
    assert [c["source_run_id"] for c in context["candidates"]] == ["run1", "run3", "run2"]
    assert [c["historical_rank"] for c in context["candidates"]] == [1, 2, 3]
    assert context["completed_mission_count"] == 5
    assert context["sample_unit"] == "completed_mission"


def test_reuse_broker_order_service_and_deadline_revalidation(store, monkeypatch):
    api = _setup(store, monkeypatch)
    body = _broker()
    body["deliveries"][0]["deadline_minutes"] = 1
    saved = _save(
        store,
        deliveries=deepcopy(body["deliveries"]),
        policy=route_memory.constraint_policy(body),
        owner="old",
    )
    route_id = api.get("/api/v1/dispatch/routes").json()["items"][0]["id"]
    result = api.post(f"/api/v1/dispatch/routes/{route_id}/reuse", json={"vehicle_id": "van2"})
    assert result.status_code == 409 and result.json()["detail"]["code"] == "road_route_changed"
    with store.engine.connect() as conn:
        assert conn.execute(select(dispatch._trips.c.id)).scalars().all() == [saved["id"]]


def test_reuse_broker_retains_service_without_old_owner_certificate(store, monkeypatch):
    api = _setup(store, monkeypatch)
    body = _broker()
    _save(
        store,
        deliveries=deepcopy(body["deliveries"]),
        policy=route_memory.constraint_policy(body),
        owner="old",
    )
    route_id = api.get("/api/v1/dispatch/routes").json()["items"][0]["id"]
    result = api.post(f"/api/v1/dispatch/routes/{route_id}/reuse", json={"vehicle_id": "van2"})
    assert result.status_code == 201, result.text
    reused = result.json()
    assert reused["status"] == "ready" and reused["route"]["duration_seconds"] == 360
    assert [s["eta_seconds"] for s in reused["stops"]] == [0, 240]
    with store.engine.connect() as conn:
        row = (
            conn.execute(select(dispatch._trips).where(dispatch._trips.c.id == reused["id"]))
            .mappings()
            .one()
        )
    stored = json.loads(row["request_json"])
    assert "owner_run_id" not in stored and "broker_plan" not in stored
    assert stored["service_seconds"] == 120 and stored["includes_origin"]


def test_preview_rejects_duplicate_ids_and_coordinates_outside_service(store, monkeypatch):
    api = _setup(store, monkeypatch)
    deliveries = [{"id": "a", "pickup": PICKUP, "dropoff": DROP, "parcels": 2}] * 2
    result = api.post("/api/v1/dispatch/preview", json={"deliveries": deliveries})
    assert result.status_code == 422 and result.json()["detail"]["code"] == "duplicate_delivery_id"
    deliveries = deepcopy(deliveries[:1])
    deliveries[0]["dropoff"]["coordinates"] = [-79, 43]
    result = api.post("/api/v1/dispatch/preview", json={"deliveries": deliveries})
    assert result.status_code == 422 and result.json()["detail"]["code"] == "outside_service_area"
