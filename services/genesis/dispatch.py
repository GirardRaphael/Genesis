"""Keyless address search and road-based, simulated local dispatch trips."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
import threading
import time
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException, Query
import httpx
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Column, MetaData, String, Table, Text, insert, select, text, update
from sqlalchemy.exc import IntegrityError


BBOX = (-74.05, 45.38, -73.42, 45.74)
PHOTON = "https://photon.komoot.io"
OSRM = "https://router.project-osrm.org"
SPEEDUP = 60
USER_AGENT = "GenesisObservatory/0.1 (https://github.com/GirardRaphael/Genesis)"
_metadata = MetaData()
_trips = Table(
    "dispatch_trips",
    _metadata,
    Column("id", String(36), primary_key=True),
    Column("name", String(120), nullable=False),
    Column("vehicle_id", String(8), nullable=False),
    Column("status", String(12), nullable=False),
    Column("request_json", Text, nullable=False),
    Column("route_json", Text, nullable=False),
    Column("request_hash", String(64), nullable=False),
    Column("idempotency_key", String(128), unique=True),
    Column("created_at", String(40), nullable=False),
    Column("started_at", String(40)),
    Column("cancelled_at", String(40)),
)
_provider_lock = threading.Lock()
_geocode_cache: dict[str, tuple[float, dict]] = {}
_last_geocode_request = 0.0
_last_route_request = 0.0


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _stamp() -> str:
    return _utc_now().isoformat()


def _inside(coordinates: list[float]) -> bool:
    lon, lat = coordinates
    return (
        all(math.isfinite(v) for v in coordinates)
        and BBOX[0] <= lon <= BBOX[2]
        and BBOX[1] <= lat <= BBOX[3]
    )


class Place(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    label: str = Field(min_length=1, max_length=200)
    coordinates: tuple[float, float]


class Delivery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str | None = Field(default=None, min_length=1, max_length=64)
    pickup: Place
    dropoff: Place
    parcels: int = Field(ge=1, le=40)


class TripRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="Livraisons Montréal", min_length=1, max_length=120)
    vehicle_id: str = Field(pattern=r"^van[1-4]$")
    deliveries: list[Delivery] = Field(min_length=1, max_length=10)


def _error(status: int, code: str, message: str, retryable: bool = False) -> HTTPException:
    return HTTPException(status, {"code": code, "message": message, "retryable": retryable})


def _provider_json(url: str, params: dict | None = None) -> dict:
    try:
        with httpx.stream(
            "GET",
            url,
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=httpx.Timeout(10, connect=3),
            follow_redirects=False,
        ) as response:
            response.raise_for_status()
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > 2_000_000:
                    raise ValueError("Provider response exceeds limit")
                chunks.append(chunk)
        value = json.loads(b"".join(chunks))
        if not isinstance(value, dict):
            raise ValueError("Provider response is not an object")
        return value
    except httpx.HTTPError as exc:
        raise _error(
            503, "provider_unavailable", "Address or routing provider unavailable", True
        ) from exc
    except (ValueError, UnicodeError) as exc:
        raise _error(
            502, "invalid_provider_response", "Address or routing response was invalid", True
        ) from exc


def _provider_base(name: str, default: str) -> str:
    base = os.getenv(name, default).rstrip("/")
    try:
        parsed = urlsplit(base)
        if (
            parsed.scheme not in {"https", "http"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Invalid provider base URL")
        parsed.port
    except ValueError as exc:
        raise _error(
            503, "provider_configuration", "Provider URL must be a keyless HTTP or HTTPS base URL"
        ) from exc
    return base


def _search(query: str) -> dict:
    global _last_geocode_request
    key = " ".join(query.casefold().split())
    with _provider_lock:
        cached = _geocode_cache.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        delay = max(0, _last_geocode_request + 1 - time.monotonic())
        if delay:
            time.sleep(delay)
        _last_geocode_request = time.monotonic()
        base = _provider_base("GENESIS_GEOCODER_URL", PHOTON)
        source_url = f"{base}/api"
        data = _provider_json(
            source_url, {"q": query, "bbox": ",".join(map(str, BBOX)), "limit": 5, "lang": "fr"}
        )
        features = data.get("features")
        if not isinstance(features, list):
            raise _error(502, "invalid_provider_response", "Address results were invalid", True)
        items = []
        for feature in features[:5]:
            if not isinstance(feature, dict):
                continue
            geometry, props = feature.get("geometry"), feature.get("properties")
            if not isinstance(geometry, dict) or not isinstance(props, dict):
                continue
            coords = geometry.get("coordinates")
            if not isinstance(coords, list) or len(coords) != 2:
                continue
            try:
                coordinates = [float(coords[0]), float(coords[1])]
            except (ValueError, TypeError):
                continue
            if not _inside(coordinates):
                continue
            label = ", ".join(
                str(props[k]).strip()
                for k in ("name", "housenumber", "street", "city")
                if props.get(k)
            )[:200]
            if not label:
                continue
            items.append(
                {
                    "id": str(props.get("osm_id") or f"{coordinates[0]},{coordinates[1]}")[:64],
                    "label": label,
                    "coordinates": coordinates,
                }
            )
        result = {
            "items": items,
            "source": "Photon",
            "source_url": source_url,
            "fetched_at": _stamp(),
        }
        if len(_geocode_cache) >= 100:
            _geocode_cache.clear()
        _geocode_cache[key] = (time.monotonic() + 300, result)
        return result


def _geometry(value: object) -> list[list[float]]:
    if not isinstance(value, dict) or value.get("type") != "LineString":
        raise ValueError("Missing road geometry")
    points = value.get("coordinates")
    if not isinstance(points, list) or len(points) < 2:
        raise ValueError("Road geometry is too short")
    result = []
    for point in points:
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError("Invalid road coordinate")
        coordinates = [float(point[0]), float(point[1])]
        if not all(math.isfinite(v) for v in coordinates):
            raise ValueError("Invalid road coordinate")
        result.append(coordinates)
    return result


def _road_route(stops: list[dict], *, continue_straight: bool | None = None) -> dict:
    global _last_route_request
    base = _provider_base("GENESIS_ROUTER_URL", OSRM)
    coordinates = ";".join(f"{s['coordinates'][0]:.6f},{s['coordinates'][1]:.6f}" for s in stops)
    source_url = f"{base}/route/v1/driving/{coordinates}"
    with _provider_lock:
        delay = max(0, _last_route_request + 1 - time.monotonic())
        if delay:
            time.sleep(delay)
        _last_route_request = time.monotonic()
        params = {"overview": "full", "geometries": "geojson", "steps": "true"}
        if continue_straight is not None:
            params["continue_straight"] = "true" if continue_straight else "false"
        data = _provider_json(source_url, params)
    if data.get("code") == "NoRoute":
        raise _error(422, "road_route_unavailable", "No drivable road route connects these stops")
    try:
        if data.get("code") != "Ok":
            raise ValueError("Routing provider rejected request")
        route = data["routes"][0]
        waypoints = data["waypoints"]
        legs = route["legs"]
        if len(waypoints) != len(stops) or len(legs) != len(stops) - 1:
            raise ValueError("Routing provider returned incomplete stops")
        if any(
            not math.isfinite(float(waypoint["distance"])) or float(waypoint["distance"]) > 250
            for waypoint in waypoints
        ):
            raise ValueError("A stop snapped too far from the road")
        path = _geometry(route["geometry"])
        segments = []
        for leg in legs:
            duration, distance = float(leg["duration"]), float(leg["distance"])
            if not all(math.isfinite(v) and v >= 0 for v in (duration, distance)):
                raise ValueError("Invalid road leg totals")
            points = []
            for step in leg["steps"]:
                step_points = _geometry(step["geometry"])
                points.extend(step_points if not points else step_points[1:])
            if len(points) < 2:
                raise ValueError("Road leg geometry is missing")
            segments.append(
                {"coordinates": points, "duration_seconds": duration, "distance_meters": distance}
            )
        total_seconds = sum(leg["duration_seconds"] for leg in segments)
        total_meters = sum(leg["distance_meters"] for leg in segments)
    except (KeyError, TypeError, ValueError, IndexError, OverflowError) as exc:
        raise _error(
            502, "invalid_provider_response", "Road routing response was incomplete", True
        ) from exc
    return {
        "coordinates": path,
        "legs": segments,
        "distance_km": round(total_meters / 1000, 2),
        "duration_minutes": round(total_seconds / 60, 1),
        "duration_seconds": total_seconds,
        "source": "OSRM driving",
        "source_url": source_url,
        "computed_at": _stamp(),
    }


def road_matrix(nodes: list[dict]) -> dict:
    """One directional OSRM table for the frozen broker problem."""
    global _last_route_request
    if not 2 <= len(nodes) <= 24 or any(not _inside(n["coordinates"]) for n in nodes):
        raise _error(
            422, "invalid_matrix_nodes", "Road matrix nodes are outside the supported area"
        )
    base = _provider_base("GENESIS_ROUTER_URL", OSRM)
    coordinates = ";".join(f"{n['coordinates'][0]:.6f},{n['coordinates'][1]:.6f}" for n in nodes)
    source_url = f"{base}/table/v1/driving/{coordinates}"
    with _provider_lock:
        delay = max(0, _last_route_request + 1 - time.monotonic())
        if delay:
            time.sleep(delay)
        _last_route_request = time.monotonic()
        data = _provider_json(source_url, {"annotations": "duration,distance"})
    try:
        if (
            data["code"] != "Ok"
            or len(data["sources"]) != len(nodes)
            or len(data["destinations"]) != len(nodes)
        ):
            raise ValueError("Missing road nodes")
        if any(
            not math.isfinite(float(w["distance"])) or float(w["distance"]) > 250
            for w in [*data["sources"], *data["destinations"]]
        ):
            raise ValueError("Stop snapped too far from a road")
        durations, distances = data["durations"], data["distances"]
        if any(
            len(matrix) != len(nodes) or any(len(row) != len(nodes) for row in matrix)
            for matrix in (durations, distances)
        ):
            raise ValueError("Road matrix dimensions are invalid")
        for i in range(len(nodes)):
            for j in range(len(nodes)):
                pair = (durations[i][j], distances[i][j])
                if (pair[0] is None) != (pair[1] is None):
                    raise ValueError("Road matrix reachability differs")
                if pair[0] is not None and any(
                    not math.isfinite(float(v)) or float(v) < 0 for v in pair
                ):
                    raise ValueError("Invalid road matrix cell")
        return {
            "durations": [
                [None if v is None else math.ceil(float(v)) for v in row] for row in durations
            ],
            "distances": [
                [None if v is None else math.ceil(float(v)) for v in row] for row in distances
            ],
            "source": "OSRM driving static estimate",
            "computed_at": _stamp(),
            "source_url": source_url,
        }
    except (KeyError, TypeError, ValueError, IndexError, OverflowError) as exc:
        raise _error(
            502, "invalid_provider_response", "Road matrix response was incomplete", True
        ) from exc


def _held_cargo(row) -> int:
    if row["status"] != "cancelled" or not row["started_at"]:
        return 0
    trip = _project(row)
    picked = {
        stop["delivery_id"]
        for stop in trip["stops"]
        if stop["kind"] == "pickup" and stop["status"] == "completed"
    }
    dropped = {
        stop["delivery_id"]
        for stop in trip["stops"]
        if stop["kind"] == "dropoff" and stop["status"] == "completed"
    }
    return sum(
        delivery["parcels"] for delivery in trip["deliveries"] if delivery["id"] in picked - dropped
    )


def _fleet_state(conn, vehicle_ids: list[str], depot: dict) -> dict:
    rows = conn.execute(select(_trips).where(_trips.c.vehicle_id.in_(vehicle_ids))).mappings().all()
    vehicles = []
    for vehicle_id in vehicle_ids:
        history = [dict(row) for row in rows if row["vehicle_id"] == vehicle_id]
        held_cargo = sum(_held_cargo(row) for row in history)
        busy = any(_project(row)["status"] in {"ready", "running"} for row in history)
        latest = max(history, key=lambda row: (row["created_at"], row["id"])) if history else None
        known = [row for row in history if row["started_at"]]
        position_source = (
            max(known, key=lambda row: (row["started_at"], row["id"])) if known else None
        )
        origin = depot["coordinates"]
        assumed = True
        if position_source:
            projected = _project(position_source)
            origin = projected["progress"]["coordinate"]
            assumed = False
        vehicles.append(
            {
                "id": vehicle_id,
                "available": not busy and not held_cargo,
                "unresolved_cargo_parcels": held_cargo,
                "origin": origin,
                "origin_assumed": assumed,
                "latest_trip_id": latest["id"] if latest else None,
                "latest_trip_status": _project(latest)["status"] if latest else None,
            }
        )
    return {"vehicles": vehicles}


def fleet_snapshot(engine, vehicle_ids: list[str], depot: dict) -> dict:
    _trips.create(engine, checkfirst=True)
    with engine.connect() as conn:
        return _fleet_state(conn, vehicle_ids, depot)


def materialize_broker_trips(
    store,
    run_id: str,
    fence: tuple,
    snapshot: dict,
    request: dict,
    solution: dict,
    problem: dict,
    certificate_artifact_id: str,
) -> list[str]:
    """Commit every selected ready trip together after the last model call."""
    routes = sorted(
        (route for route in solution["vehicle_routes"] if route["node_order"]),
        key=lambda route: route["vehicle_id"],
    )
    with store.engine.connect() as conn:
        existing = (
            conn.execute(
                select(_trips)
                .where(_trips.c.idempotency_key.like(f"broker:{run_id}:%"))
                .order_by(_trips.c.vehicle_id)
            )
            .mappings()
            .all()
        )
    if existing:
        if len(existing) != len(routes):
            raise _error(409, "materialization_conflict", "Broker trip creation was incomplete")
        return [row["id"] for row in existing]
    prepared = []
    for route in routes:
        vehicle_id = route["vehicle_id"]
        origin = next(v["origin"] for v in snapshot["vehicles"] if v["id"] == vehicle_id)
        order = route["node_order"]
        nodes = problem["nodes"]
        stops = [{"coordinates": origin}] + [
            {"coordinates": nodes[index]["coordinates"]} for index in order
        ]
        road = _road_route(stops, continue_straight=False)
        service_seconds = request["service_minutes"] * 60
        elapsed_route = 0.0
        deadlines = {d["id"]: d["deadline_minutes"] * 60 for d in request["deliveries"]}
        previous = next(v["start_index"] for v in problem["vehicles"] if v["id"] == vehicle_id)
        for stop_index, node_index in enumerate(order):
            leg = road["legs"][stop_index]
            duration_bound = problem["durations"][previous][node_index]
            distance_bound = problem["distances"][previous][node_index]
            if (
                duration_bound is None
                or distance_bound is None
                or math.ceil(leg["duration_seconds"]) > duration_bound
                or math.ceil(leg["distance_meters"]) > distance_bound
            ):
                raise _error(
                    409,
                    "road_route_changed",
                    "Road geometry differs from the certified matrix; replan",
                )
            elapsed_route += leg["duration_seconds"] + service_seconds
            node = nodes[node_index]
            if node["kind"] == "dropoff" and elapsed_route > deadlines[node["delivery_id"]]:
                raise _error(
                    409,
                    "road_route_changed",
                    "Road route no longer meets a delivery deadline; replan",
                )
            previous = node_index
        if elapsed_route > 28800:
            raise _error(
                409, "road_route_changed", "Road route exceeds the supported duty period; replan"
            )
        road["driving_duration_seconds"] = road["duration_seconds"]
        road["duration_seconds"] += service_seconds * len(order)
        road["duration_minutes"] = round(road["duration_seconds"] / 60, 1)
        road["planned_duration_seconds"] = route["duration_seconds"]
        road["planned_distance_meters"] = route["distance_meters"]
        road["planned_operating_cost_cents"] = route["operating_cost_cents"]
        delivery_ids = list(dict.fromkeys(nodes[index]["delivery_id"] for index in order))
        deliveries = [d for d in request["deliveries"] if d["id"] in delivery_ids]
        stop_order = [f"{nodes[index]['delivery_id']}:{nodes[index]['kind']}" for index in order]
        if len(stop_order) != 2 * len(deliveries) or len(set(stop_order)) != len(stop_order):
            raise _error(
                422, "invalid_broker_route", "Selected route has duplicate or missing stops"
            )
        trip_request = {
            "name": "Plan courtier Montréal",
            "vehicle_id": vehicle_id,
            "deliveries": deliveries,
            "stop_order": stop_order,
            "service_seconds": service_seconds,
            "owner_run_id": run_id,
            "broker_plan": {
                "input_hash": problem["input_hash"],
                "solution_hash": solution["solution_hash"],
                "certificate_artifact_id": certificate_artifact_id,
            },
        }
        prepared.append((vehicle_id, trip_request, road))
    with store.transaction() as conn:
        run = store._run(conn, run_id, fence)
        if store.engine.dialect.name == "postgresql":
            conn.execute(text("LOCK TABLE dispatch_trips IN SHARE ROW EXCLUSIVE MODE"))
        if run["cancel_requested"]:
            raise _error(409, "plan_cancelled", "Planning run was cancelled")
        existing = (
            conn.execute(
                select(_trips)
                .where(_trips.c.idempotency_key.like(f"broker:{run_id}:%"))
                .order_by(_trips.c.vehicle_id)
            )
            .mappings()
            .all()
        )
        if existing:
            if len(existing) != len(prepared):
                raise _error(409, "materialization_conflict", "Broker trip creation was incomplete")
            return [row["id"] for row in existing]
        current = _fleet_state(conn, [v["id"] for v in snapshot["vehicles"]], request["depot"])
        frozen = {v["id"]: v for v in snapshot["vehicles"]}
        for vehicle_id, _, _ in prepared:
            previous = frozen[vehicle_id]
            latest = next(v for v in current["vehicles"] if v["id"] == vehicle_id)
            if (
                not latest["available"]
                or latest["latest_trip_id"] != previous["latest_trip_id"]
                or latest["latest_trip_status"] != previous["latest_trip_status"]
            ):
                raise _error(
                    409, "fleet_changed", "A selected van changed; replan with the current fleet"
                )
        ids = []
        for vehicle_id, trip_request, road in prepared:
            trip_id = str(uuid4())
            ids.append(trip_id)
            conn.execute(
                insert(_trips).values(
                    id=trip_id,
                    name=trip_request["name"],
                    vehicle_id=vehicle_id,
                    status="ready",
                    request_json=json.dumps(trip_request),
                    route_json=json.dumps(road),
                    request_hash=hashlib.sha256(
                        json.dumps(trip_request, sort_keys=True).encode()
                    ).hexdigest(),
                    idempotency_key=f"broker:{run_id}:{vehicle_id}",
                    created_at=_stamp(),
                    started_at=None,
                    cancelled_at=None,
                )
            )
        return ids


def retire_broker_trips(conn, run_id: str) -> None:
    """Retire this run's unstarted reservations inside the caller's transaction."""
    _trips.create(conn, checkfirst=True)
    conn.execute(
        update(_trips)
        .where(_trips.c.idempotency_key.like(f"broker:{run_id}:%"), _trips.c.status == "ready")
        .values(status="cancelled", cancelled_at=_stamp())
    )


def cancel_broker_ready_trips(store, run_id: str) -> None:
    with store.transaction() as conn:
        if store.engine.dialect.name == "postgresql":
            conn.execute(text("LOCK TABLE dispatch_trips IN SHARE ROW EXCLUSIVE MODE"))
        retire_broker_trips(conn, run_id)


def reconcile_broker_ready_trips(store) -> None:
    """Release reservations left by a process crash after a terminal failed run."""
    with store.engine.connect() as conn:
        rows = (
            conn.execute(
                select(_trips).where(
                    _trips.c.status == "ready", _trips.c.idempotency_key.like("broker:%")
                )
            )
            .mappings()
            .all()
        )
    for row in rows:
        run_id = json.loads(row["request_json"]).get("owner_run_id")
        if not run_id:
            continue
        try:
            status = store.get_run(run_id)["status"]
        except KeyError:
            status = "failed"
        if status in {"failed", "cancelled", "timed_out", "budget_exceeded"}:
            cancel_broker_ready_trips(store, run_id)


def _interpolate(points: list[list[float]], fraction: float) -> list[float]:
    if fraction <= 0:
        return points[0]
    if fraction >= 1:
        return points[-1]
    lengths = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])]
    target = sum(lengths) * fraction
    for index, length in enumerate(lengths):
        if target <= length or index == len(lengths) - 1:
            ratio = target / length if length else 0
            a, b = points[index], points[index + 1]
            return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio]
        target -= length
    return points[-1]


def _project(row: dict) -> dict:
    request = json.loads(row["request_json"])
    route = json.loads(row["route_json"])
    total = route["duration_seconds"]
    started = datetime.fromisoformat(row["started_at"]) if row["started_at"] else None
    cancelled = datetime.fromisoformat(row["cancelled_at"]) if row["cancelled_at"] else None
    end = cancelled or _utc_now()
    elapsed = min(total, max(0, (end - started).total_seconds() * SPEEDUP)) if started else 0
    status = "completed" if row["status"] == "running" and elapsed >= total else row["status"]
    stops = []
    offset = 0.0
    ordered = request.get("stop_order") or [
        f"{delivery['id']}:{kind}"
        for delivery in request["deliveries"]
        for kind in ("pickup", "dropoff")
    ]
    by_id = {delivery["id"]: delivery for delivery in request["deliveries"]}
    service_seconds = request.get("service_seconds", 0)
    for stop_index, stop_id in enumerate(ordered):
        delivery_id, kind = stop_id.rsplit(":", 1)
        delivery = by_id[delivery_id]
        if request.get("owner_run_id"):
            offset += (service_seconds if stop_index else 0) + route["legs"][stop_index][
                "duration_seconds"
            ]
        elif stop_index:
            offset += route["legs"][stop_index - 1]["duration_seconds"]
        place = delivery[kind]
        stops.append(
            {
                "id": stop_id,
                "delivery_id": delivery["id"],
                "kind": kind,
                "label": place["label"],
                "coordinates": place["coordinates"],
                "eta_seconds": round(offset, 1),
                "eta_at": (started + timedelta(seconds=offset / SPEEDUP)).isoformat()
                if started
                else None,
                "status": "completed"
                if started and elapsed >= offset + service_seconds
                else "pending",
            }
        )
    remaining = elapsed
    position = route["coordinates"][0]
    for leg in route["legs"]:
        if remaining <= leg["duration_seconds"]:
            position = _interpolate(
                leg["coordinates"],
                remaining / leg["duration_seconds"] if leg["duration_seconds"] else 1,
            )
            break
        remaining -= leg["duration_seconds"]
        if service_seconds:
            if remaining <= service_seconds:
                position = leg["coordinates"][-1]
                break
            remaining -= service_seconds
    else:
        position = route["coordinates"][-1]
    completed_at = (
        (started + timedelta(seconds=total / SPEEDUP)).isoformat()
        if started and elapsed >= total
        else None
    )
    return {
        "id": row["id"],
        "name": row["name"],
        "vehicle_id": row["vehicle_id"],
        "status": status,
        "created_at": row["created_at"],
        "started_at": row["started_at"],
        "cancelled_at": row["cancelled_at"],
        "completed_at": completed_at,
        "tracking_mode": "simulation",
        "speedup": SPEEDUP,
        "deliveries": request["deliveries"],
        "stops": stops,
        "route": route,
        "progress": {
            "coordinate": position,
            "fraction": min(1, elapsed / total) if total else (1 if started else 0),
            "completed_stop_count": sum(stop["status"] == "completed" for stop in stops),
            "elapsed_simulation_seconds": round(elapsed, 1),
            "remaining_simulation_seconds": round(max(0, total - elapsed), 1),
        },
    }


def register_dispatch(app: FastAPI) -> None:
    """Attach dispatch endpoints to an app whose state.store is already configured."""
    _trips.create(app.state.store.engine, checkfirst=True)
    reconcile_broker_ready_trips(app.state.store)

    def get_row(trip_id: UUID) -> dict:
        with app.state.store.engine.connect() as conn:
            row = conn.execute(select(_trips).where(_trips.c.id == str(trip_id))).mappings().first()
        if row is None:
            raise _error(404, "trip_not_found", "Dispatch trip not found")
        return dict(row)

    @app.get("/api/v1/dispatch/config")
    def dispatch_config():
        return {
            "map_style": "https://tiles.openfreemap.org/styles/positron",
            "geocoder": "Photon",
            "router": "OSRM driving",
            "tracking_mode": "simulation",
            "speedup": SPEEDUP,
            "capacity_parcels": 40,
            "limits": "Public demo geocoding/routing has no production SLA; configure GENESIS_GEOCODER_URL and GENESIS_ROUTER_URL for owned services. No live GPS, live traffic, vehicle restrictions, or route optimization.",
        }

    @app.get("/api/v1/dispatch/fleet")
    def dispatch_fleet():
        return fleet_snapshot(
            app.state.store.engine,
            [f"van{i}" for i in range(1, 5)],
            {"coordinates": [-73.5673, 45.5019]},
        )

    @app.get("/api/v1/dispatch/geocode")
    def geocode(q: str = Query(min_length=3, max_length=120)):
        query = q.strip()
        if len(query) < 3:
            raise _error(422, "invalid_query", "Search requires at least three characters")
        return _search(query)

    @app.get("/api/v1/dispatch/trips")
    def list_trips(limit: int = Query(50, ge=1, le=100)):
        with app.state.store.engine.connect() as conn:
            rows = (
                conn.execute(select(_trips).order_by(_trips.c.created_at.desc()).limit(limit))
                .mappings()
                .all()
            )
        return {"items": [_project(dict(row)) for row in rows]}

    @app.post("/api/v1/dispatch/trips", status_code=201)
    def create_trip(
        body: TripRequest,
        idempotency_key: str | None = Header(default=None, min_length=1, max_length=128),
    ):
        request = body.model_dump(mode="json")
        for delivery in request["deliveries"]:
            delivery["id"] = delivery["id"] or str(uuid4())
            if not _inside(delivery["pickup"]["coordinates"]) or not _inside(
                delivery["dropoff"]["coordinates"]
            ):
                raise _error(
                    422,
                    "outside_service_area",
                    "All stops must be within the Montréal demonstration area",
                )
        if len({delivery["id"] for delivery in request["deliveries"]}) != len(
            request["deliveries"]
        ):
            raise _error(422, "duplicate_delivery_id", "Delivery IDs must be unique")
        # Idempotency is based on user input; generated delivery IDs are stable only after first persistence.
        original = body.model_dump(mode="json")
        fingerprint = hashlib.sha256(json.dumps(original, sort_keys=True).encode()).hexdigest()
        engine = app.state.store.engine
        if idempotency_key:
            with engine.connect() as conn:
                existing = (
                    conn.execute(select(_trips).where(_trips.c.idempotency_key == idempotency_key))
                    .mappings()
                    .first()
                )
            if existing:
                if existing["request_hash"] != fingerprint:
                    raise _error(409, "idempotency_conflict", "Key belongs to a different trip")
                return _project(dict(existing))
        stops = []
        for delivery in request["deliveries"]:
            for kind in ("pickup", "dropoff"):
                stops.append(delivery[kind])
        route = _road_route(stops)
        values = {
            "id": str(uuid4()),
            "name": request["name"],
            "vehicle_id": request["vehicle_id"],
            "status": "ready",
            "request_json": json.dumps(request),
            "route_json": json.dumps(route),
            "request_hash": fingerprint,
            "idempotency_key": idempotency_key,
            "created_at": _stamp(),
            "started_at": None,
            "cancelled_at": None,
        }
        try:
            with app.state.store.transaction() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text("LOCK TABLE dispatch_trips IN SHARE ROW EXCLUSIVE MODE"))
                reservations = (
                    conn.execute(select(_trips).where(_trips.c.vehicle_id == request["vehicle_id"]))
                    .mappings()
                    .all()
                )
                if any(
                    json.loads(row["request_json"]).get("owner_run_id")
                    and _project(dict(row))["status"] in {"ready", "running"}
                    for row in reservations
                ):
                    raise _error(409, "vehicle_busy", "Van is reserved by a broker plan")
                conn.execute(insert(_trips).values(**values))
        except IntegrityError as exc:
            if not idempotency_key:
                raise
            with engine.connect() as conn:
                existing = (
                    conn.execute(select(_trips).where(_trips.c.idempotency_key == idempotency_key))
                    .mappings()
                    .first()
                )
            if existing and existing["request_hash"] == fingerprint:
                return _project(dict(existing))
            raise _error(409, "idempotency_conflict", "Key belongs to a different trip") from exc
        return _project(values)

    @app.get("/api/v1/dispatch/trips/{trip_id}")
    def trip_detail(trip_id: UUID):
        return _project(get_row(trip_id))

    @app.post("/api/v1/dispatch/trips/{trip_id}/start")
    def start_trip(trip_id: UUID):
        with app.state.store.transaction() as conn:
            initial = (
                conn.execute(select(_trips).where(_trips.c.id == str(trip_id))).mappings().first()
            )
            if initial is None:
                raise _error(404, "trip_not_found", "Dispatch trip not found")
            owner_run_id = json.loads(initial["request_json"]).get("owner_run_id")
            if owner_run_id and app.state.store._run(conn, owner_run_id)["status"] != "succeeded":
                raise _error(409, "plan_pending", "Broker plan has not completed successfully")
            if app.state.store.engine.dialect.name == "postgresql":
                conn.execute(text("LOCK TABLE dispatch_trips IN SHARE ROW EXCLUSIVE MODE"))
            row = conn.execute(select(_trips).where(_trips.c.id == str(trip_id))).mappings().first()
            if row is None:
                raise _error(404, "trip_not_found", "Dispatch trip not found")
            if row["status"] == "cancelled" or _project(row)["status"] == "completed":
                raise _error(409, "trip_not_startable", "Trip cannot be started")
            if row["status"] == "ready":
                cancelled = (
                    conn.execute(
                        select(_trips).where(
                            _trips.c.vehicle_id == row["vehicle_id"], _trips.c.status == "cancelled"
                        )
                    )
                    .mappings()
                    .all()
                )
                if any(_held_cargo(item) for item in cancelled):
                    raise _error(
                        409,
                        "cargo_recovery_required",
                        "Cancelled pickup cargo remains onboard; recovery is required before another trip",
                    )
                active = (
                    conn.execute(
                        select(_trips).where(
                            _trips.c.vehicle_id == row["vehicle_id"], _trips.c.status == "running"
                        )
                    )
                    .mappings()
                    .all()
                )
                if any(_project(other)["status"] == "running" for other in active):
                    raise _error(409, "vehicle_busy", "Vehicle already has an active trip")
            conn.execute(
                update(_trips)
                .where(_trips.c.id == str(trip_id), _trips.c.status == "ready")
                .values(status="running", started_at=_stamp())
            )
        return _project(get_row(trip_id))

    @app.post("/api/v1/dispatch/trips/{trip_id}/cancel")
    def cancel_trip(trip_id: UUID):
        row = get_row(trip_id)
        if _project(row)["status"] == "completed":
            raise _error(409, "trip_completed", "Completed trip cannot be cancelled")
        with app.state.store.engine.begin() as conn:
            conn.execute(
                update(_trips)
                .where(_trips.c.id == str(trip_id), _trips.c.status.in_(["ready", "running"]))
                .values(status="cancelled", cancelled_at=_stamp())
            )
        return _project(get_row(trip_id))
