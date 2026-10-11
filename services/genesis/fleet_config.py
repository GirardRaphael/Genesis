"""Bounded local van roster, bound to a process and fenced against database changes."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import threading

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import Column, String, Table, Text, insert, select, text, update

from .db import metadata


VEHICLE_ID_PATTERN = r"^[a-z][a-z0-9_-]{0,7}$"
MAX_VEHICLES = 10


class Van(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)
    id: str = Field(pattern=VEHICLE_ID_PATTERN)
    name: str = Field(min_length=1, max_length=80)
    capacity_parcels: int = Field(ge=1, le=40)

    @model_validator(mode="after")
    def visible_name(self):
        if not self.name.strip() or any(ord(char) < 32 for char in self.name):
            raise ValueError("Van name must be visible text")
        return self


class FleetConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)
    version: int = Field(default=1, ge=1, le=1)
    vehicles: list[Van] = Field(min_length=1, max_length=MAX_VEHICLES)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({van.id for van in self.vehicles}) != len(self.vehicles):
            raise ValueError("Van IDs must be unique")
        return self

    @property
    def fingerprint(self) -> str:
        return hashlib.sha256(self.model_dump_json().encode()).hexdigest()


def default_fleet() -> FleetConfig:
    return FleetConfig(
        vehicles=[
            Van(id=f"van{i}", name=f"Fourgonnette {i}", capacity_parcels=40) for i in range(1, 5)
        ]
    )


def load_fleet() -> FleetConfig:
    path = os.getenv("GENESIS_FLEET_CONFIG")
    if not path:
        return default_fleet()
    try:
        with Path(path).open("rb") as stream:
            raw = stream.read(16_385)
        if len(raw) > 16_384:
            raise ValueError("Fleet file too large")
        return FleetConfig.model_validate_json(raw)
    except (OSError, ValueError, ValidationError):
        # Do not disclose local paths or arbitrary contents in API/worker errors.
        raise ValueError(
            "Invalid local fleet configuration; expected 1–10 uniquely named vans with capacities 1–40"
        ) from None


_accepted_fleet = Table(
    "dispatch_fleet_config",
    metadata,
    Column("id", String(8), primary_key=True),
    Column("version", String(64), nullable=False),
    Column("config_json", Text, nullable=False),
)
_bind_lock = threading.RLock()


def _changed():
    return HTTPException(
        409,
        {
            "code": "fleet_configuration_changed",
            "message": "Fleet configuration changed; stop API and worker, resolve reserved work and cargo, then restart both with the same fleet",
            "retryable": False,
        },
    )


def bind_fleet(engine) -> FleetConfig:
    """Changing a roster requires a quiescent database; old processes cannot overwrite it."""
    with _bind_lock:
        if hasattr(engine, "_genesis_fleet"):
            return engine._genesis_fleet
        from .db import runs
        from .dispatch import _held_cargo, _project, _trips

        config = load_fleet()
        _trips.create(engine, checkfirst=True)
        _accepted_fleet.create(engine, checkfirst=True)
        with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                conn.exec_driver_sql("BEGIN IMMEDIATE")
            else:
                conn.begin()
                conn.execute(text("LOCK TABLE dispatch_trips IN SHARE ROW EXCLUSIVE MODE"))
                conn.execute(text("LOCK TABLE dispatch_fleet_config IN SHARE ROW EXCLUSIVE MODE"))
            current = conn.execute(select(_accepted_fleet)).mappings().first()
            previous = current["version"] if current else default_fleet().fingerprint
            trips = conn.execute(select(_trips)).mappings().all()
            locked = [
                row
                for row in trips
                if _project(row)["status"] in {"ready", "running"} or _held_cargo(row)
            ]
            if any(row["vehicle_id"] not in {van.id for van in config.vehicles} for row in locked):
                raise _changed()
            if previous != config.fingerprint:
                pending = (
                    conn.execute(
                        select(runs.c.request).where(runs.c.status.in_(["queued", "running"]))
                    )
                    .scalars()
                    .all()
                )
                if locked or any(request.get("workflow_kind") == "broker" for request in pending):
                    raise _changed()
            values = {"version": config.fingerprint, "config_json": config.model_dump_json()}
            if current:
                conn.execute(
                    update(_accepted_fleet).where(_accepted_fleet.c.id == "local").values(**values)
                )
            else:
                conn.execute(insert(_accepted_fleet).values(id="local", **values))
            conn.commit()
        engine._genesis_fleet = config
        return config


def current_fleet(conn) -> FleetConfig:
    config = conn.engine._genesis_fleet
    # Share locks keep a configuration change outside concurrent trip admission on PostgreSQL.
    version = conn.execute(
        select(_accepted_fleet.c.version).with_for_update(read=True)
    ).scalar_one()
    if version != config.fingerprint:
        raise _changed()
    return config


def configured_van(conn, vehicle_id: str) -> Van:
    van = next((van for van in current_fleet(conn).vehicles if van.id == vehicle_id), None)
    if van is None:
        raise HTTPException(
            422,
            {
                "code": "unknown_vehicle",
                "message": "Vehicle is not in the configured local fleet",
                "retryable": False,
            },
        )
    return van
