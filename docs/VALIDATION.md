# Verification experiments and release gates

## Planning package verification

Check local links, requirement coverage, coherent roles/model policy, phase dependencies, actual tool-install evidence and honest implementation status. Independent reviewer must identify contradictions and missing acceptance criteria. Review results are recorded in docs/reviews. Planning review does not establish application correctness.

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

Use actual test results, not a model's assertion that code should work. Test behavior at boundaries; do not create snapshots of internal implementation just to increase coverage. Runtime error paths, money, reducers and privacy are meaningful test targets. A compile check alone does not verify the system.

## Five scenarios and execution matrix

| ID | Scenario | Expected invariant |
|---|---|---|
| S01 | Clean complete cost/usage dataset | Evidence-backed correct recommendation; four agents and both tools used |
| S02 | Missing/contradictory evidence | Coverage explicit; unsupported claims rejected; unknown metrics stay null |
| S03 | Recoverable tool timeout | Bounded retry, attempt history retained, no duplicate logical result |
| S04 | Analyst draft contains seeded numerical defect | Verifier detects it; at most one repair; original and corrected artifact retained |
| S05 | Worker interrupted after checkpoint | Recovery preserves event history; no double-counted usage; uncertain external calls labeled |

Minimum dataset: five scenarios x two policies (baseline and tiered) x two repeats = 20 real executions. Target: five x two x five = 50 when budget permits. Record seed/input hash, scenario injection, routing policy, model IDs, prompt versions, tool versions, price version and actual outcomes. Fault injection is labeled; execution and model usage must still be real to count as a live run. Fixtures cannot substitute for R04. Calibration examples are separate from measured experiments.

Run sequential paired scenario inputs or randomize/interleave policy order to reduce time-of-day confounding. Keep data and rubric fixed. Report success, failure, cancellation, cost coverage, mean/p50/p95 duration, total cost, cost per accepted output and quality per scenario/policy. At small n, show raw points; p95 is descriptive and unstable. Do not infer general superiority or statistical certainty from 20 runs. Larger validation requires a power/precision target, not a marketing claim.

## Ten required analysis questions

| Question | Evidence method |
|---|---|
| Most tokens? | Sum leaf usage by producer agent with coverage |
| Longest execution time? | Mean invocation duration and contribution distribution, sample counts |
| Most errors? | Failed attempts by agent and error class, normalized error rate |
| Most retries? | Logical call retry counts by task/tool and scenario |
| More agents vs duration? | MVP uses four fixed roles: cannot infer relationship. Add separately labeled controlled 4-vs-5-role ablation if budget allows; otherwise explicitly report not identifiable |
| Higher cost vs better quality? | Paired scenario scatter/quality differences, coverage and confounders |
| Bottlenecks? | Critical path, queue time and tool/model interval analysis |
| Unnecessary communications? | Candidate redundant handoffs by content/evidence reuse, then controlled removal test; count alone is insufficient |
| Reduce cost? | Tiered routing comparison including retries and evaluation cost |
| Improve reliability/quality? | Failure taxonomy plus validated interventions and tradeoffs |

The report must contain at least three recommendations tied to measured findings. Candidate hypotheses: economical extraction routing; elimination of a measured redundant handoff; stricter evidence validation before analysis. Do not present these as supported results until experiments establish them. If an intervention fails, publish the failed result and revise the recommendation.

## Review and push gates

1. Author completes work package, updates docs/action log and inspects diff.
2. Relevant format/type/unit/integration/browser checks pass; record exact commands, environment and results. Credentials are never echoed.
3. Independent capable model reviews requirements, code, affected callers, fixtures, screenshots where applicable, and test evidence. For UI, visual evidence is mandatory once UI exists.
4. Critical/high findings block release. Medium findings affecting required behavior also block; other findings require written disposition and a tracked fix.
5. Freeze reviewed content; inspect staged paths and secret scan; commit. Record commit in review evidence or an associated follow-up record.
6. Verify remote and push ordinary codex/ branch under existing user authorization. No remote means a documented publishing blocker, not fabricated completion.

For hosted deployment, verify identity/project scoping, allowed data, provider limits, retention, secret configuration, artifact authorization, worker restart behavior and restore process. Local demonstration is an acceptable source deliverable and does not require purchasing cloud infrastructure.

## Demonstration outline

0:00–1:00 problem and decision; 1:00–2:30 four agents/two tools; 2:30–5:00 execution/output/evidence; 5:00–7:00 graph/timeline/Sankey and replay; 7:00–9:00 comparison/heatmap/quality and costs; 9:00–10:30 three recommendations and limits; 10:30–12:00 questions or failure recovery. Assign both presenters meaningful sections and record contributions. Keep a locally replayable known run for provider outages; label replay clearly.
