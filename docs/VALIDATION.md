# Verification experiments and release gates

## Planning package verification

Check local links, requirement coverage, coherent roles/model policy, phase dependencies, actual tool-install evidence and honest implementation status. Independent reviewer must identify contradictions and missing acceptance criteria. Review results are recorded in docs/reviews. Planning review does not establish application correctness.

The prior planning-review.md covers the historical A1 package. The current A11 revision requires a new independent logistics review. Source requirements remain, with logistics contract and U06 added.

## Test layers

| Layer | Required cases | Evidence |
|---|---|---|
| Pure contracts/calculations | Cached/reasoning subsets; decimal prices; unknown costs; overlapping durations; retries; zero denominators; status rules; two-column Sankey with verifier fan-out and repair messages | Small exact fixtures and assertions |
| Persistence/integration | Atomic event/outbox commit; duplicate/conflicting event; ordering; schema migration; checkpoint restart; uncertain provider response | Database integration tests and event exports |
| Worker behavior | Tool timeout; bounded retry; budget exhaustion; concurrent reservation race; unknown usage holds; duplicate settlement; judge spend; cancellation; failed validation; one repair; lease expiry/fencing | Scenario logs with terminal states, invocation counts and budget ledger reconciliation |
| Streaming/replay | Disconnect/reconnect; duplicate events; expired cursor; out-of-order occurrence time; deterministic replay; no future artifacts | Reducer tests and browser scenarios |
| API/security | Invalid IDs/filters; oversized payload; path traversal; cross-project artifacts; HTML injection; unauthorized run/cancel | API tests with safe adversarial fixtures |
| Telemetry | Export outage/retry; redaction before export; trace correlation; no double-counted calls | Sanitized trace comparison and marker tests |
| UI | Run/filter/compare/replay; output/citation inspection; consistent cohort; long/empty/failed states | Playwright flows, screenshots, keyboard review |
| Delivery | Locked clean install; fixture profile without API key; backup restore; live configuration errors | Rehearsal record with environment and commands |
| Routing | Capacity, service-start windows, waiting/return time, duplicate/mandatory stops, optional penalty disclosure, directed unreachable arcs, timeout/no-candidate vs infeasible | Tiny checked matrices and independent feasibility certificate; solver totals not trusted |
| Logistics simulation | Equal exogenous schedule with independently evolved states, future-event reads denied, prefix/current-leg/cargo lock, depot loading, one-replan cap, stale-state result rejection, late history retained, zero simulated decision-delay assumption explicit | Stored sealed manifests, scoped certificates and independent cumulative distance/time/cost reconstruction |
| Map/business metrics | Stored geometry ↔ route version, stop/table linkage, WebGL/tiles unavailable fallback, served denominator, baseline zero, partial emissions factors | Browser and exact metric fixtures; map screenshot plus table path |

Use actual test results, not a model's assertion that code should work. Test behavior at boundaries; do not create snapshots of internal implementation just to increase coverage. Runtime error paths, money, reducers and privacy are meaningful test targets. A compile check alone does not verify the system.

## Five scenarios and execution matrix

| ID | Scenario | Expected invariant |
|---|---|---|
| S01 | Nominal depot/fleet day | Five agents used; baseline/candidate independently checked; complete service/constraints visible |
| S02 | Clustered seeded congestion | Planning snapshot and simulated outcomes distinguished; same events per paired policy |
| S03 | Tight/incompatible mandatory windows | No-candidate, proved infeasible if available, and feasible status distinguished; no silent relaxation |
| S04 | Vehicle unavailable at stop-boundary | No cargo teleportation or phantom roadside transfer; explicit unserved onboard deliveries; one permitted replan |
| S05 | New delivery at stop-boundary | Depot loading and vehicle availability enforced; completed prefix preserved; unserved reason if no admissible plan |

