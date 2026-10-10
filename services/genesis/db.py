"""Transactional application records; events and outbox share each commit."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
from uuid import UUID, uuid4, uuid5

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Integer,
    MetaData,
    String,
    Table,
    UniqueConstraint,
    create_engine,
    insert,
    select,
    update,
    inspect,
)

PROJECT_ID = "00000000-0000-0000-0000-000000000001"
TERMINAL = {"succeeded", "failed", "cancelled", "timed_out", "budget_exceeded"}
metadata = MetaData()
runs = Table(
    "runs",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=False),
    Column("idempotency_key", String, nullable=False),
    Column("request_hash", String, nullable=False),
    Column("request", JSON, nullable=False),
    Column("status", String, nullable=False),
    Column("created_at", String, nullable=False),
    Column("started_at", String),
    Column("finished_at", String),
    Column("last_seq", Integer, nullable=False, default=0),
    Column("cancel_requested", Boolean, default=False),
    Column("detail", JSON, nullable=False),
    Column("lease_until", String),
    Column("owner", String),
    Column("generation", Integer, nullable=False, default=0),
    UniqueConstraint("project_id", "idempotency_key"),
)
events = Table(
    "events",
    metadata,
    Column("event_id", String, primary_key=True),
    Column("project_id", String, nullable=False),
    Column("run_id", String, nullable=False),
    Column("run_seq", Integer, nullable=False),
    Column("kind", String, nullable=False),
    Column("occurred_at", String, nullable=False),
    Column("ingested_at", String, nullable=False),
    Column("invocation_id", String),
    Column("payload", JSON, nullable=False),
    Column("payload_hash", String, nullable=False),
    UniqueConstraint("run_id", "run_seq"),
)
outbox = Table(
    "outbox",
    metadata,
    Column("id", String, primary_key=True),
    Column("event_id", String, nullable=False, unique=True),
    Column("payload", JSON, nullable=False),
    Column("attempts", Integer, nullable=False, default=0),
    Column("status", String, nullable=False),
    Column("next_at", String),
    Column("last_error", String),
)
artifacts = Table(
    "artifacts",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=False),
    Column("run_id", String, nullable=False),
    Column("kind", String, nullable=False),
    Column("content_hash", String, nullable=False),
    Column("content", JSON, nullable=False),
    Column("created_at", String, nullable=False),
)
reservations = Table(
    "reservations",
    metadata,
    Column("attempt_id", String, primary_key=True),
    Column("run_id", String, nullable=False),
    Column("amount", String, nullable=False),
    Column("settled", String),
    Column("status", String, nullable=False),
)
budgets = Table(
    "budgets",
    metadata,
    Column("project_id", String, primary_key=True),
    Column("limit_usd", String, nullable=False),
    Column("cad_per_usd", String, nullable=False),
    Column("frozen", Boolean, nullable=False, default=False),
    Column("freeze_reason", String),
)


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


class Conflict(ValueError):
    pass


class BudgetExceeded(ValueError):
    pass


class LostLease(RuntimeError):
    pass


class Store:
    def __init__(self, url=None):
        url = url or os.getenv("GENESIS_DATABASE_URL", "sqlite:///data/genesis.db")
        if url.startswith("sqlite:///"):
            path = url.removeprefix("sqlite:///")
            if path != ":memory:":
                Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(
            url,
            connect_args={"timeout": 30, "check_same_thread": False}
            if url.startswith("sqlite")
            else {},
            pool_pre_ping=True,
        )
        metadata.create_all(self.engine)
        # Explicit additive migration preserves the already-created local fixture database.
        columns = {column["name"] for column in inspect(self.engine).get_columns("budgets")}
        with self.engine.begin() as connection:
            if "frozen" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE budgets ADD COLUMN frozen BOOLEAN NOT NULL DEFAULT FALSE"
                )
            if "freeze_reason" not in columns:
                connection.exec_driver_sql("ALTER TABLE budgets ADD COLUMN freeze_reason VARCHAR")
        with self.transaction() as conn:
            if not conn.execute(select(budgets).where(budgets.c.project_id == PROJECT_ID)).first():
                cad_cap = min(
                    Decimal(os.getenv("GENESIS_GLOBAL_BUDGET_CAD", "100")), Decimal("100")
                )
                cushion = max(Decimal(os.getenv("GENESIS_CAD_PER_USD", "2")), Decimal("2"))
                if not cad_cap.is_finite() or not cushion.is_finite() or cad_cap <= 0:
                    raise ValueError("Invalid project budget configuration")
                conn.execute(
                    insert(budgets).values(
                        project_id=PROJECT_ID,
                        limit_usd=str(cad_cap / cushion),
                        cad_per_usd=str(cushion),
                    )
                )

    @contextmanager
    def transaction(self):
        with self.engine.connect() as conn:
            if self.engine.dialect.name == "sqlite":
                conn.exec_driver_sql("BEGIN IMMEDIATE")
            else:
                conn.begin()
            try:
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise

    def _run(self, conn, run_id, fence=None):
        row = (
            conn.execute(
                select(runs)
                .where(runs.c.id == run_id, runs.c.project_id == PROJECT_ID)
                .with_for_update()
            )
            .mappings()
            .first()
        )
        if not row:
            raise KeyError(run_id)
        row = dict(row)
        if fence and (row["owner"], row["generation"]) != fence:
            raise LostLease("Worker ownership changed")
        return row

    def _event(self, conn, row, kind, payload, invocation_id=None, event_id=None):
        event_id = event_id or str(uuid4())
        fingerprint = digest(
            {"run_id": row["id"], "kind": kind, "payload": payload, "invocation_id": invocation_id}
        )
        old = conn.execute(select(events).where(events.c.event_id == event_id)).mappings().first()
        if old:
            if old["payload_hash"] != fingerprint:
                raise Conflict("Conflicting duplicate event")
            return dict(old)
        timestamp = now()
        row["last_seq"] += 1
        value = dict(
            event_id=event_id,
            project_id=PROJECT_ID,
            run_id=row["id"],
            run_seq=row["last_seq"],
            kind=kind,
            occurred_at=timestamp,
            ingested_at=timestamp,
            invocation_id=invocation_id,
            payload=payload,
            payload_hash=fingerprint,
        )
        conn.execute(insert(events).values(**value))
        conn.execute(update(runs).where(runs.c.id == row["id"]).values(last_seq=row["last_seq"]))
        # Export observable metadata only; model content and dataset coordinates stay local.
        if kind != "telemetry.export_failed":
            conn.execute(
                insert(outbox).values(
                    id=str(uuid4()),
                    event_id=event_id,
                    payload={
                        "run_id": row["id"],
                        "event_id": event_id,
                        "kind": kind,
                        "run_seq": row["last_seq"],
                        "occurred_at": timestamp,
                    },
                    attempts=0,
                    status="pending",
                )
            )
        return value

    def create_run(self, request, key):
        with self.transaction() as conn:
            old = (
                conn.execute(
                    select(runs).where(
                        runs.c.project_id == PROJECT_ID, runs.c.idempotency_key == key
                    )
                )
                .mappings()
                .first()
            )
            if old:
                if old["request_hash"] != digest(request):
                    raise Conflict("Idempotency key belongs to different input")
                return dict(old)
            row = dict(
                id=str(uuid4()),
                project_id=PROJECT_ID,
                idempotency_key=key,
                request_hash=digest(request),
                request=request,
                status="queued",
                created_at=now(),
                started_at=None,
                finished_at=None,
                last_seq=0,
                cancel_requested=False,
                detail={"agents": [], "handoffs": [], "node_results": {}},
                lease_until=None,
                owner=None,
                generation=0,
            )
            conn.execute(insert(runs).values(**row))
            self._event(
                conn,
                row,
                "run.queued",
                {"provenance": request["mode"], "scenario_id": request["scenario_id"]},
            )
            return row

    def get_run(self, run_id):
        with self.engine.connect() as conn:
            return self._run(conn, run_id)

    def list_runs(self, filters=None):
        with self.engine.connect() as conn:
            rows = [
                dict(row)
                for row in conn.execute(
                    select(runs)
                    .where(runs.c.project_id == PROJECT_ID)
                    .order_by(runs.c.created_at.desc(), runs.c.id.desc())
                ).mappings()
            ]
        filters = filters or {}

        def matches(row):
            agent_filter, model_filter = filters.get("agent"), filters.get("model")
            observed = list(row["detail"].get("agents", []))
            if agent_filter or model_filter:
                roles = {
                    str(uuid5(UUID(row["id"]), role)): role
                    for role in ("planning", "traffic", "optimization", "monitoring", "exception")
                }
                with self.engine.connect() as connection:
                    started = connection.execute(
                        select(events.c.invocation_id, events.c.payload).where(
                            events.c.run_id == row["id"], events.c.kind == "model.started"
                        )
                    ).mappings()
                    observed.extend(
                        {
                            "role": roles.get(event["invocation_id"]),
                            "requested_model": event["payload"].get("requested_model"),
                        }
                        for event in started
                    )
            if (agent_filter or model_filter) and not any(
                (not agent_filter or a.get("role") == agent_filter)
                and (not model_filter or model_filter in {a.get("model"), a.get("requested_model")})
                for a in observed
            ):
                return False
            for key, value in filters.items():
                if value is None:
                    continue
                if key in {"agent", "model"}:
                    continue
                elif (
                    row["status"]
                    if key == "status"
                    else row["request"].get("mode" if key == "provenance" else key)
                ) != value:
                    return False
            return True

        return [row for row in rows if matches(row)]

    def append_event(self, run_id, kind, payload, invocation_id=None, event_id=None, fence=None):
        with self.transaction() as conn:
            return self._event(
                conn, self._run(conn, run_id, fence), kind, payload, invocation_id, event_id
            )

    def update_detail(self, run_id, changes, fence=None):
        with self.transaction() as conn:
            row = self._run(conn, run_id, fence)
            detail = {**row["detail"], **changes}
            conn.execute(update(runs).where(runs.c.id == run_id).values(detail=detail))

    def save_node(self, run_id, role, result, agent, fence):
        with self.transaction() as conn:
            row = self._run(conn, run_id, fence)
            detail = row["detail"]
            detail["node_results"][role] = result
            detail["agents"] = [a for a in detail["agents"] if a["role"] != role] + [agent]
            conn.execute(update(runs).where(runs.c.id == run_id).values(detail=detail))
            self._event(
                conn,
                row,
                "agent.completed",
                {"role": role, "duration_ms": agent["duration_ms"], "output": agent["output"]},
                agent["id"],
            )

    def history(self, run_id, after_seq=0, limit=200, kinds=None):
        with self.engine.connect() as conn:
            if (
                conn.execute(
                    select(runs.c.id).where(runs.c.id == run_id, runs.c.project_id == PROJECT_ID)
                ).scalar_one_or_none()
                is None
            ):
                raise KeyError(run_id)
            return [
                dict(r)
                for r in conn.execute(
                    select(events)
                    .where(events.c.run_id == run_id, events.c.run_seq > after_seq)
                    .where(True if kinds is None else events.c.kind.in_(kinds))
                    .order_by(events.c.run_seq)
                    .limit(limit)
                ).mappings()
            ]

    def cancel(self, run_id):
        with self.transaction() as conn:
            row = self._run(conn, run_id)
            if row["status"] in TERMINAL or row["cancel_requested"]:
                return row
            conn.execute(update(runs).where(runs.c.id == run_id).values(cancel_requested=True))
            self._event(conn, row, "run.cancel_requested", {})
            row["cancel_requested"] = True
            if row["status"] == "queued":
                row["status"] = "cancelled"
                row["finished_at"] = now()
                conn.execute(
                    update(runs)
                    .where(runs.c.id == run_id)
                    .values(status="cancelled", finished_at=row["finished_at"])
                )
                self._event(conn, row, "run.cancelled", {"before_start": True})
            return row

    def claim(self, owner, lease_seconds=60):
        from datetime import timedelta

        with self.transaction() as conn:
            rows = conn.execute(
                select(runs)
                .where(runs.c.project_id == PROJECT_ID, runs.c.status.in_(["queued", "running"]))
                .order_by(runs.c.created_at)
                .with_for_update(skip_locked=True)
            ).mappings()
            row = next(
                (
                    dict(r)
                    for r in rows
                    if r["status"] == "queued" or not r["lease_until"] or r["lease_until"] < now()
                ),
                None,
            )
            if not row:
                return None
            resumed = row["status"] == "running"
            row.update(
                owner=owner,
                generation=row["generation"] + 1,
                status="running",
                lease_until=(
                    datetime.now(timezone.utc) + timedelta(seconds=lease_seconds)
                ).isoformat(timespec="milliseconds"),
                started_at=row["started_at"] or now(),
            )
            conn.execute(
                update(runs)
                .where(runs.c.id == row["id"])
                .values(
                    **{
                        k: row[k]
                        for k in ["owner", "generation", "status", "lease_until", "started_at"]
                    }
                )
            )
            self._event(
                conn,
                row,
                "run.resumed" if resumed else "run.started",
                {"generation": row["generation"]},
            )
            return row

    def heartbeat(self, run_id, fence, lease_seconds=60):
        from datetime import timedelta

        with self.transaction() as conn:
            self._run(conn, run_id, fence)
            conn.execute(
                update(runs)
                .where(runs.c.id == run_id)
                .values(
                    lease_until=(
                        datetime.now(timezone.utc) + timedelta(seconds=lease_seconds)
                    ).isoformat(timespec="milliseconds")
                )
            )

    def finish(self, run_id, status, changes, fence):
        if status not in TERMINAL:
            raise ValueError("Invalid terminal status")
        with self.transaction() as conn:
            row = self._run(conn, run_id, fence)
            if row["status"] in TERMINAL:
                return
            if row["cancel_requested"]:
                status = "cancelled"
            detail = {**row["detail"], **changes}
            conn.execute(
                update(runs)
                .where(runs.c.id == run_id)
                .values(status=status, finished_at=now(), detail=detail, lease_until=None)
            )
            self._event(
                conn,
                row,
                "run.completed" if status == "succeeded" else "run." + status,
                {"final_kind": detail.get("final_kind"), "error": detail.get("error")},
            )

    def put_artifact(self, run_id, kind, content, fence=None, invocation_id=None):
        artifact_id = str(uuid4())
        with self.transaction() as conn:
            row = self._run(conn, run_id, fence)
            conn.execute(
                insert(artifacts).values(
                    id=artifact_id,
                    project_id=PROJECT_ID,
                    run_id=run_id,
                    kind=kind,
                    content_hash=digest(content),
                    content=content,
                    created_at=now(),
                )
            )
            self._event(
                conn,
                row,
                "artifact.created",
                {"artifact_id": artifact_id, "kind": kind, "content_hash": digest(content)},
                invocation_id,
            )
        return artifact_id

    def artifact(self, artifact_id):
        with self.engine.connect() as conn:
            value = (
                conn.execute(
                    select(artifacts).where(
                        artifacts.c.id == artifact_id, artifacts.c.project_id == PROJECT_ID
                    )
                )
                .mappings()
                .first()
            )
            if not value:
                raise KeyError(artifact_id)
            return dict(value)

    def reserve(self, run_id, attempt_id, amount, fence=None):
        amount = Decimal(str(amount))
        if not amount.is_finite() or amount < 0:
            raise ValueError("Invalid reservation")
        with self.transaction() as conn:
            project_budget = (
                conn.execute(
                    select(budgets).where(budgets.c.project_id == PROJECT_ID).with_for_update()
                )
                .mappings()
                .one()
            )
            if project_budget["frozen"]:
                raise BudgetExceeded(
                    "Project dispatch frozen after a known reservation overrun; reconcile before further calls"
                )
            row = self._run(conn, run_id, fence)
            existing = (
                conn.execute(select(reservations).where(reservations.c.attempt_id == attempt_id))
                .mappings()
                .first()
            )
            if existing:
                if existing["run_id"] != run_id or Decimal(existing["amount"]) != amount:
                    raise Conflict("Conflicting reservation")
                return
            balance = sum(
                (
                    Decimal(r["settled"] if r["settled"] is not None else r["amount"])
                    for r in conn.execute(
                        select(reservations).where(reservations.c.run_id == run_id)
                    ).mappings()
                ),
                Decimal(0),
            )
            if balance + amount > Decimal(row["request"]["budget_usd"]):
                raise BudgetExceeded("Prospective charge exceeds available run budget")
            global_balance = sum(
                (
                    Decimal(r["settled"] if r["settled"] is not None else r["amount"])
                    for r in conn.execute(
                        select(reservations)
                        .join(runs, reservations.c.run_id == runs.c.id)
                        .where(runs.c.project_id == PROJECT_ID)
                    ).mappings()
                ),
                Decimal(0),
            )
            configured_cap = min(
                Decimal(os.getenv("GENESIS_GLOBAL_BUDGET_CAD", "100")), Decimal("100")
            ) / max(Decimal(os.getenv("GENESIS_CAD_PER_USD", "2")), Decimal("2"))
            if global_balance + amount > min(Decimal(project_budget["limit_usd"]), configured_cap):
                raise BudgetExceeded("Prospective charge exceeds global C$100 project ceiling")
            conn.execute(
                insert(reservations).values(
                    attempt_id=attempt_id,
                    run_id=run_id,
                    amount=str(amount),
                    settled=None,
                    status="held",
                )
            )

    def settle(self, run_id, attempt_id, amount, fence=None):
        amount = Decimal(str(amount))
        if not amount.is_finite() or amount < 0:
            raise ValueError("Invalid charge")
        overrun = False
        with self.transaction() as conn:
            conn.execute(
                select(budgets).where(budgets.c.project_id == PROJECT_ID).with_for_update()
            ).mappings().one()
            self._run(conn, run_id, fence)
            row = (
                conn.execute(
                    select(reservations).where(
                        reservations.c.attempt_id == attempt_id, reservations.c.run_id == run_id
                    )
                )
                .mappings()
                .one()
            )
            if row["settled"] is not None:
                if Decimal(row["settled"]) != amount:
                    raise Conflict("Conflicting settlement")
                return
            overrun = amount > Decimal(row["amount"])
            conn.execute(
                update(reservations)
                .where(reservations.c.attempt_id == attempt_id)
                .values(settled=str(amount), status="overrun" if overrun else "settled")
            )
            if overrun:
                conn.execute(
                    update(budgets)
                    .where(budgets.c.project_id == PROJECT_ID)
                    .values(
                        frozen=True, freeze_reason="Known provider charge exceeded its reservation"
                    )
                )
                self._event(
                    conn,
                    self._run(conn, run_id, fence),
                    "billing.overrun",
                    {
                        "attempt_id": attempt_id,
                        "reserved_usd": row["amount"],
                        "known_charge_usd": str(amount),
                        "project_frozen": True,
                    },
                )
        # Raise after commit: neither the known exposure nor the project freeze may roll back.
        if overrun:
            raise BudgetExceeded(
                "Provider estimate exceeded reservation; known exposure persisted and project dispatch frozen"
            )

    def held(self, run_id):
        with self.engine.connect() as conn:
            return list(
                conn.execute(
                    select(reservations).where(
                        reservations.c.run_id == run_id, reservations.c.status == "held"
                    )
                ).mappings()
            )

    def budget_state(self):
        with self.engine.connect() as connection:
            budget = (
                connection.execute(select(budgets).where(budgets.c.project_id == PROJECT_ID))
                .mappings()
                .one()
            )
            items = (
                connection.execute(
                    select(reservations)
                    .join(runs, reservations.c.run_id == runs.c.id)
                    .where(runs.c.project_id == PROJECT_ID)
                )
                .mappings()
                .all()
            )
        known = sum(
            (Decimal(item["settled"]) for item in items if item["settled"] is not None), Decimal(0)
        )
        held = sum(
            (Decimal(item["amount"]) for item in items if item["settled"] is None), Decimal(0)
        )
        cushion = max(
            Decimal(budget["cad_per_usd"]),
            Decimal(os.getenv("GENESIS_CAD_PER_USD", "2")),
            Decimal("2"),
        )
        limit = min(
            Decimal(budget["limit_usd"]),
            min(Decimal(os.getenv("GENESIS_GLOBAL_BUDGET_CAD", "100")), Decimal("100")) / cushion,
        )
        return {
            "known_cost_usd": str(known),
            "held_usd": str(held),
            "budget_limit_usd": str(limit),
            "budget_limit_cad": str(limit * cushion),
            "budget_valued_cost_cad": str(known * cushion),
            "budget_valued_held_cad": str(held * cushion),
            "remaining_budget_cad": str(max(Decimal(0), (limit - known - held) * cushion)),
            "cad_per_usd_policy": str(cushion),
            "frozen": budget["frozen"],
            "freeze_reason": budget["freeze_reason"],
            "cad_source": "conservative spending policy valuation, not an invoice or market FX quote",
        }
