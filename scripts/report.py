"""Rebuild the report from persisted experiment evidence, without another model call."""

from collections import defaultdict
import json
from pathlib import Path
from statistics import mean
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))


def main():
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
    from genesis.db import Store
    from genesis.telemetry import usage_projection
    from genesis.api import detail

    manifest = json.loads((ROOT / "experiments/live-manifest.json").read_text(encoding="utf-8"))
    records = manifest["records"]
    assert manifest["live_requirement_satisfied"] and len(records) == 20
    store = Store()
    rows = [store.get_run(r["run_id"]) for r in records]
    usage = usage_projection(store, rows)
    assert usage["totals"]["calls"] == 100 and usage["totals"]["completed"] == 100
    groups = defaultdict(list)
    for record in records:
        groups[(record["scenario"], record["policy"])].append(record)
    lines = [
        "# Genesis logistics experiment report",
        "",
        "Evidence date 10 October 2026. Twenty actual five-role Anthropic executions, five scenarios, two logistics policies and two paired seeds. Delivery data, road geometry, traffic and operating rates are synthetic. The application uses deterministic route selection and a bounded depot-only replan; models exchange and explain evidence rather than autonomously changing constraints.",
        "",
        f"All 20 analysis missions completed with 100 provider-reported calls. Estimated API spend: **US${usage['totals']['cost_usd']}**. The C$100 global ceiling remains shared across providers and all retries. Successful analysis includes correctly supported infeasible diagnostics; it does not imply every fleet plan is feasible or every delivery was on time.",
        "",
        "## Agents and architecture",
        "",
        "Planning establishes the mission; simulated traffic provides a frozen forecast; optimization runs baseline/OR-Tools; monitoring independently validates and simulates; exception reports a no-action/diagnostic or the bounded depot reload. LangGraph checkpoints, transactional SQLite events, fenced worker, API and custom React/MapLibre/React Flow/ECharts views provide the tested local profile. PostgreSQL and external Langfuse export are configurable but were not verified against running external services.",
        "",
        "## Recorded policy outcomes",
        "",
        "| Scenario | Policy | n | Initial valid certificates | Mean served / total | Mean km | Mean estimated fleet CAD | Mean simulated late minutes |",
        "|---|---|---:|---:|---|---:|---:|---:|",
    ]
    for (scenario, policy), group in sorted(groups.items()):
        lines.append(
            f"| {scenario} | {policy} | {len(group)} | {sum(r['certificate_valid'] for r in group)}/{len(group)} | {mean(r['metrics']['served'] for r in group):.1f}/{mean(r['metrics']['total'] for r in group):.1f} | {mean(r['metrics']['distance_km'] for r in group):.3f} | {mean(float(r['metrics']['fleet_cost_cad']) for r in group):.2f} | {mean(r['metrics']['late_minutes'] for r in group):.2f} |"
        )
    lines += [
        "",
        "## Model and agent resources",
        "",
        "| Agent | Calls | Input tokens | Output tokens | Estimated USD | Mean actual call latency ms |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for a in usage["agents"]:
        lines.append(
            f"| {a['role']} | {a['calls']} | {a['input_tokens']} | {a['output_tokens']} | {a['cost_usd']} | {a['mean_latency_ms']:.1f} |"
        )
    lines += ["", "| Model | Calls | Total tokens | Estimated USD |", "|---|---:|---:|---:|"]
    for model in usage["models"]:
        lines.append(
            f"| {model['model']} | {model['calls']} | {model['total_tokens']} | {model['cost_usd']} |"
        )
    most_tokens = max(usage["agents"], key=lambda a: a["total_tokens"] or 0)
    slowest = max(usage["agents"], key=lambda a: a["mean_latency_ms"] or 0)
    lines += [
        "",
        "## Required analysis questions",
        "",
        f"1. Most tokens: {most_tokens['role']} consumed {most_tokens['total_tokens']} input/output tokens. Cache categories are subsets, not added twice.",
        f"2. Slowest model-call agent: {slowest['role']}, mean {slowest['mean_latency_ms']:.1f} ms over {slowest['latency_samples']} calls. Tool/role wall duration is distinct and available in each trace.",
        "3. Errors: zero failed calls in this accepted 20-run matrix. Earlier OpenAI rate-limit attempts remain separate failed requests in the application and overall cost history; they are not silently removed or counted as successful experiments.",
        "4. Retries: zero in this accepted matrix. Earlier rate-limit rejections have individually recorded retries; this dataset cannot identify a generally retry-prone logistics task.",
        "5. Agent count versus duration: not identifiable; every measured run uses five roles. An ablation requires additional valid workflows and executions.",
        "6. More cost versus better quality: no causal conclusion. Roles use different model tiers and fixed responsibilities; initial feasibility is deterministic and explanation quality lacks independent human calibration.",
        "7. Bottlenecks: inspect call/role timelines, sample counts and cost breakdown above. Solver search has a bounded one-second implementation setting; it is not the sum of all workflow latency.",
        "8. Unnecessary communications: no removal experiment was performed. Five observed handoffs form the workflow; counts alone do not establish redundancy.",
        "9. Lower cost: test cheaper explanations for already-deterministically-verified cases while keeping strong review on ambiguous failures; validate quality in a separate model-policy ablation before claiming savings.",
        "10. Reliability: retain independent constraints, cargo locks, final-boundary outage checks, future-event isolation, exact residual certificate hashes and persistent budget-overrun freeze. Domain, database, SDK and browser tests provide the linked implementation evidence.",
        "",
        "## Visualization choices",
        "",
        "The map and visit table identify vehicle/stop decisions; graph exposes actual role handoffs; waterfall distinguishes concurrent intervals and real latency; two-column Sankey counts handoffs without false conservation; comparisons keep service coverage beside costs; scenario/agent heatmap exposes latency and missingness; eight KPIs summarize the common cohort. Model/agent metering and individual attempts show usage coverage, reservations, estimated costs and errors. Simulation time and real execution replay stay separate.",
        "",
        "## Recommendations supported by the evidence",
        "",
        "1. Evaluate explanation model routing before increasing orchestration complexity. The measured resource table identifies the expensive roles; deterministic validation should remain authoritative. No cheaper-model quality equivalence is claimed without a separate ablation.",
        "2. Keep the depot-only new-order rule explicit. S05 comparisons show coverage improvement only when an unused eligible depot vehicle can load the new parcel. Do not generalize this to roadside transfers or arbitrary dynamic reassignment.",
        "3. Rotate outage targets and expand paired seeds before interpreting S04 gains. The same van-1 outage can hit different policy states, including an unused van; the observed difference may reflect assignment luck rather than robust resilience.",
        "4. Keep operating cost, API spend and emissions separate. Synthetic rates do not validate commercial savings; emissions remain unavailable until a verified factor and coverage are supplied.",
        "",
        "## Limits and conclusion",
        "",
        "Two seeds per policy/scenario demonstrate functionality, not general statistical or commercial superiority. Time-limited solver candidates are not proven global optima. Geographic paths and congestion are schematic/simulated. S02/S04 diagnose without arbitrary resequencing or cargo rescue; S05 supports only one idle-depot reload. PostgreSQL, cloud Langfuse, production authentication, 100,000-run scale, real traffic, customer interviews and teacher approval remain unverified external or later-scope gates.",
        "",
        "The delivered local observatory makes route evidence and agent/model resources inspectable. The 20-run manifest is reproducible evidence of actual model execution on a controlled synthetic problem. It supports targeted further experiments, not claims of real-world savings or perfect accuracy.",
        "",
        "Rebuild: `.venv/Scripts/python.exe scripts/report.py`. Inputs: experiments/live-manifest.json plus its persisted run/event records.",
    ]
    (ROOT / "docs/REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    sample = detail(rows[-1])
    directory = ROOT / "tests/fixtures"
    directory.mkdir(exist_ok=True)
    (directory / "sample-live-run.json").write_text(
        json.dumps(sample, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (ROOT / "experiments/usage-summary.json").write_text(
        json.dumps({k: v for k, v in usage.items() if k != "attempts"}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        {
            "report": "docs/REPORT.md",
            "sample": "tests/fixtures/sample-live-run.json",
            "calls": usage["totals"]["calls"],
            "cost_usd": usage["totals"]["cost_usd"],
        }
    )


if __name__ == "__main__":
    main()
