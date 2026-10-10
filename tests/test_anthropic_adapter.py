import json
from types import SimpleNamespace
from pathlib import Path
from datetime import datetime, timedelta, timezone

import pytest

from genesis.llm import ModelAdapter, BillingUncertain, LiveUnavailable, live_configuration
from genesis.workflow import agent_id
from genesis.telemetry import usage_projection


def adapter(store, monkeypatch, response):
    monkeypatch.setenv("GENESIS_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-unit-placeholder")
    monkeypatch.setenv("GENESIS_ANTHROPIC_MODEL", "claude-sonnet-5-5")
    price = next(
        p
        for p in json.loads(Path("config/anthropic-prices.json").read_text())["prices"]
        if p["model"] == "claude-sonnet-5-5"
    )
    current = datetime.now(timezone.utc)
    price.update(
        effective_at=(current - timedelta(days=1)).isoformat(),
        expires_at=(current + timedelta(days=1)).isoformat(),
        retrieved_at=current.isoformat(),
    )
    price_file = Path(store.engine.url.database).parent / "test-prices.json"
    price_file.write_text(json.dumps(price), encoding="utf-8")
    monkeypatch.setenv("GENESIS_PRICE_FILE", str(price_file))
    requests = []

    class Client:
        def __init__(self, **kwargs):
            assert kwargs["max_retries"] == 0
            self.messages = self

        def create(self, **kwargs):
            requests.append(kwargs)
            return response

    monkeypatch.setattr("anthropic.Anthropic", Client)
    row = store.create_run(
        dict(
            scenario_id="S01",
            policy="baseline_only",
            seed=17,
            mode="live",
            budget_usd="1",
            provider="anthropic",
            model_policy={"planning": "claude-sonnet-5-5"},
        ),
        "anthropic-test",
    )
    claimed = store.claim("test-worker")
    return (
        ModelAdapter(store, row["id"], (claimed["owner"], claimed["generation"]), "planning"),
        row,
        requests,
    )


def message(stop_reason="end_turn", usage=True):
    return SimpleNamespace(
        id="provider-test-response",
        model="claude-sonnet-5-5",
        stop_reason=stop_reason,
        usage=SimpleNamespace(
            input_tokens=1000,
            output_tokens=300,
            cache_read_input_tokens=200,
            cache_creation_input_tokens=100,
        )
        if usage
        else None,
        content=[
            SimpleNamespace(type="thinking", thinking="must never be persisted"),
            SimpleNamespace(
                type="text",
                text=json.dumps(
                    {"summary": "Verified synthetic work order", "evidence_refs": ["known-source"]}
                ),
            ),
        ],
    )


def test_anthropic_call_category_accounting_and_no_hidden_thinking(store, monkeypatch):
    model, row, requests = adapter(store, monkeypatch, message())
    output, usage = model.explain(
        "planning",
        "Explain evidence",
        {"evidence_refs": ["known-source"]},
        agent_id(row["id"], "planning"),
    )
    assert output["summary"] == "Verified synthetic work order"
    assert usage["input_tokens"] == 1300 and usage["output_tokens"] == 300
    assert usage["cached_input_tokens"] == 200 and usage["cache_creation_input_tokens"] == 100
    assert (
        usage["cost_usd"] == "0.00542"
    )  # $2 input/$10 output/$4 upper cache writes/$0.10 cache reads per M
    assert requests[0]["output_config"]["format"]["type"] == "json_schema"
    assert requests[0]["service_tier"] == "standard_only"
    assert "tools" not in requests[0]
    events = store.history(row["id"])
    assert "must never be persisted" not in json.dumps(events)
    projected = usage_projection(store, [row])
    assert projected["totals"]["total_tokens"] == 1600
    assert projected["totals"]["completed"] == 1


def test_billed_incomplete_anthropic_call_is_failed_once(store, monkeypatch):
    model, row, _ = adapter(store, monkeypatch, message("max_tokens"))
    with pytest.raises(RuntimeError, match="did not complete"):
        model.explain(
            "planning",
            "Explain",
            {"evidence_refs": ["known-source"]},
            agent_id(row["id"], "planning"),
        )
    projected = usage_projection(store, [row])
    assert projected["totals"]["errors"] == 1 and projected["totals"]["completed"] == 0
    assert (
        projected["totals"]["total_tokens"] == 1600 and projected["totals"]["cost_usd"] == "0.00542"
    )
    assert not store.held(row["id"])


def test_anthropic_missing_usage_holds_reservation_and_closes_attempt(store, monkeypatch):
    model, row, _ = adapter(store, monkeypatch, message(usage=False))
    with pytest.raises(BillingUncertain):
        model.explain(
            "planning",
            "Explain",
            {"evidence_refs": ["known-source"]},
            agent_id(row["id"], "planning"),
        )
    assert store.held(row["id"])
    projected = usage_projection(store, [row])
    assert projected["totals"]["running"] == 0 and projected["totals"]["errors"] == 1
    assert projected["totals"]["cost_usd"] is None


def test_openai_execution_is_rejected_even_with_key_and_legacy_run(store, monkeypatch):
    monkeypatch.setenv("GENESIS_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-disabled-placeholder")
    with pytest.raises(LiveUnavailable, match="Only Anthropic"):
        live_configuration()
    monkeypatch.setenv("GENESIS_PROVIDER", "anthropic")
    row = store.create_run(
        dict(
            scenario_id="S01",
            policy="baseline_only",
            seed=17,
            mode="live",
            budget_usd="1",
            provider="openai",
        ),
        "legacy-provider",
    )
    with pytest.raises(LiveUnavailable, match="no longer active"):
        ModelAdapter(store, row["id"], None, "planning")
    assert not store.held(row["id"])
