"""Durable local intake; authoritative order payloads never change after admission."""

from __future__ import annotations

import csv
from datetime import date
import io
from typing import Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, Query
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy import func, insert, or_, select, update

from .db import Conflict, PROJECT_ID, budgets, digest, now, orders
from .dispatch import Place, _error, _inside


class OrderInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reference: str = Field(min_length=1, max_length=64)
    customer: str = Field(default="", max_length=120)
    service_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    pickup: Place
    dropoff: Place
    parcels: int = Field(ge=1, le=40)
    deadline_minutes: int = Field(default=120, ge=1, le=480)

    @field_validator("reference", mode="before")
    @classmethod
    def trimmed_reference(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("service_date")
    @classmethod
    def valid_date(cls, value):
        if value is not None:
            date.fromisoformat(value)
        return value

    @model_validator(mode="after")
    def boundaries(self):
        if any(not _inside(list(p.coordinates)) for p in (self.pickup, self.dropoff)):
            raise ValueError("Addresses must be within the Montréal demonstration area")
        return self


class OrderBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[OrderInput] = Field(min_length=1, max_length=10)


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    csv: str = Field(max_length=16384)


class CancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)


CSV_FIELDS = (
    "reference", "customer", "service_date", "pickup_label", "pickup_longitude",
    "pickup_latitude", "dropoff_label", "dropoff_longitude", "dropoff_latitude",
    "parcels", "deadline_minutes",
)


def preview_csv(value: str) -> dict:
    result = {"items": [], "errors": []}

    def error(row, field, message):
        result["errors"].append({"row": row, "field": field, "message": message})

    if len(value.encode("utf-8")) > 16384:
        error(1, "csv", "CSV exceeds 16 KiB")
        return result
    reader = csv.reader(io.StringIO(value.removeprefix("\ufeff"), newline=""), strict=True)
    try:
        header = next(reader, [])
        if len(header) != len(CSV_FIELDS) or set(header) != set(CSV_FIELDS):
            error(1, "header", "Expected each documented column exactly once")
            return result
        references = set()
        count = 0
        for count, fields in enumerate(reader, 1):
            row = reader.line_num
            if count > 10:
                error(row, "csv", "Import supports at most 10 orders")
                break
            if len(fields) != len(header):
                error(row, "csv", "Row has the wrong number of columns")
                continue
            source = dict(zip(header, fields))
            payload = {key: source[key] for key in ("reference", "customer", "parcels", "deadline_minutes")}
            payload["service_date"] = source["service_date"] or None
            for kind in ("pickup", "dropoff"):
                payload[kind] = {
                    "label": source[f"{kind}_label"],
                    "coordinates": [source[f"{kind}_longitude"], source[f"{kind}_latitude"]],
                }
            try:
                item = OrderInput.model_validate(payload).model_dump(mode="json")
            except ValidationError as exc:
                for issue in exc.errors(include_input=False, include_url=False):
                    error(row, ".".join(map(str, issue["loc"])) or "order", issue["msg"])
                continue
            key = item["reference"].casefold()
            if key in references:
                error(row, "reference", "Reference occurs more than once in this import")
                continue
            references.add(key)
            result["items"].append(item)
        if count == 0:
            error(2, "csv", "Import requires at least one order")
    except csv.Error:
        error(reader.line_num or 1, "csv", "Malformed quoted CSV")
    return result


def public_order(row):
    return {**row["input"], **{key: row[key] for key in (
        "id", "status", "plan_id", "version", "created_at", "updated_at",
    )}}


def claim_orders(conn, request, run_id):
    ids = request["order_ids"]
    if request.get("workflow_kind") != "broker" or not 1 <= len(ids) <= 10 or len(set(ids)) != len(ids):
        raise Conflict("Invalid tracked order selection")
    selected = conn.execute(select(orders).where(
        orders.c.project_id == PROJECT_ID, orders.c.id.in_(ids),
    ).order_by(orders.c.id).with_for_update()).mappings().all()
    deliveries = request.get("deliveries", [])
    by_id = {item["id"]: item for item in deliveries}
    if len(selected) != len(ids) or len(deliveries) != len(ids) or set(by_id) != set(ids):
        raise Conflict("Deliveries must exactly match selected orders")
    for row in selected:
        expected = {key: row["input"][key] for key in (
            "pickup", "dropoff", "parcels", "deadline_minutes",
        )}
        expected["id"] = row["id"]
        if by_id[row["id"]] != expected:
            raise Conflict("Delivery content differs from the saved order")
        if row["status"] != "open":
            raise Conflict("Selected order is no longer open")
    conn.execute(update(orders).where(
        orders.c.project_id == PROJECT_ID, orders.c.id.in_(ids),
    ).values(status="planning", plan_id=run_id, version=orders.c.version + 1, updated_at=now()))


