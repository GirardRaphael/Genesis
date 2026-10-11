"""Actionable field paths without reflecting private submitted values."""

from fastapi.testclient import TestClient
from genesis.api import create_app


def test_validation_feedback_is_bounded_and_redacted(store):
    client = TestClient(create_app(store))
    response = client.post("/api/v1/dispatch/preview", json={
        "deliveries": [{
            "pickup": {"label": "PRIVATE-CUSTOMER", "coordinates": [-73.57, 45.5]},
            "dropoff": {"label": "Destination", "coordinates": [-73.58, 45.51]},
            "parcels": 0,
            "PRIVATE-SECRET-FIELD": "NEVER-ECHO-ME",
        }],
    })
    assert response.status_code == 422
    error = response.json()["error"]
    assert "deliveries.0.parcels" in error["message"]
    assert {"field": "deliveries.0.parcels", "code": "greater_than_equal"} in error["fields"]
    assert all(secret not in response.text for secret in (
        "PRIVATE-CUSTOMER", "PRIVATE-SECRET-FIELD", "NEVER-ECHO-ME",
    ))
    assert len(error["fields"]) <= 20
