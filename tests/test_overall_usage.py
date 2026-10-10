from decimal import Decimal

from fastapi.testclient import TestClient

from genesis.api import create_app
from genesis.workflow import agent_id


def test_overall_cost_includes_all_requests_and_reconciles_ledger(store):
    ids = []
    for scenario, cost in [("S01", "0.01"), ("S02", "0.02")]:
        row = store.create_run(
            dict(
                scenario_id=scenario, policy="baseline_only", seed=17, mode="live", budget_usd="1"
            ),
            scenario,
        )
        ids.append(row["id"])
        attempt = scenario + "-attempt"
        store.reserve(row["id"], attempt, "0.10")
        store.settle(row["id"], attempt, cost)
        invocation = agent_id(row["id"], "planning")
        store.append_event(
            row["id"],
            "model.started",
            {"attempt_id": attempt, "attempt": 1, "requested_model": "test-model"},
            invocation,
        )
        store.append_event(
            row["id"],
            "model.completed",
            {
                "attempt_id": attempt,
                "attempt": 1,
                "resolved_model": "test-model",
                "input_tokens": 100,
                "output_tokens": 50,
                "cost_usd": cost,
                "duration_ms": 1,
            },
            invocation,
        )
    store.reserve(ids[1], "pending", "0.05")
    client = TestClient(create_app(store))
    overall = client.get("/api/v1/usage/overall").json()
    assert overall["total_requests"] == 2
    assert Decimal(overall["totals"]["cost_usd"]) == Decimal("0.03")
    assert Decimal(overall["budget"]["known_cost_usd"]) == Decimal("0.03")
    assert Decimal(overall["budget"]["held_usd"]) == Decimal("0.05")
    assert Decimal(overall["budget"]["remaining_budget_cad"]) == Decimal("99.84")
    selected = client.get("/api/v1/usage?scenario_id=S01").json()
    assert Decimal(selected["totals"]["cost_usd"]) == Decimal("0.01")
    assert overall["scope"] == "all stored requests, independent of dashboard filters"
