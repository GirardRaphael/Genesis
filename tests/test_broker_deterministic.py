"""The operator's deterministic policy still runs the complete certified workflow."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from genesis.broker_runtime import BrokerRuntime
from genesis.api import create_app
from genesis.db import reservations
from genesis.dispatch import _trips
from genesis.telemetry import usage_projection
from test_broker_runtime import _matrix, _request, _route


@pytest.mark.parametrize("mode", ["live", "fixture"])
def test_none_policy_has_five_roles_and_ready_trips_without_model_or_budget(
    store, monkeypatch, mode
):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    monkeypatch.setattr(
        "genesis.workflow.ModelAdapter",
        lambda *_args: pytest.fail("Deterministic planning must never construct a model adapter"),
    )
    monkeypatch.setattr(
        "genesis.broker_api.live_configuration",
        lambda *_args: pytest.fail("Deterministic plans must not validate model configuration"),
    )
    request = {**_request(), "mode": mode, "explanation_policy": "none"}
    body = {k: v for k, v in request.items() if k not in {
        "workflow_kind", "scenario_id", "policy", "seed", "budget_usd"
    }}
    response = TestClient(create_app(store)).post("/api/v1/dispatch/plans", json=body)
    assert response.status_code == 202
    row = store.get_run(response.json()["id"])
    assert row["request"]["budget_usd"] is None
    BrokerRuntime(store, store.claim("deterministic-worker")).execute()
    completed = store.get_run(row["id"])
    detail = completed["detail"]
    assert completed["status"] == "succeeded"
    assert detail["certificate"]["valid"]
    assert detail["final_kind"] == "accepted_plan"
    assert detail["created_trip_ids"]
    assert len(detail["handoffs"]) == 5
    roles = ["planning", "traffic", "optimization", "monitoring", "exception"]
    assert [agent["role"] for agent in detail["agents"]] == roles
    reason = "not_applicable_deterministic_policy" if mode == "live" else "not_applicable_fixture"
    for agent in detail["agents"]:
        assert agent["status"] == "succeeded"
        assert agent["duration_ms"] >= 0
        assert agent["tool_calls"]
        assert agent["output"]["evidence_refs"]
        assert agent["input_tokens"] is agent["output_tokens"] is agent["cost"] is None
        assert agent["model"] is agent["requested_model"] is None
        assert agent["usage_source"] == reason
    events = store.history(row["id"])
    assert not any(event["kind"] == "model.started" for event in events)
    omitted = [event for event in events if event["kind"] == "model.omitted"]
    assert len(omitted) == (5 if mode == "live" else 0)
    assert all(event["payload"]["usage_source"] == reason for event in omitted)
    assert detail["route_memory"]["planned_explanation_calls"] == 0
    assert detail["route_memory"]["omitted_explanation_roles"] == (roles if mode == "live" else [])
    assert usage_projection(store, [completed])["totals"]["calls"] == 0
    with store.engine.connect() as conn:
        assert not conn.execute(select(reservations).where(reservations.c.run_id == row["id"])).first()
        trips = conn.execute(select(_trips).where(_trips.c.id.in_(detail["created_trip_ids"]))).mappings().all()
    assert all(trip["status"] == "ready" for trip in trips)


def test_deterministic_tool_failure_does_not_claim_a_requested_model(store, monkeypatch):
    monkeypatch.setenv("GENESIS_ANTHROPIC_ECONOMY_MODEL", "configured-but-not-requested")
    monkeypatch.setattr("genesis.workflow.ModelAdapter", lambda *_args: pytest.fail("No model allowed"))
    def unavailable(_nodes):
        raise RuntimeError("Road service unavailable")
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", unavailable)
    row = store.create_run({**_request(), "mode": "live", "explanation_policy": "none"}, "failed-road")
    with pytest.raises(RuntimeError, match="Road service"):
        BrokerRuntime(store, store.claim("deterministic-worker")).execute()
    failed = next(a for a in store.get_run(row["id"])["detail"]["agents"] if a["status"] == "failed")
    assert failed["role"] == "traffic"
    assert failed["model"] is failed["requested_model"] is failed["cost"] is None
    assert failed["usage_source"] == "not_applicable_deterministic_policy"
    assert not any(event["kind"] == "model.started" for event in store.history(row["id"]))
