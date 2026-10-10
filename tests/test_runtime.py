from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from genesis.api import create_app
from genesis.db import BudgetExceeded, Conflict, LostLease, Store, budgets, reservations, PROJECT_ID
from sqlalchemy import select
from genesis.llm import LiveUnavailable, live_configuration
from genesis.worker import run_once
from genesis.workflow import Runtime


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("GENESIS_CHECKPOINT_PATH", str(tmp_path / "checkpoints.sqlite"))
    monkeypatch.setenv("GENESIS_GLOBAL_BUDGET_CAD", "100")
    monkeypatch.setenv("GENESIS_CAD_PER_USD", "2")
    return Store(f"sqlite:///{tmp_path / 'runs.sqlite'}")


def request(mode="fixture", budget=None):
    return dict(scenario_id="S01", policy="baseline_only", seed=17, mode=mode, budget_usd=budget)


def test_fixture_workflow_persistence_and_api(store):
    client = TestClient(create_app(store))
    response = client.post("/api/v1/runs", json=request(), headers={"Idempotency-Key": "first"})
    assert response.status_code == 202
    run_id = response.json()["id"]
    assert run_once(store)
    detail = client.get(f"/api/v1/runs/{run_id}").json()
    assert detail["status"] == "succeeded"
    assert detail["certificate"]["valid"]
    assert len(detail["agents"]) == 5 and len(detail["handoffs"]) == 5
    assert all(a["input_tokens"] is None and a["cost"] is None for a in detail["agents"])
    assert detail["provenance"] == "fixture"
    history = client.get(f"/api/v1/runs/{run_id}/events?limit=500").json()["items"]
    assert [e["run_seq"] for e in history] == list(range(1, len(history) + 1))
    assert sum(e["kind"] == "agent.completed" for e in history) == 5
    assert not any(e["kind"].startswith("model.") for e in history)
    metrics = client.get("/api/v1/metrics").json()
    assert metrics["fixture_runs"] == 1 and metrics["live_runs"] == 0
    assert metrics["total_tokens"] is None and metrics["api_cost_usd"] is None
    artifact = client.get(f"/api/v1/artifacts/{detail['final_artifact_id']}")
    assert artifact.status_code == 200
    stream = client.get(f"/api/v1/runs/{run_id}/stream?after_seq={len(history) - 1}")
    assert f"id: {len(history)}" in stream.text and "event: genesis" in stream.text


def test_run_and_event_idempotency(store):
    row = store.create_run(request(), "same")
    assert store.create_run(request(), "same")["id"] == row["id"]
    with pytest.raises(Conflict):
        store.create_run({**request(), "seed": 29}, "same")
    event_id = str(uuid4())
    first = store.append_event(row["id"], "test", {"x": 1}, event_id=event_id)
    assert (
        store.append_event(row["id"], "test", {"x": 1}, event_id=event_id)["run_seq"]
        == first["run_seq"]
    )
    with pytest.raises(Conflict):
        store.append_event(row["id"], "test", {"x": 2}, event_id=event_id)


def test_concurrent_event_sequences(store):
    run_id = store.create_run(request(), "concurrent")["id"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda i: store.append_event(run_id, "test", {"i": i}), range(16)))
    assert [e["run_seq"] for e in store.history(run_id)] == list(range(1, 18))


def test_queued_cancel_is_terminal_and_not_claimed(store):
    run_id = store.create_run(request(), "cancel")["id"]
    assert store.cancel(run_id)["status"] == "cancelled"
    assert store.claim("worker") is None
    assert store.cancel(run_id)["status"] == "cancelled"


def test_lease_fences_old_worker(store):
    store.create_run(request(), "lease")
    old = store.claim("old", lease_seconds=-1)
    new = store.claim("new")
    assert new["id"] == old["id"] and new["generation"] == old["generation"] + 1
    with pytest.raises(LostLease):
        store.append_event(old["id"], "test", {}, fence=(old["owner"], old["generation"]))


def test_persisted_role_resumes_without_duplicate_completion(store):
    store.create_run(request(), "resume")
    old = store.claim("old", lease_seconds=-1)
    runtime = Runtime(store, old)
    runtime.node("planning", runtime.planning)({"run_id": old["id"]})
    assert run_once(store, "new")
    row = store.get_run(old["id"])
    assert row["status"] == "succeeded"
    assert sum(e["kind"] == "agent.completed" for e in store.history(old["id"])) == 5
    assert any(e["kind"] == "run.resumed" for e in store.history(old["id"]))
    assert row["detail"]["duration_ms"] is None


