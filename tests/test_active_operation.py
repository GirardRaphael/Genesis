import threading

from fastapi.testclient import TestClient

from genesis.api import create_app
from genesis.workflow import Runtime


def test_current_agent_is_visible_without_fake_finished_duration(store):
    row = store.create_run(
        dict(scenario_id="S01", policy="baseline_only", seed=17, mode="fixture", budget_usd=None),
        "active",
    )
    claimed = store.claim("worker")
    runtime = Runtime(store, claimed)
    entered, release = threading.Event(), threading.Event()

    def operation(state, calls):
        entered.set()
        assert release.wait(5)
        return {"result": True}, {"summary": "Finished bounded test"}

    thread = threading.Thread(
        target=lambda: runtime.node("planning", operation)({"run_id": row["id"]})
    )
    thread.start()
    try:
        assert entered.wait(5)
        client = TestClient(create_app(store))
        detail = client.get(f"/api/v1/runs/{row['id']}").json()
        assert detail["agents"][0]["status"] == "running"
        assert detail["agents"][0]["input_tokens"] is None
        metrics = client.get("/api/v1/metrics?status=running").json()
        assert metrics["agents"][0]["mean_duration_ms"] is None
        assert metrics["slowest_agent"] is None
    finally:
        release.set()
        thread.join(timeout=5)
    assert not thread.is_alive()
