"""Loopback-only demonstration API; hosted authentication is deliberately not enabled."""

from __future__ import annotations

import asyncio
from datetime import datetime
from decimal import Decimal
import json
import os
from typing import Literal
from uuid import UUID, uuid4
from urllib.parse import urlsplit

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from .db import Conflict, Store, TERMINAL, digest, now
from .llm import LiveUnavailable, live_configuration
from .traffic import router as traffic_router
from .dispatch import register_dispatch
from .broker_api import register_broker

load_dotenv()
POLICIES = ["baseline_only", "solver_with_one_replan", "broker_dispatch"]


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: Literal["S01", "S02", "S03", "S04", "S05"]
    policy: Literal["baseline_only", "solver_with_one_replan"] = "solver_with_one_replan"
    seed: int = Field(default=17, ge=0, le=2147483647)
    mode: Literal["fixture", "live"] = "fixture"
    budget_usd: Decimal | None = Field(default=None, gt=0, le=50)


def summary(row):
    from .scenarios import SCENARIOS

    request = row["request"]
    detail = row["detail"]
    duration = detail.get("duration_ms")
    if "duration_ms" not in detail and row["started_at"] and row["finished_at"]:
        duration = max(
            0,
            int(
                (
                    datetime.fromisoformat(row["finished_at"])
                    - datetime.fromisoformat(row["started_at"])
                ).total_seconds()
                * 1000
            ),
        )
    return {
        "id": row["id"],
        "scenario_id": request["scenario_id"],
        "workflow_kind": request.get("workflow_kind", "logistics"),
        "scenario_label": next(
            (s["label"] for s in SCENARIOS if s["id"] == request["scenario_id"]),
            "Livraisons personnalisées"
            if request["scenario_id"] == "BROKER"
            else request["scenario_id"],
        ),
        "policy": request["policy"],
        "seed": request["seed"],
        "provenance": request["mode"],
        "status": row["status"],
        "created_at": row["created_at"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
        "duration_ms": duration,
        "metrics": detail.get("metrics"),
        "final_kind": detail.get("final_kind"),
    }


def detail(row):
    public = {k: v for k, v in row["detail"].items() if k != "node_results"}
    return {
        **summary(row),
        **public,
        "last_seq": row["last_seq"],
        "cancel_requested": row["cancel_requested"],
        "project_id": row["project_id"],
        "request": row["request"],
        "model_policy_id": "configured-role-tiers-v1"
        if row["request"]["mode"] == "live"
        else "deterministic-fixture-v1",
        "schema_version": "v1",
    }


def create_app(store=None):
    app = FastAPI(
        title="Genesis Logistics Observatory",
        version="1.0.0",
        description="Synthetic local demo. Fixture workflows are excluded from live-model experiment evidence.",
    )
    app.include_router(traffic_router)
    app.state.store = store or Store()
    register_dispatch(app)
    app.state.reload_local_env = store is None
    register_broker(app)

    def refresh_local_configuration():
        if app.state.reload_local_env:
            load_dotenv(override=True)

    host = os.getenv("GENESIS_DEMO_HOST", "127.0.0.1")
    if host not in {"127.0.0.1", "::1", "localhost"}:
        raise RuntimeError("Unauthenticated demo must bind to loopback")

    @app.middleware("http")
    async def boundary(request, call_next):
        request_id = str(uuid4())
        try:
            authority = urlsplit("http://" + request.headers.get("host", ""))
            host = authority.hostname
            valid_authority = (
                not authority.username and not authority.password and not authority.path
            )
        except ValueError:
            host, valid_authority = None, False
        client = request.client.host if request.client else ""
        local_client = client in {"testclient", "127.0.0.1", "::1"}
        local_host = valid_authority and host in {"localhost", "127.0.0.1", "testserver", "::1"}
        if not local_client or not local_host:
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "local_demo_only",
                        "message": "Unauthenticated demo accepts loopback requests only",
                        "request_id": request_id,
                        "retryable": False,
                    }
                },
            )
        origin = request.headers.get("origin")
        allowed_origins = {
            f"http://{hostname}:{port}"
            for hostname in ("localhost", "127.0.0.1", "[::1]")
            for port in (5173, 8000)
        }
        if origin and origin not in allowed_origins:
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "origin_rejected",
                        "message": "Local origin required",
                        "request_id": request_id,
                        "retryable": False,
                    }
                },
            )
        try:
            length = int(request.headers.get("content-length", "0"))
            if length < 0:
                raise ValueError("Negative content length")
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "error": {
                        "code": "invalid_content_length",
                        "message": "Invalid content length",
                        "request_id": request_id,
                        "retryable": False,
                    }
                },
            )
        too_large = length > 16384
        if not too_large and request.method in {"POST", "PUT", "PATCH"}:
            chunks, size = [], 0
            async for chunk in request.stream():
                size += len(chunk)
                if size > 16384:
                    too_large = True
                    break
                chunks.append(chunk)
            if not too_large:
                # Starlette's cached middleware request replays this bounded body downstream.
                request._body = b"".join(chunks)
        if too_large:
            return JSONResponse(
                status_code=413,
                content={
                    "error": {
                        "code": "payload_too_large",
                        "message": "Request exceeds demo limit",
                        "request_id": request_id,
                        "retryable": False,
                    }
                },
            )
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        value = (
            exc.detail
            if isinstance(exc.detail, dict)
            else {"code": "request_rejected", "message": str(exc.detail), "retryable": False}
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {**value, "request_id": getattr(request.state, "request_id", str(uuid4()))}
            },
        )

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "invalid_input",
                    "message": "Request fields or query bounds are invalid",
                    "request_id": getattr(request.state, "request_id", str(uuid4())),
                    "retryable": False,
                }
            },
        )

    def get(run_id):
        try:
            return app.state.store.get_run(str(run_id))
        except KeyError:
            raise HTTPException(
                404, {"code": "run_not_found", "message": "Run not found", "retryable": False}
            )

    def filters(scenario_id, status, policy, provenance, agent=None, model=None):
        from .scenarios import SCENARIOS

        if scenario_id and scenario_id not in {s["id"] for s in SCENARIOS} | {"BROKER"}:
            raise HTTPException(422, "Unknown scenario")
        if status and status not in TERMINAL | {"queued", "running"}:
            raise HTTPException(422, "Unknown status")
        if policy and policy not in POLICIES:
            raise HTTPException(422, "Unknown logistics policy")
        if provenance and provenance not in {"fixture", "live"}:
            raise HTTPException(422, "Unknown provenance")
        if agent and agent not in {
            "planning",
            "traffic",
            "optimization",
            "monitoring",
            "exception",
        }:
            raise HTTPException(422, "Unknown agent")
        if model and len(model) > 128:
            raise HTTPException(422, "Model filter exceeds identifier limit")
        return {
            "scenario_id": scenario_id,
            "status": status,
            "policy": policy,
            "provenance": provenance,
            "agent": agent,
            "model": model,
        }

    @app.get("/api/v1/health")
    def health():
        refresh_local_configuration()
        reasons = []
        for role in ["planning", "traffic", "monitoring"]:
            try:
                live_configuration(role)
            except LiveUnavailable as exc:
                reasons.append(str(exc))
        return {
            "status": "ok",
            "provider": os.getenv("GENESIS_PROVIDER", "anthropic"),
            "profile": "loopback_synthetic_demo",
            "live_available": not reasons,
            "live_unavailable_reasons": list(dict.fromkeys(reasons)),
            "worker_required": True,
        }

    @app.get("/api/v1/scenarios")
    def scenarios():
        from .scenarios import SCENARIOS

        return {
            "items": [
                *SCENARIOS,
                {
                    "id": "BROKER",
                    "label": "Livraisons personnalisées",
                    "description": "Planification multi-véhicules sur des adresses choisies",
                },
            ]
        }

    @app.get("/api/v1/datasets")
    def datasets():
        from .scenarios import SCENARIOS

        return {
            "items": [
                {
                    "id": "synthetic-grid-v1:" + s["id"],
                    "scenario_id": s["id"],
                    "provenance": "synthetic",
                    "generator_version": "synthetic-grid-v1",
                }
                for s in SCENARIOS
            ]
        }

    @app.post("/api/v1/runs", status_code=202)
    def create_run(
        body: RunRequest, idempotency_key: str | None = Header(default=None, max_length=128)
    ):
        refresh_local_configuration()
        if body.mode == "live":
            if body.budget_usd is None:
                raise HTTPException(422, "Live execution requires explicit budget_usd")
            try:
                for role in ["planning", "traffic", "monitoring"]:
                    live_configuration(role)
            except LiveUnavailable as exc:
                raise HTTPException(
                    503, {"code": "live_unavailable", "message": str(exc), "retryable": False}
                )
        elif body.budget_usd is not None:
            raise HTTPException(422, "Fixture mode cannot carry model spend budget")
        request_data = body.model_dump(mode="json")
        if body.mode == "live":
            request_data["provider"] = os.getenv("GENESIS_PROVIDER", "anthropic")
            request_data["model_policy"] = {
                role: live_configuration(role)[0]
                for role in ("planning", "traffic", "optimization", "monitoring", "exception")
            }
        try:
            row = app.state.store.create_run(request_data, idempotency_key or str(uuid4()))
        except Conflict as exc:
            raise HTTPException(
                409, {"code": "idempotency_conflict", "message": str(exc), "retryable": False}
            )
        return summary(row)

    @app.get("/api/v1/runs")
    def run_list(
        scenario_id: str | None = None,
        status: str | None = None,
        policy: str | None = None,
        provenance: str | None = None,
        agent: str | None = None,
        model: str | None = None,
        limit: int = Query(50, ge=1, le=200),
        cursor: str | None = None,
    ):
        rows = app.state.store.list_runs(
            filters(scenario_id, status, policy, provenance, agent, model)
        )
        total = len(rows)
        snapshot = digest([[r["id"], r["last_seq"], r["status"]] for r in rows])
        if cursor:
            try:
                cursor_id = str(UUID(cursor))
                position = next(i for i, r in enumerate(rows) if r["id"] == cursor_id) + 1
            except (ValueError, StopIteration):
                raise HTTPException(
                    409,
                    {
                        "code": "snapshot_expired",
                        "message": "Pagination cursor is no longer in cohort",
                        "retryable": True,
                    },
                )
            rows = rows[position:]
        page = rows[:limit]
        return {
            "items": [summary(r) for r in page],
            "total": total,
            "snapshot": snapshot,
            "next_cursor": page[-1]["id"] if len(rows) > limit else None,
        }

    @app.get("/api/v1/runs/{run_id}")
    def run_detail(run_id: UUID):
        return detail(get(run_id))

    @app.post("/api/v1/runs/{run_id}/cancel", status_code=202)
    def cancel(run_id: UUID):
        get(run_id)
        return summary(app.state.store.cancel(str(run_id)))

    @app.get("/api/v1/runs/{run_id}/events")
    def event_history(
        run_id: UUID, after_seq: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=500)
    ):
        row = get(run_id)
        if after_seq > row["last_seq"]:
            raise HTTPException(
                409,
                {
                    "code": "snapshot_expired",
                    "message": "Cursor exceeds last committed sequence",
                    "retryable": True,
                },
            )
        items = app.state.store.history(str(run_id), after_seq, limit)
        items = [{k: v for k, v in item.items() if k != "payload_hash"} for item in items]
        next_seq = items[-1]["run_seq"] if items else after_seq
        return {"items": items, "next_seq": next_seq, "has_more": next_seq < row["last_seq"]}

    @app.get("/api/v1/runs/{run_id}/stream")
    async def stream(
        run_id: UUID,
        request: Request,
        after_seq: int = Query(0, ge=0),
        last_event_id: str | None = Header(default=None),
    ):
        row = get(run_id)
        try:
            sequence = int(last_event_id) if last_event_id is not None else after_seq
        except ValueError:
            raise HTTPException(422, "Invalid Last-Event-ID")
        if sequence < 0 or sequence > row["last_seq"]:
            raise HTTPException(
                409,
                {
                    "code": "snapshot_expired",
                    "message": "Invalid committed-event cursor",
                    "retryable": True,
                },
            )

        async def follow():
            cursor = sequence
            idle = 0
            while not await request.is_disconnected():
                items = await asyncio.to_thread(app.state.store.history, str(run_id), cursor, 200)
                for item in items:
                    cursor = item["run_seq"]
                    item.pop("payload_hash", None)
                    yield f"id: {cursor}\nevent: genesis\ndata: {json.dumps(item, separators=(',', ':'))}\n\n"
                current = await asyncio.to_thread(get, run_id)
                if current["status"] in TERMINAL and cursor >= current["last_seq"]:
                    return
                if not items:
                    idle += 1
                    if idle % 15 == 0:
                        yield ": heartbeat\n\n"
                    await asyncio.sleep(1)

        return StreamingResponse(
            follow(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/v1/artifacts/{artifact_id}")
    def artifact(artifact_id: UUID):
        try:
            return app.state.store.artifact(str(artifact_id))
        except KeyError:
            raise HTTPException(404, "Artifact not found")

    @app.get("/api/v1/route-plans/{plan_id}")
    def route_plan(plan_id: UUID):
        for row in app.state.store.list_runs():
            plans = [row["detail"].get(key) for key in ["baseline", "candidate", "selected_plan"]]
            plans.append(row["detail"].get("simulation", {}).get("replan_plan"))
            for plan in plans:
                if plan and plan["id"] == str(plan_id):
                    return plan
        raise HTTPException(404, "Route plan not found")

    @app.get("/api/v1/route-plans/{plan_id}/geometry")
    def geometry(plan_id: UUID):
        plan = route_plan(plan_id)
        return {
            "plan_id": plan["id"],
            "source": "schematic synthetic grid — not road verified",
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"vehicle_id": r["vehicle_id"]},
                    "geometry": {"type": "LineString", "coordinates": r["geometry"]},
                }
                for r in plan["routes"]
                if len(r["geometry"]) >= 2
            ],
        }

    @app.get("/api/v1/runs/{run_id}/fleet-metrics")
    def fleet(run_id: UUID):
        return {
            "run_id": str(run_id),
            "metrics": get(run_id)["detail"].get("metrics"),
            "provenance": "deterministic synthetic simulation",
        }

    @app.get("/api/v1/runs/{run_id}/usage")
    def run_usage(run_id: UUID, as_of_seq: int | None = Query(None, ge=0)):
        from .telemetry import usage_projection

        row = get(run_id)
        if as_of_seq is not None and as_of_seq > row["last_seq"]:
            raise HTTPException(409, "Usage cursor exceeds committed events")
        return {
            "run_id": str(run_id),
            **usage_projection(app.state.store, [row], as_of_seq=as_of_seq),
        }

    @app.get("/api/v1/usage")
    def cohort_usage(
        scenario_id: str | None = None,
        status: str | None = None,
        policy: str | None = None,
        provenance: str | None = None,
        agent: str | None = None,
        model: str | None = None,
        limit: int = Query(200, ge=1, le=500),
    ):
        from .telemetry import usage_projection

        rows = app.state.store.list_runs(
            filters(scenario_id, status, policy, provenance, agent, model)
        )
        projection = usage_projection(app.state.store, rows, agent, model)
        projection["attempts_total"] = len(projection["attempts"])
        projection["attempts"] = projection["attempts"][:limit]
        return projection

    @app.get("/api/v1/usage/overall")
    def overall_usage():
        from .telemetry import usage_projection

        rows = app.state.store.list_runs()
        projection = usage_projection(app.state.store, rows)
        projection.pop("attempts")
        return {
            "scope": "all stored requests, independent of dashboard filters",
            "total_requests": len(rows),
            "handled_requests": sum(row["status"] in TERMINAL for row in rows),
            "live_requests": sum(row["request"]["mode"] == "live" for row in rows),
            "fixture_requests": sum(row["request"]["mode"] == "fixture" for row in rows),
            "budget": app.state.store.budget_state(),
            **projection,
        }

    @app.get("/api/v1/budget-alerts")
    def budget_alert_status():
        refresh_local_configuration()
        from .notifications import notification_status

        return notification_status(app.state.store)

    @app.get("/api/v1/runs/{run_id}/simulation-events")
    def simulation_events(
        run_id: UUID, as_of_s: int | None = Query(None, ge=0), limit: int = Query(200, ge=1, le=500)
    ):
        row = get(run_id)
        # Simulation artifacts become visible only after their synchronous tool completes.
        simulation = row["detail"].get("simulation") or row["detail"].get("node_results", {}).get(
            "monitoring", {}
        ).get("simulation", {})
        items = simulation.get("events", [])
        if as_of_s is not None:
            items = [event for event in items if event["sim_time_s"] <= as_of_s]
        return {
            "items": items[:limit],
            "total": len(items),
            "simulation_complete": simulation.get("simulation_complete", False),
            "clock": "seconds from service day origin",
        }

    @app.get("/api/v1/comparisons")
    def comparison(left: UUID, right: UUID):
        a, b = get(left), get(right)
        comparable = not any(
            row["request"].get("workflow_kind") == "broker" for row in (a, b)
        ) and all(
            a["request"].get(k) == b["request"].get(k) for k in ["scenario_id", "seed", "mode"]
        )
        return {
            "left": detail(a),
            "right": detail(b),
            "input_comparable": comparable,
            "manifest_comparable": a["detail"].get("simulation", {}).get("manifest_hash")
            == b["detail"].get("simulation", {}).get("manifest_hash"),
            "limitations": "Compare coverage, independent feasibility and realized service before declaring improvement",
        }

    @app.get("/api/v1/metrics")
    def metrics(
        scenario_id: str | None = None,
        status: str | None = None,
        policy: str | None = None,
        provenance: str | None = None,
        agent: str | None = None,
        model: str | None = None,
    ):
        rows = app.state.store.list_runs(
            filters(scenario_id, status, policy, provenance, agent, model)
        )
        summaries = [summary(r) for r in rows]

        def matches(item):
            return (not agent or item["role"] == agent) and (
                not model or model in {item.get("model"), item.get("requested_model")}
            )

        agents = [a for r in rows for a in r["detail"].get("agents", []) if matches(a)]
        denominator = sum(
            r["status"] in {"succeeded", "failed", "timed_out", "budget_exceeded"} for r in rows
        )
        numerator = sum(r["status"] == "succeeded" for r in rows)
        durations = [r["duration_ms"] for r in summaries if r["duration_ms"] is not None]
        aggregates = []
        heatmap = []
        for role in ["planning", "traffic", "optimization", "monitoring", "exception"]:
            matching = [a for a in agents if a["role"] == role]
            finished = [a for a in matching if a["status"] in {"succeeded", "failed", "cancelled"}]
            aggregates.append(
                {
                    "role": role,
                    "count": len(matching),
                    "duration_count": len(finished),
                    "mean_duration_ms": sum(a["duration_ms"] for a in finished) / len(finished)
                    if finished
                    else None,
                }
            )
            for sid in ["S01", "S02", "S03", "S04", "S05", "BROKER"]:
                group = [
                    a
                    for r in rows
                    if r["request"]["scenario_id"] == sid
                    for a in r["detail"].get("agents", [])
                    if a["role"] == role and matches(a)
                ]
                measured = [a for a in group if a["status"] in {"succeeded", "failed", "cancelled"}]
                heatmap.append(
                    {
                        "scenario_id": sid,
                        "role": role,
                        "count": len(group),
                        "duration_count": len(measured),
                        "mean_duration_ms": sum(a["duration_ms"] for a in measured) / len(measured)
                        if measured
                        else None,
                    }
                )
        metric_events = [
            e
            for r in rows
            for e in app.state.store.history(
                r["id"],
                0,
                500,
                kinds={"model.started", "model.completed", "model.failed", "tool.failed"},
            )
        ]
        calls = [
            e
            for e in metric_events
            if e["kind"].startswith("model.") and e["kind"] != "model.started"
        ]
        known = [e["payload"] for e in calls if e["payload"].get("input_tokens") is not None]
        known_cost = [e["payload"] for e in calls if e["payload"].get("cost_usd") is not None]
        errors = sum(e["kind"] in {"tool.failed", "model.failed"} for e in metric_events)
        used = [a for a in aggregates if a["count"]]
        timed = [a for a in used if a["mean_duration_ms"] is not None]
        return {
            "total_runs": len(rows),
            "fixture_runs": sum(r["request"]["mode"] == "fixture" for r in rows),
            "live_runs": sum(r["request"]["mode"] == "live" for r in rows),
            "success_rate": numerator / denominator if denominator else None,
            "success_numerator": numerator,
            "success_denominator": denominator,
            "mean_duration_ms": sum(durations) / len(durations) if durations else None,
            "duration_count": len(durations),
            "total_tokens": sum(v["input_tokens"] + v["output_tokens"] for v in known)
            if known
            else None,
            "api_cost_usd": str(sum((Decimal(v["cost_usd"]) for v in known_cost), Decimal(0)))
            if known_cost
            else None,
            "usage_coverage": len(known) / len(calls) if calls else 0,
            "cost_coverage": len(known_cost) / len(calls) if calls else 0,
            "errors": errors,
            "most_used_agent": max(used, key=lambda a: a["count"])["role"] if used else None,
            "slowest_agent": max(timed, key=lambda a: a["mean_duration_ms"])["role"]
            if timed
            else None,
            "agents": aggregates,
            "scenario_agents": heatmap,
            "quality": None,
            "quality_coverage": 0,
            "snapshot": digest([[r["id"], r["last_seq"]] for r in rows]),
            "refreshed_at": now(),
            "units": {
                "api_cost": "USD estimate",
                "fleet_cost": "synthetic CAD estimate",
                "duration": "actual milliseconds",
                "simulation": "simulated seconds",
                "tokens": "provider-reported only",
            },
        }

    return app


app = create_app()
