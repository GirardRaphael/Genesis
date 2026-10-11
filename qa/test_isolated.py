"""No browser launch: harness lifecycle checks and a real temporary-DB intake workflow."""

import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import sys

import pytest

QA = Path(__file__).resolve().parent


def load_launcher():
    spec = importlib.util.spec_from_file_location("qa_launcher", QA / "start_isolated.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_busy_port_refuses_reuse():
    launcher = load_launcher()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        with pytest.raises(OSError):
            launcher.require_free_port(listener.getsockname()[1])


def test_owned_child_stops_and_readiness_failure_does_not_hang():
    launcher = load_launcher()
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        launcher.stop_process(child)
        assert child.poll() is not None
        with pytest.raises(RuntimeError, match="exited before readiness"):
            launcher.wait_ready("http://127.0.0.1:1", [child])
    finally:
        launcher.stop_process(child)


@pytest.mark.parametrize("fleet_fixture", [False, True])
def test_temporary_api_intake_plan_simulation_without_external_dispatch(tmp_path, fleet_fixture):
    # A separate interpreter keeps fixture patches/environment out of the shared test process.
    script = r'''
import importlib.util
import os
from pathlib import Path
import time
import dotenv
from fastapi.testclient import TestClient

def guarded_dotenv(*args, **kwargs):
    assert os.environ.get("PYTHON_DOTENV_DISABLED") == "1", "private dotenv read attempted"
    return False

dotenv.load_dotenv = guarded_dotenv
spec = importlib.util.spec_from_file_location("qa_fixture", "qa/route_memory_server.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
assert fixture.DIRECTORY == Path(os.environ["QA_EXPECT_DIRECTORY"])
assert "ANTHROPIC_API_KEY" not in os.environ
assert "LANGFUSE_SECRET_KEY" not in os.environ
assert fixture.app.state.reload_local_env is False
assert fixture.road(fixture.PLACES[:2])["source"].startswith("QA synthetic")
try:
    fixture.forbidden_external_dispatch()
except AssertionError:
    pass
else:
    raise AssertionError("external dispatch guard failed")
try:
    fixture.NoPaidModels()
except AssertionError:
    pass
else:
    raise AssertionError("paid model guard failed")
with TestClient(fixture.app) as client:
    assert client.get("/api/v1/qa/fixture").json()["synthetic"] is True
    fleet = client.get("/api/v1/dispatch/config").json()["vehicles"]
    custom = os.environ.get("QA_EXPECT_FLEET_FIXTURE") == "1"
    assert len(fleet) == (5 if custom else 4)
    if custom:
        assert [van["id"] for van in fleet] == ["van1", "est", "ouest", "nord", "sud"]
        assert [van["capacity_parcels"] for van in fleet] == [2, 4, 6, 8, 10]
    before = client.get("/api/v1/orders").json()["total"]
    csv = Path("qa/fixtures/orders-valid.csv").read_text(encoding="utf-8")
    preview = client.post("/api/v1/orders/import/preview", json={"csv": csv})
    assert preview.status_code == 200 and preview.json()["errors"] == []
    assert client.get("/api/v1/orders").json()["total"] == before
    saved = client.post("/api/v1/orders/batch", json={"items": preview.json()["items"]})
    assert saved.status_code == 201
    order = saved.json()["items"][0]
    request = {
        "deliveries": [{key: order[key] for key in ("id", "pickup", "dropoff", "parcels", "deadline_minutes")}],
        "order_ids": [order["id"]], "depot": order["pickup"], "vehicle_ids": ["est" if custom else "van2"],
        "mode": "live", "explanation_policy": "none",
    }
    created = client.post("/api/v1/dispatch/plans", json=request)
    assert created.status_code == 202, created.text
    run_id = created.json()["id"]
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        plan = client.get(f"/api/v1/dispatch/plans/{run_id}").json()
        if plan["status"] not in {"queued", "running"}:
            break
        time.sleep(0.1)
    assert plan["status"] == "succeeded", plan
    assert plan["certificate"]["valid"] and len(plan["agents"]) == 5
    assert client.get(f"/api/v1/runs/{run_id}/usage").json()["attempts"] == []
    trip_id = plan["created_trip_ids"][0]
    trip = client.get(f"/api/v1/dispatch/trips/{trip_id}").json()
    assert trip["status"] == "ready" and trip["started_at"] is None
    started = client.post(f"/api/v1/dispatch/trips/{trip_id}/start")
    assert started.status_code == 200 and started.json()["status"] == "running"
    assert client.get("/api/v1/orders?q=QA-U18-A").json()["items"][0]["status"] == "planned"
from genesis.api import app
app.state.store.engine.dispose()
assert not fixture.thread.is_alive()
print("Temporary intake, five-role certified plan, ready/start simulation, zero attempts: passed")
'''
    environment = {
        key: value for key, value in os.environ.items()
        if not key.startswith(("GENESIS_", "LANGFUSE_"))
        and key not in {"ANTHROPIC_API_KEY", "OPENAI_API_KEY"}
    }
    environment.update(GENESIS_QA_DIRECTORY=str(tmp_path), QA_EXPECT_DIRECTORY=str(tmp_path),
                       GENESIS_QA_FLEET_FIXTURE="1" if fleet_fixture else "0",
                       QA_EXPECT_FLEET_FIXTURE="1" if fleet_fixture else "0",
                       ANTHROPIC_API_KEY="synthetic-not-a-key", LANGFUSE_SECRET_KEY="synthetic-not-a-key")
    result = subprocess.run([sys.executable, "-c", script], cwd=QA.parent, env=environment,
                            capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, result.stdout + result.stderr
