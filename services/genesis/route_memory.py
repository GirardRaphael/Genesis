"""Bounded views of persisted trips; simulated observations never become GPS evidence."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
import hashlib
import json
from statistics import mean, median

from sqlalchemy import select


HISTORY_LIMIT = 500


def _hash(value) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _place(place: dict) -> dict:
    return {
        "label": " ".join(place["label"].casefold().split()),
        "coordinates": [round(float(c), 6) for c in place["coordinates"]],
    }


def delivery_key(delivery: dict) -> str:
    return _hash(
        {
            "pickup": _place(delivery["pickup"]),
            "dropoff": _place(delivery["dropoff"]),
            "parcels": delivery["parcels"],
            "deadline_minutes": delivery.get("deadline_minutes"),
        }
    )


def constraint_policy(request: dict) -> dict:
    """Only transport constraints, never model settings, prompt text or private geometry."""
    return {
        "version": 1,
        "capacity": 40,
        "max_duration_s": 28800,
        "depot": _place(request["depot"]),
        "vehicle_ids": sorted(request["vehicle_ids"]),
        "objective": request["objective"],
        "service_minutes": request["service_minutes"],
        **{
            key: str(Decimal(str(request[key])).normalize())
            for key in (
                "activation_cost_cad",
                "cost_per_km_cad",
                "driver_cost_per_hour_cad",
                "balance_value_cad_per_minute",
            )
        },
    }


def _order(request: dict) -> list[str]:
    return request.get("stop_order") or [
        f"{d['id']}:{kind}" for d in request["deliveries"] for kind in ("pickup", "dropoff")
    ]


def _identity(request: dict) -> tuple[str, str]:
    keys = {d["id"]: delivery_key(d) for d in request["deliveries"]}
    route_id = _hash(
        {
            "deliveries": sorted(keys.values()),
            "service_seconds": request.get("service_seconds", 0),
            "policy": request.get("broker_policy"),
        }
    )
    # Retain occurrence identity for duplicate identical deliveries without binding to user IDs.
    occurrences, seen = {}, defaultdict(int)
    for delivery in request["deliveries"]:
        key = keys[delivery["id"]]
        occurrences[delivery["id"]] = [key, seen[key]]
        seen[key] += 1
    order = [
        (*occurrences[stop.rsplit(":", 1)[0]], stop.rsplit(":", 1)[1]) for stop in _order(request)
    ]
    return route_id, _hash(order)


def _records(engine) -> list[dict]:
    from .dispatch import _project, _trips

    _trips.create(engine, checkfirst=True)
    with engine.connect() as conn:
        rows = (
            conn.execute(
                select(_trips)
                .order_by(_trips.c.created_at.desc(), _trips.c.id.desc())
                .limit(HISTORY_LIMIT)
            )
            .mappings()
            .all()
        )
    return [
        {"request": json.loads(row["request_json"]), "trip": _project(dict(row))} for row in rows
    ]


def _metrics(records: list[dict]) -> dict:
    completed = [r for r in records if r["trip"]["status"] == "completed"]
    durations = [r["trip"]["progress"]["elapsed_simulation_seconds"] for r in completed]
    distance = [r["trip"]["route"]["distance_km"] for r in completed]
    on_time = []
    for record in completed:
        deadlines = {d["id"]: d.get("deadline_minutes") for d in record["request"]["deliveries"]}
        for stop in record["trip"]["stops"]:
            deadline = deadlines[stop["delivery_id"]]
            if stop["kind"] == "dropoff" and deadline is not None:
                on_time.append(
                    stop["eta_seconds"] + record["request"].get("service_seconds", 0)
                    <= deadline * 60
                )
    return {
        "tracking_mode": "simulation",
        "trip_count": len(records),
        "completed_sample_count": len(completed),
        "frequent": len(completed) >= 2,
        "mean_elapsed_simulation_seconds": round(mean(durations), 1) if durations else None,
        "p50_elapsed_simulation_seconds": round(median(durations), 1) if durations else None,
        "mean_distance_km": round(mean(distance), 2) if distance else None,
        "deliveries_per_simulation_hour": round(
            sum(len(r["request"]["deliveries"]) for r in completed) * 3600 / sum(durations), 2
        )
        if sum(durations)
        else None,
        "on_time_rate": sum(on_time) / len(on_time) if on_time else None,
        "on_time_sample_count": len(on_time),
        "latest_used_at": max((r["trip"]["created_at"] for r in records), default=None),
        "latest_completed_at": max((r["trip"]["completed_at"] for r in completed), default=None),
    }


def route_history(engine) -> dict:
    records = _records(engine)
    groups = defaultdict(list)
    for record in records:
        groups[_identity(record["request"])[0]].append(record)
    items = []
    for route_id, group in groups.items():
        latest = group[0]
        variants = defaultdict(list)
        for record in group:
            variants[_identity(record["request"])[1]].append(record)
        variant_items = [
            {
                "id": variant_id,
                "stop_order": _order(rows[0]["request"]),
                "stops": [
                    {k: s[k] for k in ("kind", "label", "coordinates", "delivery_id")}
                    for s in rows[0]["trip"]["stops"]
                ],
                "latest_trip_id": rows[0]["trip"]["id"],
                **_metrics(rows),
            }
            for variant_id, rows in variants.items()
        ]
        observed = [v for v in variant_items if v["completed_sample_count"]]
        best = (
            min(
                observed,
                key=lambda v: (
                    v["mean_elapsed_simulation_seconds"],
                    v["mean_distance_km"],
                    v["id"],
                ),
            )
            if observed
            else None
        )
        items.append(
            {
                "id": route_id,
                "name": latest["trip"]["name"],
                "deliveries": latest["request"]["deliveries"],
                **_metrics(group),
                "variant_count": len(variants),
                "best_observed_variant_id": best["id"] if best else None,
                "variants": variant_items,
                "recent_trips": [
                    {k: r["trip"][k] for k in ("id", "status", "created_at", "completed_at")}
                    for r in group[:20]
                ],
            }
        )
    return {"items": items, "scanned_trip_count": len(records), "history_limit": HISTORY_LIMIT}


def route_context(engine, request: dict) -> dict:
    """Exact full broker missions only; callers must revalidate current roads and fleet."""
    from .dispatch import OSRM, _provider_base
    from .db import runs

    records = _records(engine)
    target_keys = sorted(delivery_key(d) for d in request["deliveries"])
    target_policy = constraint_policy(request)
    current_ids = defaultdict(list)
    for delivery in request["deliveries"]:
        current_ids[delivery_key(delivery)].append(delivery["id"])
    groups = defaultdict(list)
    for record in records:
        owner = record["request"].get("owner_run_id")
        if owner:
            groups[owner].append(record)
    candidates, matches = [], []
    with engine.connect() as conn:
        owners = {
            r["id"]: r
            for r in conn.execute(select(runs).where(runs.c.id.in_(list(groups)))).mappings()
        }
    base = _provider_base("GENESIS_ROUTER_URL", OSRM) + "/route/v1/driving/"
    for owner, group in groups.items():
        run = owners.get(owner)
        if not run or run["status"] != "succeeded":
            continue
        detail = run["detail"]
        if detail.get("final_kind") != "accepted_plan" or set(
            detail.get("created_trip_ids", [])
        ) != {r["trip"]["id"] for r in group}:
            continue
        if any(
            r["trip"]["status"] != "completed" or r["request"].get("broker_policy") != target_policy
            for r in group
        ):
            continue
        deliveries = [d for r in group for d in r["request"]["deliveries"]]
        if sorted(delivery_key(d) for d in deliveries) != target_keys:
            continue
        plan = group[0]["request"].get("broker_plan", {})
        certificate = detail.get("certificate", {})
        if (
            not plan.get("input_hash")
            or not certificate.get("valid")
            or certificate.get("input_hash") != plan.get("input_hash")
            or certificate.get("solution_hash") != plan.get("solution_hash")
            or detail.get("artifact_ids", {}).get("certificate")
            != plan.get("certificate_artifact_id")
            or any(r["request"].get("broker_plan") != plan for r in group)
        ):
            continue
        matches.extend(group)
        # Ambiguous duplicate deliveries are useful statistics but unsafe order evidence.
        if any(len(ids) != 1 for ids in current_ids.values()):
            continue
        if any(
            not r["trip"]["route"].get("computed_at") or not r["trip"]["route"].get("source_url")
            for r in group
        ):
            continue
        mapping = {d["id"]: current_ids[delivery_key(d)][0] for d in deliveries}
        candidates.append(
            {
                "source_run_id": owner,
                "source_trip_ids": [r["trip"]["id"] for r in group],
                "problem_input_hash": plan["input_hash"],
                "solution_hash": plan["solution_hash"],
                "vehicle_routes": [
                    {
                        "vehicle_id": r["trip"]["vehicle_id"],
                        "stop_order": [
                            f"{mapping[s.rsplit(':', 1)[0]]}:{s.rsplit(':', 1)[1]}"
                            for s in _order(r["request"])
                        ],
                    }
                    for r in group
                ],
                "completed_at": max(r["trip"]["completed_at"] for r in group),
                "elapsed_simulation_seconds": max(
                    r["trip"]["route"]["duration_seconds"] for r in group
                ),
                "distance_km": round(sum(r["trip"]["route"]["distance_km"] for r in group), 2),
                "road_computed_at": min(r["trip"]["route"]["computed_at"] for r in group),
                "provider_matches": all(
                    r["trip"]["route"]["source_url"].startswith(base) for r in group
                ),
            }
        )
    candidates.sort(
        key=lambda c: (c["elapsed_simulation_seconds"], c["distance_km"], c["source_run_id"])
    )
    for index, candidate in enumerate(candidates[:3]):
        candidate["historical_rank"] = index + 1
    missions = defaultdict(list)
    for record in matches:
        missions[record["request"]["owner_run_id"]].append(record)
    elapsed = [
        max(r["trip"]["route"]["duration_seconds"] for r in group) for group in missions.values()
    ]
    distances = [
        sum(r["trip"]["route"]["distance_km"] for r in group) for group in missions.values()
    ]
    return {
        "scanned_trip_count": len(records),
        "history_limit": HISTORY_LIMIT,
        "matched_route_count": len({_identity(r["request"])[0] for r in matches}),
        "ranking_basis": "completed_simulated_mission_makespan_then_distance",
        **_metrics(matches),
        "completed_mission_count": len(missions),
        "completed_trip_sample_count": len(matches),
        "completed_sample_count": len(missions),
        "frequent": len(missions) >= 2,
        "sample_unit": "completed_mission",
        "mean_elapsed_simulation_seconds": round(mean(elapsed), 1) if elapsed else None,
        "p50_elapsed_simulation_seconds": round(median(elapsed), 1) if elapsed else None,
        "mean_distance_km": round(mean(distances), 2) if distances else None,
        "deliveries_per_simulation_hour": round(
            len(request["deliveries"]) * len(missions) * 3600 / sum(elapsed), 2
        )
        if sum(elapsed)
        else None,
        "candidates": candidates[:3],
    }
