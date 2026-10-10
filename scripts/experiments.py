"""Execute and export the paired matrix with explicit fixture/live provenance."""

import argparse
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))


def main():
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
    from genesis.db import Store, TERMINAL
    from genesis.llm import live_configuration
    from genesis.worker import run_once

    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["fixture", "live"], default="fixture")
    parser.add_argument("--pilot", action="store_true")
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--per-run-budget-usd", type=Decimal, default=Decimal("1"))
    args = parser.parse_args()
    if not args.per_run_budget_usd.is_finite() or not 0 < args.per_run_budget_usd <= 1:
        parser.error("This experiment harness allows a maximum US$1 per run within the global cap")
    if args.mode == "live":
        for role in ["planning", "traffic", "monitoring"]:
            live_configuration(role)
    store = Store()
    cases = (
        [("S01", "baseline_only", 17)]
        if args.pilot
        else [
            (scenario, policy, seed)
            for scenario in ["S01", "S02", "S03", "S04", "S05"]
            for policy in ["baseline_only", "solver_with_one_replan"]
            for seed in [17, 29]
        ]
    )
    records = []
    for scenario, policy, seed in cases:
        request = dict(
            scenario_id=scenario,
            policy=policy,
            seed=seed,
            mode=args.mode,
            budget_usd=str(args.per_run_budget_usd) if args.mode == "live" else None,
        )
        if args.mode == "live":
            import os

            request["provider"] = os.getenv("GENESIS_PROVIDER", "anthropic")
            request["model_policy"] = {
                role: live_configuration(role)[0]
                for role in ("planning", "traffic", "optimization", "monitoring", "exception")
            }
        configuration_id = hashlib.sha256(
            json.dumps(
                {"provider": request.get("provider"), "model_policy": request.get("model_policy")},
                sort_keys=True,
            ).encode()
        ).hexdigest()[:12]
        row = store.create_run(
            request, f"experiment-v3:{args.mode}:{configuration_id}:{scenario}:{policy}:{seed}"
        )
        if args.retry_failed and row["status"] in TERMINAL and row["status"] != "succeeded":
            from uuid import uuid4

            if store.held(row["id"]):
                raise RuntimeError(
                    "Prior billing is uncertain; reconcile held funds before retrying"
                )
            request = {**request, "retry_of_run_id": row["id"]}
            row = store.create_run(request, f"experiment-retry:{uuid4()}")
        deadline = time.monotonic() + 310
        while row["status"] not in TERMINAL:
            if time.monotonic() > deadline:
                raise RuntimeError("Worker deadline exceeded; stored state retained")
            if not run_once(store):
                time.sleep(0.25)
            row = store.get_run(row["id"])
        detail = row["detail"]
        calls = [
            e["payload"] for e in store.history(row["id"], 0, 500) if e["kind"] == "model.completed"
        ]
        record = dict(
            run_id=row["id"],
            scenario=scenario,
            policy=policy,
            seed=seed,
            provenance=args.mode,
            status=row["status"],
            input_hash=detail.get("dataset", {}).get("input_hash"),
            manifest_hash=detail.get("simulation", {}).get("manifest_hash"),
            duration_ms=detail.get("duration_ms"),
            metrics=detail.get("metrics"),
            certificate_valid=detail.get("certificate", {}).get("valid"),
            model_calls=len(calls),
            model_ids=sorted({c["resolved_model"] for c in calls}),
            api_cost_usd=str(sum((Decimal(c["cost_usd"]) for c in calls), Decimal(0)))
            if calls
            else None,
            error=detail.get("error"),
        )
        records.append(record)
        print(
            json.dumps(
                {
                    k: record[k]
                    for k in [
                        "run_id",
                        "scenario",
                        "policy",
                        "status",
                        "model_calls",
                        "api_cost_usd",
                    ]
                }
            )
        )
        if row["status"] != "succeeded":
            break  # Never spend through a failed provider/configuration stage.
    export = ROOT / "experiments" / f"{args.mode}-manifest.json"
    export.parent.mkdir(exist_ok=True)
    source_hashes = {
        str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted((ROOT / "services" / "genesis").glob("*.py"))
    }
    document = dict(
        created_at=datetime.now(timezone.utc).isoformat(),
        mode=args.mode,
        live_requirement_satisfied=args.mode == "live"
        and len(records) == 20
        and all(r["status"] == "succeeded" and r["model_calls"] >= 5 for r in records),
        last_committed_revision=subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        source_hashes=source_hashes,
        records=records,
        limitations=[
            "Synthetic traffic, schematic geometry and rates; no actual dispatch.",
            "Fixed orchestration: models exchange evidence-backed explanations; deterministic tools select routes and depot-only replan.",
        ],
    )
    export.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Manifest: {export}; live requirement satisfied: {document['live_requirement_satisfied']}"
    )
    if any(record["status"] != "succeeded" for record in records):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
