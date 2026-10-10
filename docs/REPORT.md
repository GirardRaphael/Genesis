# Genesis logistics experiment report

Evidence date 10 October 2026. Twenty actual five-role Anthropic executions, five scenarios, two logistics policies and two paired seeds. Delivery data, road geometry, traffic and operating rates are synthetic. The application uses deterministic route selection and a bounded depot-only replan; models exchange and explain evidence rather than autonomously changing constraints.

All 20 analysis missions completed with 100 provider-reported calls. Estimated API spend: **US$0.6696181**. The C$100 global ceiling remains shared across providers and all retries. Successful analysis includes correctly supported infeasible diagnostics; it does not imply every fleet plan is feasible or every delivery was on time.

## Agents and architecture

Planning establishes the mission; simulated traffic provides a frozen forecast; optimization runs baseline/OR-Tools; monitoring independently validates and simulates; exception reports a no-action/diagnostic or the bounded depot reload. LangGraph checkpoints, transactional SQLite events, fenced worker, API and custom React/MapLibre/React Flow/ECharts views provide the tested local profile. PostgreSQL and external Langfuse export are configurable but were not verified against running external services.

## Recorded policy outcomes

| Scenario | Policy | n | Initial valid certificates | Mean served / total | Mean km | Mean estimated fleet CAD | Mean simulated late minutes |
|---|---|---:|---:|---|---:|---:|---:|
| S01 | baseline_only | 2 | 2/2 | 28.0/28.0 | 16.502 | 288.66 | 0.00 |
| S01 | solver_with_one_replan | 2 | 2/2 | 28.0/28.0 | 15.195 | 273.40 | 0.00 |
| S02 | baseline_only | 2 | 2/2 | 28.0/28.0 | 16.502 | 300.69 | 0.00 |
| S02 | solver_with_one_replan | 2 | 2/2 | 28.0/28.0 | 14.930 | 282.33 | 0.00 |
| S03 | baseline_only | 2 | 0/2 | 27.0/28.0 | 18.340 | 308.59 | 0.00 |
| S03 | solver_with_one_replan | 2 | 0/2 | 27.0/28.0 | 18.340 | 308.59 | 0.00 |
| S04 | baseline_only | 2 | 2/2 | 19.0/28.0 | 11.407 | 216.27 | 0.00 |
| S04 | solver_with_one_replan | 2 | 2/2 | 20.0/28.0 | 11.363 | 216.80 | 0.00 |
| S05 | baseline_only | 2 | 2/2 | 28.0/29.0 | 16.502 | 288.66 | 0.00 |
| S05 | solver_with_one_replan | 2 | 2/2 | 29.0/29.0 | 16.215 | 306.01 | 0.00 |

## Model and agent resources

| Agent | Calls | Input tokens | Output tokens | Estimated USD | Mean actual call latency ms |
|---|---:|---:|---:|---:|---:|
| planning | 20 | 11490 | 4410 | 0.067080 | 3476.7 |
| traffic | 20 | 15706 | 6344 | 0.0047426 | 2708.6 |
| optimization | 20 | 22719 | 10198 | 0.147418 | 5192.9 |
| monitoring | 20 | 38413 | 14419 | 0.442032 | 8248.4 |
| exception | 20 | 25915 | 11508 | 0.0083455 | 3540.1 |

| Model | Calls | Total tokens | Estimated USD |
|---|---:|---:|---:|
| claude-haiku-5-5 | 40 | 59473 | 0.0130881 |
| claude-opus-5-5 | 20 | 52832 | 0.442032 |
| claude-sonnet-5-5 | 40 | 48817 | 0.214498 |

## Required analysis questions

1. Most tokens: monitoring consumed 52832 input/output tokens. Cache categories are subsets, not added twice.
2. Slowest model-call agent: monitoring, mean 8248.4 ms over 20 calls. Tool/role wall duration is distinct and available in each trace.
3. Errors: zero failed calls in this accepted 20-run matrix. Earlier OpenAI rate-limit attempts remain separate failed requests in the application and overall cost history; they are not silently removed or counted as successful experiments.
4. Retries: zero in this accepted matrix. Earlier rate-limit rejections have individually recorded retries; this dataset cannot identify a generally retry-prone logistics task.
5. Agent count versus duration: not identifiable; every measured run uses five roles. An ablation requires additional valid workflows and executions.
6. More cost versus better quality: no causal conclusion. Roles use different model tiers and fixed responsibilities; initial feasibility is deterministic and explanation quality lacks independent human calibration.
7. Bottlenecks: inspect call/role timelines, sample counts and cost breakdown above. Solver search has a bounded one-second implementation setting; it is not the sum of all workflow latency.
8. Unnecessary communications: no removal experiment was performed. Five observed handoffs form the workflow; counts alone do not establish redundancy.
9. Lower cost: test cheaper explanations for already-deterministically-verified cases while keeping strong review on ambiguous failures; validate quality in a separate model-policy ablation before claiming savings.
10. Reliability: retain independent constraints, cargo locks, final-boundary outage checks, future-event isolation, exact residual certificate hashes and persistent budget-overrun freeze. Domain, database, SDK and browser tests provide the linked implementation evidence.

## Visualization choices

The map and visit table identify vehicle/stop decisions; graph exposes actual role handoffs; waterfall distinguishes concurrent intervals and real latency; two-column Sankey counts handoffs without false conservation; comparisons keep service coverage beside costs; scenario/agent heatmap exposes latency and missingness; eight KPIs summarize the common cohort. Model/agent metering and individual attempts show usage coverage, reservations, estimated costs and errors. Simulation time and real execution replay stay separate.

## Recommendations supported by the evidence

1. Evaluate explanation model routing before increasing orchestration complexity. The measured resource table identifies the expensive roles; deterministic validation should remain authoritative. No cheaper-model quality equivalence is claimed without a separate ablation.
2. Keep the depot-only new-order rule explicit. S05 comparisons show coverage improvement only when an unused eligible depot vehicle can load the new parcel. Do not generalize this to roadside transfers or arbitrary dynamic reassignment.
3. Rotate outage targets and expand paired seeds before interpreting S04 gains. The same van-1 outage can hit different policy states, including an unused van; the observed difference may reflect assignment luck rather than robust resilience.
4. Keep operating cost, API spend and emissions separate. Synthetic rates do not validate commercial savings; emissions remain unavailable until a verified factor and coverage are supplied.

## Limits and conclusion

Two seeds per policy/scenario demonstrate functionality, not general statistical or commercial superiority. Time-limited solver candidates are not proven global optima. Geographic paths and congestion are schematic/simulated. S02/S04 diagnose without arbitrary resequencing or cargo rescue; S05 supports only one idle-depot reload. PostgreSQL, cloud Langfuse, production authentication, 100,000-run scale, real traffic, customer interviews and teacher approval remain unverified external or later-scope gates.

The delivered local observatory makes route evidence and agent/model resources inspectable. The 20-run manifest is reproducible evidence of actual model execution on a controlled synthetic problem. It supports targeted further experiments, not claims of real-world savings or perfect accuracy.

Rebuild: `.venv/Scripts/python.exe scripts/report.py`. Inputs: experiments/live-manifest.json plus its persisted run/event records.
