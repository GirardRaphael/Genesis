"""Isolated browser fixture: complete API/worker, synthetic roads, no external dispatch."""

from datetime import datetime, timedelta, timezone
import math
import os
from pathlib import Path
import sys
import tempfile
import threading
from contextlib import asynccontextmanager
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))
# Disable dotenv before application imports, including their module-level app/worker setup.
os.environ["PYTHON_DOTENV_DISABLED"] = "1"
_qa_directory = os.environ.get("GENESIS_QA_DIRECTORY")
_qa_instance = os.environ.get("GENESIS_QA_INSTANCE")
_qa_fleet_fixture = os.environ.get("GENESIS_QA_FLEET_FIXTURE") == "1"
for key in list(os.environ):
    if key.startswith(("GENESIS_", "LANGFUSE_")) or key in {
        "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OTEL_EXPORTER_OTLP_ENDPOINT",
    }:
        os.environ.pop(key)
_temporary = None
if _qa_directory:
    DIRECTORY = Path(_qa_directory)
else:
    _temporary = tempfile.TemporaryDirectory(prefix="genesis-browser-qa-")
    DIRECTORY = Path(_temporary.name)
DIRECTORY.mkdir(parents=True, exist_ok=True)
os.environ["GENESIS_DATABASE_URL"] = "sqlite:///" + str(DIRECTORY / "runs.sqlite")
os.environ["GENESIS_CHECKPOINT_PATH"] = str(DIRECTORY / "checkpoints.sqlite")
os.environ["GENESIS_SMTP_HOST"] = ""
os.environ["GENESIS_BUDGET_ALERT_TO"] = ""
if _qa_fleet_fixture:
    os.environ["GENESIS_FLEET_CONFIG"] = str(ROOT / "qa/fixtures/fleet-five.json")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import update  # noqa: E402
import uvicorn  # noqa: E402

from genesis import dispatch, llm, notifications, traffic, worker, workflow  # noqa: E402
from genesis.api import create_app  # noqa: E402
from genesis.db import Store  # noqa: E402
from genesis.worker import run_once  # noqa: E402

PLACES = [
    {"label": "4500 rue Saint-Denis, Montréal", "coordinates": [-73.582, 45.523]},
    {"label": "1050 avenue du Mont-Royal Est, Montréal", "coordinates": [-73.581, 45.528]},
    {"label": "5300 boulevard Saint-Laurent, Montréal", "coordinates": [-73.600, 45.523]},
    {"label": "400 rue de la Commune Ouest, Montréal", "coordinates": [-73.554, 45.500]},
]


def travel(a, b):
    meters = math.ceil(math.hypot((a[0] - b[0]) * 78000, (a[1] - b[1]) * 111000))
    return (math.ceil(meters / 6), meters)


def road(stops, **_kwargs):
    coordinates = [list(stop["coordinates"]) for stop in stops]
    legs = []
    for a, b in zip(coordinates, coordinates[1:]):
        seconds, meters = travel(a, b)
        legs.append({"coordinates": [a, b], "duration_seconds": seconds, "distance_meters": meters})
    seconds = sum(leg["duration_seconds"] for leg in legs)
    return {"coordinates": coordinates, "legs": legs, "duration_seconds": seconds,
            "duration_minutes": round(seconds / 60, 1),
            "distance_km": round(sum(leg["distance_meters"] for leg in legs) / 1000, 2),
            "source": "QA synthetic geometry, not public road evidence",
            "source_url": dispatch.OSRM + "/route/v1/driving/qa-fixture",
            "computed_at": datetime.now(timezone.utc).isoformat()}


def matrix(nodes):
    coordinates = [node["coordinates"] for node in nodes]
    return {"durations": [[travel(a, b)[0] for b in coordinates] for a in coordinates],
            "distances": [[travel(a, b)[1] for b in coordinates] for a in coordinates],
            "source": "QA synthetic matrix", "computed_at": datetime.now(timezone.utc).isoformat()}


def search(query):
    normalized = query.casefold()
    items = [
        {"id": f"qa-place-{index}", **place}
        for index, place in enumerate(PLACES)
        if normalized in place["label"].casefold()
    ]
    return {"items": items, "source": "QA synthetic geocoder", "fetched_at": dispatch._stamp()}


class NoPaidModels:
    def __init__(self, *_args, **_kwargs):
        raise AssertionError("Browser fixtures must not dispatch paid models")


dispatch._road_route = road
dispatch._search = search
workflow.ModelAdapter = NoPaidModels
llm.ModelAdapter = NoPaidModels


def forbidden_external_dispatch(*_args, **_kwargs):
    raise AssertionError("Isolated browser QA forbids network providers, email and exporters")


dispatch._provider_json = forbidden_external_dispatch
worker.export_outbox = forbidden_external_dispatch
worker.drain_budget_alerts = forbidden_external_dispatch
notifications.drain_budget_alerts = forbidden_external_dispatch
traffic._cache = {"items": [], "total": 0, "source_url": "QA isolated worksite fixture",
                  "fetched_at": None, "source_updated_at": None, "available": False,
                  "stale": True, "limits": "No external traffic feed in isolated browser tests"}
traffic._expires = float("inf")
from genesis import broker_runtime  # noqa: E402
broker_runtime.road_matrix = matrix
dispatch.road_matrix = matrix
from genesis import api as api_module, broker_api  # noqa: E402

# Only the omission path may run in live mode; NoPaidModels forbids any provider attempt.
def no_model_configuration(role):
    return ("qa-omitted-" + role, {})


api_module.live_configuration = no_model_configuration
broker_api.live_configuration = no_model_configuration

store = Store()
app = create_app(store)
FIXTURE_ID = _qa_instance or uuid4().hex


@app.get("/api/v1/qa/fixture")
def fixture_identity():
    return {"fixture_id": FIXTURE_ID, "synthetic": True, "places": PLACES,
            "fleet_fixture": _qa_fleet_fixture,
            "models": "forbidden", "email": "forbidden", "exporter": "forbidden"}

# Seed two completed comparable trips through the real API, then advance only fixture timestamps.
with TestClient(app) as client:
    for index in range(2):
        result = client.post("/api/v1/dispatch/trips", json={
            "name": "Tournée récurrente de contrôle", "vehicle_id": "van1",
            "deliveries": [{"pickup": PLACES[0], "dropoff": PLACES[1], "parcels": 2}],
        })
        result.raise_for_status()
        with store.engine.begin() as connection:
            connection.execute(update(dispatch._trips).where(dispatch._trips.c.id == result.json()["id"])
                               .values(status="running", started_at=(datetime.now(timezone.utc)
                                       - timedelta(days=2 - index)).isoformat()))

# Two real deterministic workflows populate analytics without fabricated model usage.
for policy in ["baseline_only", "solver_with_one_replan"]:
    store.create_run({"scenario_id": "S01", "policy": policy, "seed": 17,
                      "mode": "fixture", "budget_usd": None}, f"qa:{policy}")
while run_once(store, "isolated-browser-seed"):
    pass

stop = threading.Event()


def execute_jobs():
    while not stop.wait(0.25):
        run_once(store, "isolated-browser-worker")


thread = threading.Thread(target=execute_jobs, daemon=True)


@asynccontextmanager
async def lifespan(_app):
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=10)
        store.engine.dispose()
        api_module.app.state.store.engine.dispose()


app.router.lifespan_context = lifespan
if __name__ == "__main__":
    try:
        uvicorn.run(app, host="127.0.0.1", port=8061, access_log=False)
    finally:
        if _temporary is not None:
            _temporary.cleanup()