def release_rejected_proposal(conn, run, trips):
    """Called with the owner run locked, as in trip start and run finalization."""
    expected_ids = run["detail"].get("created_trip_ids", [])
    if (
        run["status"] != "succeeded"
        or run["detail"].get("final_kind") != "accepted_plan"
        or not expected_ids
        or set(expected_ids) != {trip["id"] for trip in trips}
        or any(trip["status"] != "cancelled" or trip["started_at"] is not None for trip in trips)
    ):
        return
    conn.execute(update(orders).where(
        orders.c.project_id == PROJECT_ID, orders.c.plan_id == run["id"],
        orders.c.status == "planned",
    ).values(status="open", plan_id=None, version=orders.c.version + 1, updated_at=now()))


def register_orders(app: FastAPI) -> None:
    store = app.state.store

    @app.get("/api/v1/orders")
    def list_orders(
        q: str = Query(default="", max_length=120),
        status: Literal["open", "planning", "planned", "cancelled"] | None = None,
        limit: int = Query(default=50, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=100000),
    ):
        filters = [orders.c.project_id == PROJECT_ID]
        if status is not None:
            filters.append(orders.c.status == status)
        if q.strip():
            # Escape SQL wildcard characters; search is literal operator text.
            pattern = "%" + q.strip().casefold().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            filters.append(or_(
                orders.c.reference_key.like(pattern, escape="\\"),
                func.lower(orders.c.input["customer"].as_string()).like(pattern, escape="\\"),
            ))
        with store.engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(orders).where(*filters)).scalar_one()
            rows = conn.execute(select(orders).where(*filters).order_by(
                orders.c.created_at.desc(), orders.c.id.desc(),
            ).offset(offset).limit(limit)).mappings().all()
        return {"items": [public_order(row) for row in rows], "total": total}

    @app.post("/api/v1/orders/batch", status_code=201)
    def create_orders(body: OrderBatch):
        saved = []
        with store.transaction() as conn:
            conn.execute(select(budgets.c.project_id).where(
                budgets.c.project_id == PROJECT_ID,
            ).with_for_update()).one()
            for item in body.items:
                payload = item.model_dump(mode="json")
                key = payload["reference"].casefold()
                fingerprint = digest({**payload, "reference": key})
                old = conn.execute(select(orders).where(
                    orders.c.project_id == PROJECT_ID, orders.c.reference_key == key,
                )).mappings().first()
                if old:
                    if old["input_hash"] != fingerprint:
                        raise _error(409, "order_reference_conflict", "Reference belongs to different order content")
                    saved.append(public_order(old))
                    continue
                row = dict(
                    id=str(uuid4()), project_id=PROJECT_ID, reference_key=key,
                    input=payload, input_hash=fingerprint, status="open", plan_id=None,
                    version=1, created_at=now(), updated_at=now(),
                )
                conn.execute(insert(orders).values(**row))
                saved.append(public_order(row))
        return {"items": saved, "total": len(saved)}

    @app.post("/api/v1/orders/import/preview")
    def import_preview(body: ImportRequest):
        return preview_csv(body.csv)

    @app.post("/api/v1/orders/{order_id}/cancel")
    def cancel_order(order_id: UUID, body: CancelRequest):
        with store.transaction() as conn:
            old = conn.execute(select(orders).where(
                orders.c.project_id == PROJECT_ID, orders.c.id == str(order_id),
            ).with_for_update()).mappings().first()
            if old is None:
                raise _error(404, "order_not_found", "Order not found")
            if old["status"] == "cancelled" and body.version in {old["version"], old["version"] - 1}:
                return public_order(old)
            if old["status"] != "open" or old["version"] != body.version:
                raise _error(409, "order_version_conflict", "Only the current open order can be cancelled")
            changes = {"status": "cancelled", "version": old["version"] + 1, "updated_at": now()}
            conn.execute(update(orders).where(orders.c.id == str(order_id)).values(**changes))
            return public_order({**old, **changes})
