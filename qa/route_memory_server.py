"""Isolated U12 browser fixture: real application API, synthetic road/geocoder responses."""

from datetime import datetime, timedelta, timezone
import math
import os
from pathlib import Path
import sys
import threading
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))
DIRECTORY = ROOT / "data" / ("qa-route-memory-" + uuid4().hex)
DIRECTORY.mkdir(parents=True)
os.environ["GENESIS_DATABASE_URL"] = "sqlite:///" + str(DIRECTORY / "runs.sqlite")
os.environ["GENESIS_CHECKPOINT_PATH"] = str(DIRECTORY / "checkpoints.sqlite")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import update  # noqa: E402
import uvicorn  # noqa: E402

from genesis import dispatch, traffic, workflow  # noqa: E402
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
    items = [place for place in PLACES if normalized in place["label"].casefold()]
    return {"items": items, "source": "QA synthetic geocoder", "fetched_at": dispatch._stamp()}


class NoPaidModels:
    def __init__(self, *_args, **_kwargs):
        raise AssertionError("Browser fixtures must not dispatch paid models")


dispatch._road_route = road
dispatch._search = search
workflow.ModelAdapter = NoPaidModels
traffic._cache = {"items": [], "total": 0, "source_url": "QA isolated worksite fixture",
                  "fetched_at": None, "source_updated_at": None, "available": False,
                  "stale": True, "limits": "No external traffic feed in isolated browser tests"}
traffic._expires = float("inf")
from genesis import broker_runtime  # noqa: E402
broker_runtime.road_matrix = matrix
from genesis import api as api_module, broker_api  # noqa: E402

# Only the omission path may run in live mode; NoPaidModels forbids any provider attempt.
def no_model_configuration(role):
    return ("qa-omitted-" + role, {})


api_module.live_configuration = no_model_configuration
broker_api.live_configuration = no_model_configuration

store = Store()
app = create_app(store)

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

stop = threading.Event()


def worker():
    while not stop.wait(0.25):
        run_once(store, "isolated-u12-browser-worker")


thread = threading.Thread(target=worker, daemon=True)
thread.start()
if __name__ == "__main__":
    try:
        uvicorn.run(app, host="127.0.0.1", port=8061, access_log=False)
    finally:
        stop.set()
        thread.join(timeout=2)
        store.engine.dispose()
