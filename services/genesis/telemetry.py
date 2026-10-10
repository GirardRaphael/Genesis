"""Read projections of billable leaf attempts, including active and failed calls."""

from collections import defaultdict
from decimal import Decimal
from uuid import UUID, uuid5

from .workflow import ROLES


def attempts_for_run(store, row, as_of_seq=None):
    roles = {str(uuid5(UUID(row["id"]), role)): role for role in ROLES}
    calls = {}
    for event in store.history(
        row["id"],
        0,
        500,
        kinds={
            "model.started",
            "model.completed",
            "model.failed",
            "run.completed",
            "run.succeeded",
            "run.failed",
            "run.cancelled",
            "run.timed_out",
            "run.budget_exceeded",
        },
    ):
        if as_of_seq is not None and event["run_seq"] > as_of_seq:
            continue
        if event["kind"] in {
            "run.completed",
            "run.succeeded",
            "run.failed",
            "run.cancelled",
            "run.timed_out",
            "run.budget_exceeded",
        }:
            # A terminal recovery cannot leave a dispatched call actively running.
            for item in calls.values():
                if item["status"] == "running":
                    item.update(
                        status="interrupted",
                        finished_at=event["occurred_at"],
                        error_code="provider_attempt_interrupted",
                        billing_uncertain=True,
                        retryable=False,
                        usage_source="unavailable_after_interruption",
                    )
            continue
        if event["kind"] not in {"model.started", "model.completed", "model.failed"}:
            continue
        payload = event["payload"]
        call_id = payload.get("attempt_id")
        if not call_id:
            continue
        item = calls.setdefault(
            call_id,
            {
                "attempt_id": call_id,
                "run_id": row["id"],
                "agent_id": event["invocation_id"],
                "role": roles.get(event["invocation_id"], "unknown"),
                "model": None,
                "requested_model": None,
                "status": "running",
                "input_tokens": None,
                "output_tokens": None,
                "cached_input_tokens": None,
                "cache_creation_input_tokens": None,
                "uncached_input_tokens": None,
                "reasoning_output_tokens": None,
                "cost_usd": None,
                "duration_ms": None,
                "started_at": None,
                "finished_at": None,
                "attempt": payload.get("attempt", 1),
            },
        )
        if event["kind"] == "model.started":
            item.update(
                started_at=event["occurred_at"],
                requested_model=payload.get("requested_model"),
                model=payload.get("requested_model"),
                reserved_usd=payload.get("reservation_usd"),
                price_version=payload.get("price_version"),
            )
        else:
            item.update(
                status="completed" if event["kind"] == "model.completed" else "failed",
                finished_at=event["occurred_at"],
                duration_ms=payload.get("duration_ms"),
                input_tokens=payload.get("input_tokens"),
                output_tokens=payload.get("output_tokens"),
                cost_usd=payload.get("cost_usd"),
                error_code=payload.get("error_code"),
                cached_input_tokens=payload.get("cached_input_tokens"),
                cache_creation_input_tokens=payload.get("cache_creation_input_tokens"),
                uncached_input_tokens=payload.get("uncached_input_tokens"),
                reasoning_output_tokens=payload.get("reasoning_output_tokens"),
                model=payload.get("resolved_model") or item["model"],
                usage_source=payload.get("usage_source"),
                cost_source=payload.get("cost_source"),
                provider_response_id=payload.get("provider_response_id"),
                retryable=payload.get("retryable", False),
            )
    return list(calls.values())


def aggregate(calls):
    known_tokens = [
        c for c in calls if c["input_tokens"] is not None and c["output_tokens"] is not None
    ]
    known_cost = [c for c in calls if c["cost_usd"] is not None]
    durations = [c["duration_ms"] for c in calls if c["duration_ms"] is not None]
    return {
        "calls": len(calls),
        "completed": sum(c["status"] == "completed" for c in calls),
        "running": sum(c["status"] == "running" for c in calls),
        "errors": sum(c["status"] in {"failed", "interrupted"} for c in calls),
        "retries": sum(c["attempt"] > 1 for c in calls),
        "input_tokens": sum(c["input_tokens"] for c in known_tokens) if known_tokens else None,
        "output_tokens": sum(c["output_tokens"] for c in known_tokens) if known_tokens else None,
        "total_tokens": sum(c["input_tokens"] + c["output_tokens"] for c in known_tokens)
        if known_tokens
        else None,
        "cost_usd": str(sum((Decimal(c["cost_usd"]) for c in known_cost), Decimal(0)))
        if known_cost
        else None,
        "usage_coverage": len(known_tokens) / len(calls) if calls else 0,
        "cost_coverage": len(known_cost) / len(calls) if calls else 0,
        "mean_latency_ms": sum(durations) / len(durations) if durations else None,
        "latency_samples": len(durations),
    }


def usage_projection(store, rows, agent=None, model=None, as_of_seq=None):
    calls = [
        c
        for row in rows
        for c in attempts_for_run(store, row, as_of_seq)
        if (not agent or c["role"] == agent)
        and (not model or model in {c["model"], c["requested_model"]})
    ]
    agent_groups, model_groups = defaultdict(list), defaultdict(list)
    for call in calls:
        agent_groups[call["role"]].append(call)
        model_groups[call["model"] or "unknown"].append(call)
    return {
        "totals": aggregate(calls),
        "attempts": calls,
        "agents": [{"role": role, **aggregate(agent_groups[role])} for role in ROLES],
        "models": [
            {"model": name, **aggregate(group)} for name, group in sorted(model_groups.items())
        ],
        "units": {
            "cost": "USD estimated API cost",
            "latency": "actual milliseconds",
            "tokens": "provider reported",
        },
        "fixture_calls": 0,
    }
