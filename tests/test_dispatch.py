"""Dispatch tests use recorded-shape provider responses, never public networks."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from genesis import dispatch


PICKUP = {"label": "Rue Saint-Paul, Montréal", "coordinates": [-73.554, 45.502]}
DROP = {"label": "Avenue du Mont-Royal, Montréal", "coordinates": [-73.581, 45.524]}
DROP_2 = {"label": "Rue Sherbrooke, Montréal", "coordinates": [-73.594, 45.509]}


def client(store):
    app = FastAPI()
    app.state.store = store
    dispatch.register_dispatch(app)
    return TestClient(app)


def request(deliveries=None):
    return {
        "name": "Tournée locale",
        "vehicle_id": "van1",
        "deliveries": deliveries or [{"pickup": PICKUP, "dropoff": DROP, "parcels": 40}],
    }


def road_response(url, params=None):
    pairs = [
        list(map(float, part.split(","))) for part in url.split("/route/v1/driving/")[1].split(";")
    ]
    legs = [
        {
            "duration": 0 if a == b else 120,
            "distance": 0 if a == b else 1000,
            "steps": [{"geometry": {"type": "LineString", "coordinates": [a, b]}}],
        }
        for a, b in zip(pairs, pairs[1:])
    ]
    return {
        "code": "Ok",
        "waypoints": [{"distance": 10} for _ in pairs],
        "routes": [{"geometry": {"type": "LineString", "coordinates": pairs}, "legs": legs}],
    }


def test_multiple_deliveries_persist_order_and_idempotency(store, monkeypatch):
    calls = []

    def route(url, params=None):
        calls.append(url)
        return road_response(url, params)

    monkeypatch.setattr(dispatch, "_provider_json", route)
    api = client(store)
    body = request(
        [
            {"id": "a", "pickup": PICKUP, "dropoff": DROP, "parcels": 40},
            {"id": "b", "pickup": DROP, "dropoff": DROP_2, "parcels": 40},
        ]
    )
    first = api.post("/api/v1/dispatch/trips", json=body, headers={"Idempotency-Key": "same"})
    assert first.status_code == 201, first.text
    trip = first.json()
    assert [stop["id"] for stop in trip["stops"]] == [
        "a:pickup",
        "a:dropoff",
        "b:pickup",
        "b:dropoff",
    ]
    assert [stop["eta_seconds"] for stop in trip["stops"]] == [0, 120, 120, 240]
    assert trip["route"]["distance_km"] == 2
    assert trip["tracking_mode"] == "simulation"
    assert trip["status"] == "ready"
    assert (
        api.post("/api/v1/dispatch/trips", json=body, headers={"Idempotency-Key": "same"}).json()[
            "id"
        ]
        == trip["id"]
    )
    assert len(calls) == 1
    assert (
        api.post(
            "/api/v1/dispatch/trips", json=request(), headers={"Idempotency-Key": "same"}
        ).status_code
        == 409
    )
    assert api.get("/api/v1/dispatch/trips").json()["items"][0]["id"] == trip["id"]
    # A fresh app can read the same trip from the separate dispatch table.
    assert client(store).get(f"/api/v1/dispatch/trips/{trip['id']}").json()["id"] == trip["id"]


def test_start_progress_cancel_retains_record(store, monkeypatch):
    monkeypatch.setattr(dispatch, "_provider_json", road_response)
    api = client(store)
    trip = api.post("/api/v1/dispatch/trips", json=request()).json()
    started = api.post(f"/api/v1/dispatch/trips/{trip['id']}/start").json()
    assert started["status"] == "running"
    assert started["stops"][0]["status"] == "completed"
    assert started["stops"][1]["status"] == "pending"
    start_time = dispatch._utc_now()
    monkeypatch.setattr(dispatch, "_utc_now", lambda: start_time + timedelta(seconds=1))
    halfway = api.get(f"/api/v1/dispatch/trips/{trip['id']}").json()
    assert 0.49 <= halfway["progress"]["fraction"] <= 0.51
    assert halfway["progress"]["completed_stop_count"] == 1
    cancelled = api.post(f"/api/v1/dispatch/trips/{trip['id']}/cancel").json()
    assert cancelled["status"] == "cancelled"
    assert api.post(f"/api/v1/dispatch/trips/{trip['id']}/start").status_code == 409
    assert api.get(f"/api/v1/dispatch/trips/{trip['id']}").json()["cancelled_at"]


def test_completed_projection_uses_simulation_clock(store, monkeypatch):
    monkeypatch.setattr(dispatch, "_provider_json", road_response)
    api = client(store)
    trip = api.post("/api/v1/dispatch/trips", json=request()).json()
    api.post(f"/api/v1/dispatch/trips/{trip['id']}/start")
    future = dispatch._utc_now() + timedelta(seconds=3)
    monkeypatch.setattr(dispatch, "_utc_now", lambda: future)
    completed = api.get(f"/api/v1/dispatch/trips/{trip['id']}").json()
    assert completed["status"] == "completed"
    assert completed["completed_at"]
    assert completed["progress"]["fraction"] == 1
    assert completed["progress"]["completed_stop_count"] == 2
    assert completed["progress"]["coordinate"] == completed["route"]["coordinates"][-1]
    assert api.post(f"/api/v1/dispatch/trips/{trip['id']}/cancel").status_code == 409


def test_vehicle_cannot_start_two_active_trips(store, monkeypatch):
    monkeypatch.setattr(dispatch, "_provider_json", road_response)
    api = client(store)
    first = api.post("/api/v1/dispatch/trips", json=request()).json()["id"]
    second = api.post("/api/v1/dispatch/trips", json=request()).json()["id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda trip_id: api.post(f"/api/v1/dispatch/trips/{trip_id}/start"), [first, second]
            )
        )
    assert sorted(result.status_code for result in results) == [200, 409]
    assert (
        next(result.json()["detail"]["code"] for result in results if result.status_code == 409)
        == "vehicle_busy"
    )
    running = next(
        trip_id
        for trip_id in [first, second]
        if api.get(f"/api/v1/dispatch/trips/{trip_id}").json()["status"] == "running"
    )
    waiting = second if running == first else first
    api.post(f"/api/v1/dispatch/trips/{running}/cancel")
    blocked = api.post(f"/api/v1/dispatch/trips/{waiting}/start")
    assert (
        blocked.status_code == 409 and blocked.json()["detail"]["code"] == "cargo_recovery_required"
    )
    fleet = dispatch.fleet_snapshot(store.engine, ["van1"], PICKUP)["vehicles"][0]
    assert not fleet["available"] and fleet["unresolved_cargo_parcels"] == 40


def test_cancelling_before_pickup_does_not_create_phantom_cargo(store, monkeypatch):
    monkeypatch.setattr(dispatch, "_provider_json", road_response)
    api = client(store)
    first = api.post("/api/v1/dispatch/trips", json=request()).json()["id"]
    api.post(f"/api/v1/dispatch/trips/{first}/cancel")
    fleet = dispatch.fleet_snapshot(store.engine, ["van1"], PICKUP)["vehicles"][0]
    assert fleet["available"] and fleet["unresolved_cargo_parcels"] == 0
    second = api.post("/api/v1/dispatch/trips", json=request()).json()["id"]
    assert api.post(f"/api/v1/dispatch/trips/{second}/start").status_code == 200


def test_bounds_and_provider_failure_do_not_save_false_road_route(store, monkeypatch):
    api = client(store)
    outside = request()
    outside["deliveries"][0]["dropoff"] = {"label": "Toronto", "coordinates": [-79.4, 43.7]}
    assert api.post("/api/v1/dispatch/trips", json=outside).status_code == 422
    overloaded = request()
    overloaded["deliveries"][0]["parcels"] = 41
    assert api.post("/api/v1/dispatch/trips", json=overloaded).status_code == 422
    monkeypatch.setattr(dispatch, "_provider_json", lambda url, params=None: {"code": "NoRoute"})
    failed = api.post("/api/v1/dispatch/trips", json=request())
    assert failed.status_code == 422
    assert failed.json()["detail"]["code"] == "road_route_unavailable"
    assert api.get("/api/v1/dispatch/trips").json()["items"] == []


def test_geocode_filters_to_area_and_caches(store, monkeypatch):
    dispatch._geocode_cache.clear()
    calls = []

    def provider(url, params=None):
        calls.append(params)
        return {
            "features": [
                {
                    "geometry": {"coordinates": [-73.55, 45.5]},
                    "properties": {"osm_id": 1, "name": "Hôtel de Ville", "city": "Montréal"},
                },
                {
                    "geometry": {"coordinates": [-79.4, 43.7]},
                    "properties": {"osm_id": 2, "name": "Toronto"},
                },
            ]
        }

    monkeypatch.setattr(dispatch, "_provider_json", provider)
    api = client(store)
    first = api.get("/api/v1/dispatch/geocode?q=Hôtel%20de%20Ville")
    assert first.status_code == 200
    assert len(first.json()["items"]) == 1
    assert first.json()["items"][0]["coordinates"] == [-73.55, 45.5]
    assert calls == [
        {"q": "Hôtel de Ville", "bbox": "-74.05,45.38,-73.42,45.74", "limit": 5, "lang": "fr"}
    ]
    assert api.get("/api/v1/dispatch/geocode?q=Hôtel%20de%20Ville").json() == first.json()
    assert len(calls) == 1
    assert api.get("/api/v1/dispatch/geocode?q=%20%20%20").status_code == 422