Minimum dataset: five scenarios x two logistics policies (`baseline_only`, `solver_with_one_replan`) x two paired seeds = 20 actual five-agent executions. Target 50 with five paired seeds when budget permits. Record source/matrix/geometry/manifest hashes, exogenous events, logistics/model-policy IDs, model/prompt/tool/solver versions, limits and rates. Keep model tiering fixed; later model-cost ablation is additional. Synthetic deliveries/traffic remain clearly simulated even when agents/models execute live. Fixture-only runs cannot substitute for R04. Calibration examples remain separate.

Randomize/interleave paired policies with the same dataset/event manifest and constraint/rate definitions. Report every run's valid-plan/diagnostic outcome, mandatory service and optional omissions, on-time/served, distance, late minutes, utilization and estimated fleet costs; separate API spend and agent wall time. Show paired full-service feasible comparisons plus all-run coverage/failure summaries to avoid dropping inconvenient cases. Candidate adoption requires validation and no worse comparable declared objective when a valid baseline exists; simulation can still reveal worse real-world-like outcomes, which must remain visible. At small n, raw points and uncertainty are essential; 20 runs do not establish general commercial savings.

## Ten required analysis questions

| Question | Evidence method |
|---|---|
| Most tokens? | Sum leaf usage by producer agent with coverage |
| Longest execution time? | Mean invocation duration and contribution distribution, sample counts |
| Most errors? | Failed attempts by agent and error class, normalized error rate |
| Most retries? | Logical call retry counts by task/tool and scenario |
| More agents vs duration? | MVP uses five fixed roles: relationship not identifiable. Optional controlled optional-role ablation requires additional runs and a justified valid workflow; otherwise report insufficient variation |
| Higher cost vs better quality? | Paired scenario scatter/quality differences, coverage and confounders |
| Bottlenecks? | Critical path, queue time and tool/model interval analysis |
| Unnecessary communications? | Candidate redundant handoffs by content/evidence reuse, then controlled removal test; count alone is insufficient |
| Reduce cost? | Fleet route-policy cost/coverage comparison; separate later model-tier ablation includes retries and judge spend |
| Improve reliability/quality? | Failure taxonomy plus validated interventions and tradeoffs |

Report at least three measured recommendations. Candidate hypotheses: route consolidation at preserved coverage; bounded replanning under specific congestion/outage scenarios; stricter feasibility/arrival checks before dispatch proposals. Report resource-cost recommendations separately. No supported recommendations exist until experiments run. Failed interventions and infeasibility are useful results, not outcomes to hide.

## Review and push gates

1. Author completes work package, updates docs/action log and inspects diff.
2. Relevant format/type/unit/integration/browser checks pass; record exact commands, environment and results. Credentials are never echoed.
3. Independent capable model reviews requirements, code, affected callers, fixtures, screenshots where applicable, and test evidence. For UI, visual evidence is mandatory once UI exists.
4. Critical/high findings block release. Medium findings affecting required behavior also block; other findings require written disposition and a tracked fix.
5. Freeze reviewed content; inspect staged paths and secret scan; commit. Record commit in review evidence or an associated follow-up record.
6. Verify remote and push ordinary codex/ branch under existing user authorization. No remote means a documented publishing blocker, not fabricated completion.

For hosted deployment, verify identity/project scoping, allowed data, provider limits, retention, secret configuration, artifact authorization, worker restart behavior and restore process. Local demonstration is an acceptable source deliverable and does not require purchasing cloud infrastructure.

## Demonstration outline

0:00–1:00 logistics decision; 1:00–2:30 five agents/typed solver tools; 2:30–5:00 route map, feasibility and outputs; 5:00–7:00 congestion/exception, simulation and agent replay; 7:00–9:00 six observatory views, paired outcomes and distinct cost accounts; 9:00–10:30 three recommendations/limits; 10:30–12:00 questions or recovery. Both presenters contribute. Locally replayable trace and packaged map/table protect the demo from provider/tile outages; label simulation and replay.
