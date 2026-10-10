"""Strict local API for multi-van pickup and delivery planning."""

from __future__ import annotations

from decimal import Decimal
import hashlib
import json
import os
from typing import Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .db import Conflict
from .dispatch import Delivery, Place, _inside, fleet_snapshot
from .llm import LiveUnavailable, live_configuration


class BrokerDelivery(Delivery):
    deadline_minutes: int = Field(default=120, ge=1, le=480)


class BrokerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    deliveries: list[BrokerDelivery] = Field(min_length=1, max_length=10)
    depot: Place
    vehicle_ids: list[Literal["van1", "van2", "van3", "van4"]] = Field(default_factory=lambda: ["van1", "van2", "van3", "van4"], min_length=1, max_length=4)
    objective: Literal["cost", "fastest", "balanced"] = "balanced"
    activation_cost_cad: Decimal = Field(default=Decimal("18"), ge=0, le=10000)
    cost_per_km_cad: Decimal = Field(default=Decimal("0.95"), ge=0, le=1000)
    driver_cost_per_hour_cad: Decimal = Field(default=Decimal("28"), ge=0, le=1000)
    service_minutes: int = Field(default=2, ge=0, le=60)
    balance_value_cad_per_minute: Decimal = Field(default=Decimal("0.50"), ge=0, le=1000)
    mode: Literal["live", "fixture"] = "live"
    budget_usd: Decimal | None = Field(default=Decimal("1"), gt=0, le=50)

    @model_validator(mode="after")
    def boundaries(self):
        if len(set(self.vehicle_ids)) != len(self.vehicle_ids):
            raise ValueError("vehicle_ids must be unique")
        if not _inside(list(self.depot.coordinates)):
            raise ValueError("depot outside Montréal demonstration area")
        if any(not _inside(list(place.coordinates)) for d in self.deliveries for place in (d.pickup, d.dropoff)):
            raise ValueError("delivery outside Montréal demonstration area")
        if self.mode == "fixture" and self.budget_usd is not None:
            # The default live budget is ignored for explicitly chosen fixture runs.
            self.budget_usd = None
        if self.mode == "live" and self.budget_usd is None:
            raise ValueError("live mode requires a USD budget")
        return self


def _public(row):
    return {
        "id": row["id"], "workflow_kind": "broker", "status": row["status"],
        "created_at": row["created_at"], "started_at": row["started_at"],
        "finished_at": row["finished_at"], "objective": row["request"]["objective"],
        "delivery_count": len(row["request"]["deliveries"]),
        "provenance": row["request"]["mode"],
        "final_kind": row["detail"].get("final_kind"),
        "created_trip_ids": row["detail"].get("created_trip_ids", []),
    }


def register_broker(app: FastAPI) -> None:
    @app.post("/api/v1/dispatch/plans", status_code=202)
    def create_plan(body: BrokerRequest, idempotency_key: str | None = Header(default=None, min_length=1, max_length=128)):
        if app.state.reload_local_env:
            from dotenv import load_dotenv
            load_dotenv(override=True)
        original = body.model_dump(mode="json")
        request = json.loads(json.dumps(original))
        for index, delivery in enumerate(request["deliveries"]):
            if not delivery["id"]:
                source = json.dumps({"request": original, "index": index}, sort_keys=True, separators=(",", ":"))
                delivery["id"] = "d-" + hashlib.sha256(source.encode()).hexdigest()[:16]
        if len({d["id"] for d in request["deliveries"]}) != len(request["deliveries"]):
            raise HTTPException(422, {"code": "duplicate_delivery_id", "message": "Delivery IDs must be unique", "retryable": False})
        if idempotency_key:
            old = next((r for r in app.state.store.list_runs() if r["idempotency_key"] == idempotency_key), None)
            if old:
                if not all(old["request"].get(key) == value for key, value in request.items()):
                    raise HTTPException(409, {"code": "idempotency_conflict", "message": "Key belongs to a different plan", "retryable": False})
                return _public(old)
        snapshot = fleet_snapshot(app.state.store.engine, request["vehicle_ids"], request["depot"])
        if not any(vehicle["available"] for vehicle in snapshot["vehicles"]):
            raise HTTPException(409, {"code": "fleet_unavailable", "message": "No selected van is free for a new plan", "retryable": True})
        request.update({"scenario_id": "BROKER", "policy": "broker_dispatch", "seed": 0, "workflow_kind": "broker"})
        if body.mode == "live":
            try:
                request["provider"] = os.getenv("GENESIS_PROVIDER", "anthropic")
                request["model_policy"] = {role: live_configuration(role)[0] for role in ("planning", "traffic", "optimization", "monitoring", "exception")}
            except LiveUnavailable as exc:
                raise HTTPException(503, {"code": "live_unavailable", "message": str(exc), "retryable": False}) from exc
        try:
            row = app.state.store.create_run(request, idempotency_key or str(uuid4()))
        except Conflict as exc:
            raise HTTPException(409, {"code": "idempotency_conflict", "message": str(exc), "retryable": False}) from exc
        return _public(row)

    @app.get("/api/v1/dispatch/plans")
    def list_plans(limit: int = Query(50, ge=1, le=100)):
        rows = [r for r in app.state.store.list_runs() if r["request"].get("workflow_kind") == "broker"]
        return {"items": [_public(r) for r in rows[:limit]], "total": len(rows)}

    @app.get("/api/v1/dispatch/plans/{run_id}")
    def plan_detail(run_id: UUID):
        from .api import detail
        try:
            row = app.state.store.get_run(str(run_id))
        except KeyError:
            raise HTTPException(404, {"code": "plan_not_found", "message": "Broker plan not found", "retryable": False})
        if row["request"].get("workflow_kind") != "broker":
            raise HTTPException(404, {"code": "plan_not_found", "message": "Broker plan not found", "retryable": False})
        return {**detail(row), "workflow_kind": "broker"}
