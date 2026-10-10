import pytest

from genesis.telemetry import usage_projection
from genesis.workflow import agent_id


def test_individual_call_projection_counts_leaf_usage_once(store):
    row = store.create_run(
        dict(scenario_id="S01", policy="baseline_only", seed=17, mode="live", budget_usd="1"),
        "usage",
    )
    invocation = agent_id(row["id"], "planning")
    store.append_event(
        row["id"],
        "model.started",
        {
            "attempt_id": "call-a",
            "attempt": 1,
            "requested_model": "test-model",
            "reservation_usd": "0.01",
        },
        invocation,
    )
    projection = usage_projection(store, [row])
    assert projection["totals"]["running"] == 1 and projection["totals"]["total_tokens"] is None
    assert len(store.list_runs({"agent": "planning", "model": "test-model"})) == 1
    assert usage_projection(store, [row], as_of_seq=1)["totals"]["calls"] == 0
    store.append_event(
        row["id"],
        "model.completed",
        {
            "attempt_id": "call-a",
            "attempt": 1,
            "resolved_model": "test-model",
            "input_tokens": 1000,
            "output_tokens": 300,
            "cached_input_tokens": 200,
            "reasoning_output_tokens": 50,
            "cost_usd": "0.0015",
            "duration_ms": 25,
            "usage_source": "provider",
        },
        invocation,
    )
    store.append_event(
        row["id"],
        "model.started",
        {
            "attempt_id": "call-b",
            "attempt": 2,
            "requested_model": "test-model",
            "reservation_usd": "0.01",
        },
        invocation,
    )
    store.append_event(
        row["id"],
        "model.failed",
        {
            "attempt_id": "call-b",
            "attempt": 2,
            "cost_usd": "0",
            "error_code": "insufficient_quota",
            "duration_ms": 10,
        },
        invocation,
    )
    projection = usage_projection(store, [row])
    assert projection["totals"]["total_tokens"] == 1300
    assert projection["totals"]["cost_usd"] == "0.0015"
    assert projection["totals"]["usage_coverage"] == 0.5
    assert projection["models"][0]["errors"] == 1
    assert projection["models"][0]["retries"] == 1
    assert projection["agents"][0]["calls"] == 2
    assert not usage_projection(store, [row], model="other")["attempts"]
    first_call_only = usage_projection(store, [row], as_of_seq=3)
    assert first_call_only["totals"]["total_tokens"] == 1300
    assert first_call_only["totals"]["calls"] == 1
    selected = store.history(row["id"], kinds={"model.completed"})
    assert len(selected) == 1 and selected[0]["run_seq"] == 3


def test_fixture_meter_does_not_fabricate_model_tokens(store):
    row = store.create_run(
        dict(scenario_id="S01", policy="baseline_only", seed=17, mode="fixture", budget_usd=None),
        "fixture-usage",
    )
    projection = usage_projection(store, [row])
    assert projection["totals"]["calls"] == 0
    assert projection["totals"]["total_tokens"] is None and projection["totals"]["cost_usd"] is None


@pytest.mark.parametrize(
    "terminal", ["completed", "failed", "cancelled", "timed_out", "budget_exceeded"]
)
def test_terminal_recovery_closes_active_call_without_fabricating_billing(store, terminal):
    row = store.create_run(
        dict(scenario_id="S01", policy="baseline_only", seed=17, mode="live", budget_usd="1"),
        "interruption",
    )
    store.reserve(row["id"], "uncertain-call", "0.02")
    started = store.append_event(
        row["id"],
        "model.started",
        {
            "attempt_id": "uncertain-call",
            "requested_model": "test-model",
            "reservation_usd": "0.02",
        },
        agent_id(row["id"], "planning"),
    )
    store.append_event(row["id"], f"run.{terminal}", {"billing_uncertain": True})
    historical = usage_projection(store, [row], as_of_seq=started["run_seq"])
    assert historical["totals"]["running"] == 1 and historical["totals"]["errors"] == 0
    current = usage_projection(store, [row])
    assert current["totals"]["running"] == 0 and current["totals"]["errors"] == 1
    call = current["attempts"][0]
    assert call["status"] == "interrupted" and call["billing_uncertain"]
    assert call["input_tokens"] is None and call["cost_usd"] is None and call["duration_ms"] is None
    assert len(store.held(row["id"])) == 1 and store.budget_state()["held_usd"] == "0.02"