def test_global_budget_race_and_uncertain_holds(store):
    ids = [store.create_run(request("live", "50"), str(i))["id"] for i in range(2)]

    def reserve(run_id):
        try:
            store.reserve(run_id, str(uuid4()), "30")
            return True
        except BudgetExceeded:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, ids))
    assert sorted(results) == [False, True]
    assert sum(Decimal(r["amount"]) for run_id in ids for r in store.held(run_id)) == 30
    rejected_id = ids[results.index(False)]
    with pytest.raises(BudgetExceeded):
        store.reserve(rejected_id, str(uuid4()), "21")


def test_settlement_releases_only_known_unused_amount(store):
    run_id = store.create_run(request("live", "1"), "settlement")["id"]
    store.reserve(run_id, "call-1", "0.75")
    store.settle(run_id, "call-1", "0.20")
    store.settle(run_id, "call-1", "0.20")
    with pytest.raises(Conflict):
        store.settle(run_id, "call-1", "0.30")
    store.reserve(run_id, "call-2", "0.80")
    with pytest.raises(BudgetExceeded):
        store.settle(run_id, "call-2", "0.81")
    assert len(store.held(run_id)) == 0
    with store.engine.connect() as connection:
        exposure = (
            connection.execute(select(reservations).where(reservations.c.attempt_id == "call-2"))
            .mappings()
            .one()
        )
        assert exposure["settled"] == "0.81" and exposure["status"] == "overrun"
    with pytest.raises(BudgetExceeded):
        store.reserve(run_id, "call-3", "0.01")


def test_known_overrun_freezes_project_across_restarts(store):
    run_id = store.create_run(request("live", "50"), "overrun")["id"]
    store.reserve(run_id, "small", "0.10")
    with pytest.raises(BudgetExceeded):
        store.settle(run_id, "small", "0.20")
    restarted = Store(str(store.engine.url))
    other = restarted.create_run(request("live", "50"), "other")["id"]
    with pytest.raises(BudgetExceeded, match="frozen"):
        restarted.reserve(other, "new-call", "49.90")
    with restarted.engine.connect() as connection:
        assert (
            connection.execute(select(budgets).where(budgets.c.project_id == PROJECT_ID))
            .mappings()
            .one()["frozen"]
        )
    assert any(e["kind"] == "billing.overrun" for e in restarted.history(run_id))


def test_no_key_live_fails_closed_without_fixture_fallback(store, monkeypatch):
    monkeypatch.setenv("GENESIS_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(LiveUnavailable):
        live_configuration()
    client = TestClient(create_app(store))
    response = client.post("/api/v1/runs", json=request("live", "1"))
    assert response.status_code == 503 and response.json()["error"]["code"] == "live_unavailable"
    assert not store.list_runs()


def test_api_boundaries_and_cursors(store):
    client = TestClient(create_app(store))
    assert client.get("/api/v1/runs?limit=201").status_code == 422
    assert client.get("/api/v1/runs?scenario_id=bad").status_code == 422
    assert client.get("/api/v1/runs/bad-id").status_code == 422
    assert client.get("/api/v1/runs", headers={"Host": "evil.example"}).status_code == 403
    assert (
        client.post(
            "/api/v1/runs", json=request(), headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    run_id = store.create_run(request(), "cursor")["id"]
    assert client.get(f"/api/v1/runs/{run_id}/events?after_seq=100").status_code == 409


def test_agent_model_filters_update_the_same_cohort(store):
    store.create_run(request(), "filter")
    run_once(store)
    client = TestClient(create_app(store))
    assert client.get("/api/v1/runs?agent=not-an-agent").status_code == 422
    for endpoint in ["runs", "metrics"]:
        body = client.get(f"/api/v1/{endpoint}?model=not-a-model").json()
        assert body["total" if endpoint == "runs" else "total_runs"] == 0
    cohort = client.get("/api/v1/metrics?agent=monitoring").json()
    assert cohort["total_runs"] == 1
    assert next(a for a in cohort["agents"] if a["role"] == "monitoring")["count"] == 1
    assert next(a for a in cohort["agents"] if a["role"] == "planning")["count"] == 0


def test_agent_model_filters_must_match_the_same_invocation(store):
    row = store.create_run(request(), "combined-filter")
    store.update_detail(
        row["id"],
        {
            "agents": [
                {"role": "traffic", "model": "test-economy"},
                {"role": "monitoring", "model": "test-verifier"},
            ]
        },
    )
    assert not store.list_runs({"agent": "monitoring", "model": "test-economy"})
    assert len(store.list_runs({"agent": "monitoring", "model": "test-verifier"})) == 1


def test_incompatible_windows_are_diagnostic_not_hidden_failure(store):
    row = store.create_run({**request(), "scenario_id": "S03"}, "diagnostic")
    assert run_once(store)
    result = store.get_run(row["id"])
    assert (
        result["status"] == "succeeded" and result["detail"]["final_kind"] == "accepted_diagnostic"
    )
    assert not result["detail"]["certificate"]["valid"]
