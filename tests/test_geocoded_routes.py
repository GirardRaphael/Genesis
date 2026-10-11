"""Selected geocoder place contract through preview, manual and broker APIs."""

from datetime import timedelta

from fastapi.testclient import TestClient

from genesis import dispatch
from genesis.api import create_app
from genesis.broker_runtime import BrokerRuntime
from test_broker_runtime import _matrix, _route


def test_geocoder_metadata_is_not_a_delivery_place(store, monkeypatch):
    monkeypatch.setattr(dispatch, "_geocode_cache", {})
    monkeypatch.setattr(dispatch.time, "sleep", lambda _: None)
    monkeypatch.setattr(dispatch, "_road_route", _route)
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)

    def geocoder(_url, params=None):
        return {"features": [
            {"geometry": {"coordinates": [-73.56 + index * 0.01, 45.50]},
             "properties": {"osm_id": 100 + index, "name": f"Public test place {index}"}}
            for index in range(3)
        ]}

    monkeypatch.setattr(dispatch, "_provider_json", geocoder)
    api = TestClient(create_app(store))
    found = api.get("/api/v1/dispatch/geocode", params={"q": "public test"})
    assert found.status_code == 200
    results = found.json()["items"]
    assert [place["id"] for place in results] == ["100", "101", "102"]
    raw_deliveries = [
        {"pickup": results[0], "dropoff": results[1], "parcels": 2},
        {"pickup": results[1], "dropoff": results[2], "parcels": 3},
    ]
    # Reproduce the rejected pre-fix payload without weakening the API boundary.
    for endpoint, body in [
        ("preview", {"deliveries": raw_deliveries}),
        ("trips", {"deliveries": raw_deliveries, "vehicle_id": "van1"}),
        ("plans", {"deliveries": raw_deliveries, "depot": results[0], "mode": "fixture"}),
    ]:
        rejected = api.post(f"/api/v1/dispatch/{endpoint}", json=body)
        assert rejected.status_code == 422
        assert rejected.json()["error"]["code"] == "invalid_input"
    assert api.get("/api/v1/dispatch/trips").json()["items"] == []
    assert store.list_runs() == []

    # Same wire shape emitted by the shared address picker's corrected selection.
    places = [{"label": place["label"], "coordinates": place["coordinates"]} for place in results]
    deliveries = [
        {"pickup": places[0], "dropoff": places[1], "parcels": 2},
        {"pickup": places[1], "dropoff": places[2], "parcels": 3},
    ]
    preview = api.post("/api/v1/dispatch/preview", json={"deliveries": deliveries})
    assert preview.status_code == 200, preview.text
    assert len(preview.json()["stops"]) == 4
    assert api.get("/api/v1/dispatch/trips").json()["items"] == []

    manual = api.post("/api/v1/dispatch/trips", json={"vehicle_id": "van4", "deliveries": deliveries})
    assert manual.status_code == 201, manual.text
    assert len(manual.json()["stops"]) == 4
    assert api.post(f"/api/v1/dispatch/trips/{manual.json()['id']}/start").status_code == 200

    plan = api.post("/api/v1/dispatch/plans", json={
        "deliveries": deliveries, "depot": places[0], "vehicle_ids": ["van1", "van2"],
        "mode": "fixture", "objective": "cost",
    })
    assert plan.status_code == 202, plan.text
    BrokerRuntime(store, store.claim("geocoded-route-test")).execute()
    result = api.get(f"/api/v1/dispatch/plans/{plan.json()['id']}").json()
    assert result["status"] == "succeeded"
    assert result["final_kind"] == "accepted_plan"
    assert result["certificate"]["valid"]
    assert len(result["agents"]) == 5
    assert result["created_trip_ids"]
    assert api.get(f"/api/v1/runs/{plan.json()['id']}/usage").json()["attempts"] == []
    for trip_id in result["created_trip_ids"]:
        assert api.post(f"/api/v1/dispatch/trips/{trip_id}/start").status_code == 200
    future = dispatch._utc_now() + timedelta(hours=1)
    monkeypatch.setattr(dispatch, "_utc_now", lambda: future)
    for trip_id in [manual.json()["id"], *result["created_trip_ids"]]:
        completed = api.get(f"/api/v1/dispatch/trips/{trip_id}").json()
        assert completed["status"] == "completed"
        assert completed["progress"]["completed_stop_count"] == len(completed["stops"])
