"""Dedicated durable worker. Fixture runs never dispatch a model request."""

import argparse
from datetime import datetime, timedelta, timezone
import os
import threading
import time
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import select, update

from .db import BudgetExceeded, LostLease, Store, now, outbox
from .llm import BillingUncertain, LiveUnavailable
from .workflow import Cancelled, RunTimedOut, Runtime

load_dotenv()


def export_outbox(store):
    """Optional SDK export; failure never rolls back the authoritative local trace."""
    if not all(os.getenv(k) for k in ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"]):
        return 0
    from langfuse import Langfuse

    client = Langfuse()
    exported = 0
    with store.engine.connect() as conn:
        batch = [
            dict(r)
            for r in conn.execute(
                select(outbox).where(outbox.c.status == "pending").order_by(outbox.c.id).limit(50)
            ).mappings()
            if not r["next_at"] or r["next_at"] <= now()
        ]
    for row in batch:
        try:
            with client.start_as_current_observation(
                name=row["payload"]["kind"],
                as_type="span",
                metadata=row["payload"],
                trace_context={"trace_id": row["payload"]["run_id"].replace("-", "")},
            ):
                pass
            client.flush()
            with store.transaction() as conn:
                conn.execute(
                    update(outbox)
                    .where(outbox.c.id == row["id"])
                    .values(status="exported", attempts=row["attempts"] + 1, last_error=None)
                )
            exported += 1
        except Exception as exc:
            attempts = row["attempts"] + 1
            with store.transaction() as conn:
                conn.execute(
                    update(outbox)
                    .where(outbox.c.id == row["id"])
                    .values(
                        attempts=attempts,
                        status="failed" if attempts >= 3 else "pending",
                        next_at=(
                            datetime.now(timezone.utc) + timedelta(seconds=min(300, 2**attempts))
                        ).isoformat(timespec="milliseconds"),
                        last_error=type(exc).__name__,
                    )
                )
            store.append_event(
                row["payload"]["run_id"],
                "telemetry.export_failed",
                {
                    "event_id": row["event_id"],
                    "attempt": attempts,
                    "error_code": type(exc).__name__,
                    "retryable": attempts < 3,
                },
            )
    client.shutdown()
    return exported


def run_once(store, owner=None):
    row = store.claim(owner or str(uuid4()))
    if row is None:
        return False
    runtime = Runtime(store, row)
    stop = threading.Event()

    def renew():
        while not stop.wait(10):
            try:
                store.heartbeat(row["id"], runtime.fence)
            except LostLease:
                return

    heartbeat = threading.Thread(target=renew, daemon=True)
    heartbeat.start()
    try:
        runtime.execute()
    except LostLease:
        pass
    except Exception as exc:
        status = (
            "cancelled"
            if isinstance(exc, Cancelled)
            else "timed_out"
            if isinstance(exc, RunTimedOut)
            else "budget_exceeded"
            if isinstance(exc, (BudgetExceeded, BillingUncertain))
            else "failed"
        )
        # No provider exception text enters logs or API responses.
        safe_message = (
            str(exc)
            if isinstance(
                exc, (Cancelled, RunTimedOut, BudgetExceeded, BillingUncertain, LiveUnavailable)
            )
            else "Execution failed; inspect typed tool and role events"
        )
        store.finish(
            row["id"],
            status,
            {
                "duration_ms": int((time.monotonic() - runtime.started_monotonic) * 1000)
                if runtime.fence[1] == 1
                else None,
                "duration_source": "monotonic"
                if runtime.fence[1] == 1
                else "unavailable_across_recovered_processes",
                "error": {
                    "code": type(exc).__name__,
                    "message": safe_message,
                    "billing_uncertain": bool(store.held(row["id"])),
                },
            },
            runtime.fence,
        )
    finally:
        stop.set()
        heartbeat.join(timeout=1)
    return True


def seed_demo(store):
    """20 actual deterministic workflows; these are excluded from live experiment evidence."""
    from .scenarios import SCENARIOS

    for scenario in SCENARIOS:
        for policy in ["baseline_only", "solver_with_one_replan"]:
            for seed in [17, 29]:
                request = {
                    "scenario_id": scenario["id"],
                    "policy": policy,
                    "seed": seed,
                    "mode": "fixture",
                    "budget_usd": None,
                }
                store.create_run(request, f"demo-v1:{scenario['id']}:{policy}:{seed}")
    while run_once(store):
        pass


def main():
    parser = argparse.ArgumentParser(description="Genesis dedicated durable workflow worker")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--seed-demo", action="store_true")
    args = parser.parse_args()
    store = Store()
    if args.seed_demo:
        seed_demo(store)
        return
    if args.once:
        run_once(store)
        export_outbox(store)
        return
    owner = str(uuid4())
    while True:
        load_dotenv(override=True)
        worked = run_once(store, owner)
        try:
            export_outbox(store)
        except Exception:
            pass  # Local records remain authoritative; pending export is retried.
        if not worked:
            time.sleep(1)


if __name__ == "__main__":
    main()
