# Trace metrics and API contract

Status: implementation specification v0.1. These are proposed application contracts, not claims about vendor schemas. W01 converts them to executable schemas and migration tests. PLAN.md and this file override exploratory examples in research notes.

Current mission is A11. [LOGISTICS-SPEC.md](LOGISTICS-SPEC.md) adds immutable fleet, stop, matrix, route-plan and simulation records; its domain constraints apply in addition to this shared trace contract. Route-policy IDs and model-policy IDs are distinct. Actual model latency and simulated delivery duration are distinct clocks; estimated fleet CAD cost and model API cost are distinct accounts.

## U14 presentation/export contract

No backend schema changes. The analytics CSV is generated locally from the current matching-query metrics/usage/run-page responses. They are three separate reads, not a transactional snapshot. CSV metadata names UTC export/receipt times, server metrics snapshot/freshness when present, the five server filter values, all-date scope, stale state and newest-200 limit for status/scenario summaries. Usage totals cover all matching attempts, while run metrics cover matching whole runs/invocations. A blank cell is unavailable; numeric zero remains zero; API decimal strings remain exact. Units distinguish ratios, tokens, milliseconds, estimated USD API spend and estimated synthetic CAD fleet cost. All rows have nine columns with BOM, CRLF and CSV quoting; untrusted formula-leading text is apostrophe-prefixed. The export omits individual addresses, full outputs and credentials, and makes no invoice or causal-savings claim.

Dispatch selected-stop state is presentation-only `(tripId, stopId)`. Resolve it against the current visible trip; hiding/removing that route clears selection. Display only stored stop status/ETA, paired stop and route-source timestamps. It neither changes assignments nor grants a feasibility certificate. Existing current-road, fleet, cargo, budget and replay rules remain authoritative.

## Identity and ordering

U17 adds project-scoped durable orders and tracked broker request claims. See [BROKER-ORDERS.md](BROKER-ORDERS.md) for states, endpoint constraints, immutable payload and proposal-versus-delivery semantics. `explanation_policy=none` explicitly skips model calls; actual tool durations and handoffs remain. Request `mode=live` alone is not evidence of a model attempt. `model_policy_id=deterministic-tools-v1` identifies that omission policy, while leaf-attempt records remain authoritative for usage. Customer/reference/date metadata stays in local order storage and is not included in model evidence.

## U18 SQLite recovery and isolated QA

The online backup bundle contains the application database only. Its schema gate requires core application tables and validates `dispatch_trips` and `dispatch_fleet_config` fully when present, while accepting legacy U17 snapshots where either optional dispatch table is absent. Restore is to a new destination and preserves application orders/plans/trips/events/budget state; it does not restore LangGraph's separate checkpoint database or prove worker recovery across checkpoints. See [DATABASE-RECOVERY.md](DATABASE-RECOVERY.md).

The disposable QA profile uses temporary SQLite state and synthetic providers. Its fixed five-van fixture is explicitly selected with `--fleet-fixture`; it never imports operator dotenv/configuration, calls paid providers or sends email. It is local acceptance evidence, not production or live-provider provenance. See [QA.md](QA.md).

## U19 configurable fleet

`GENESIS_FLEET_CONFIG` optionally selects a private UTF-8 JSON roster with 1–10 unique vehicles and parcel capacities 1–40. Absence retains the four-vehicle, 40-parcel default. The API and worker bind to the validated canonical roster hash. Changes require quiescence: active reservations/trips, queued/running broker work and unresolved cargo fence incompatible updates; stale processes and frozen plans fail closed. Historical trip records remain readable after quiescent removals. This hash/configuration is an application contract, not user authentication, tenant identity or physical truck/legal-load validation. See [FLEET-CONFIGURATION.md](FLEET-CONFIGURATION.md).

Use UUID identities for project, run, invocation, model call, tool call, attempt, event, artifact and evaluation. One agent invocation may contain several model calls and tool calls. A retry is a new attempt under the same logical call. A revised analysis is a new invocation referencing the superseded artifact. Every stored row belongs to one project, including checkpoint and artifact metadata.

Each event has `schema_version`, `event_id`, `project_id`, `run_id`, `run_seq`, `kind`, `occurred_at`, `ingested_at`, optional `invocation_id`, `attempt_id`, `caused_by_event_id`, `trace_id`, `span_id`, and a schema-validated redacted `payload`. UTC RFC3339 timestamps preserve milliseconds; the UI renders in its explicit timezone, initially America/Toronto. Derive durations from a monotonic clock within a process and store integer milliseconds. Do not subtract clocks from unrelated workers as if they were synchronized.

Acquire a per-run database lock to allocate `run_seq` and insert the event in the same transaction. Enforce unique `(run_id, run_seq)` and `event_id`. Duplicate producer IDs return the original result only if payload hashes agree; conflicting payloads are rejected and recorded. An unconstrained database sequence is not commit ordering. Out-of-order occurrence times do not rewrite committed sequence. Reject impossible state transitions or quarantine them with a diagnostic event.

Persist domain state, event and exporter outbox record atomically where they describe one local transition. Provider execution is outside the database transaction: save intent before dispatch, use provider idempotency where supported, then persist response. A crash after provider execution but before response persistence creates an uncertain attempt; reconcile with provider IDs where possible and mark billing uncertainty. Do not promise exactly-once external calls.

## Core records

| Record | Required content |
|---|---|
| Run | Mission summary, input dataset/hash, scenario, config/prompt/code version, routing policy, provenance `fixture` or `live`, budget, timestamps, terminal status, final artifact ID |
| Invocation | Agent role/name, task/objective, parent invocation if any, started/finished times, status, prompt version, model-call IDs, input/output artifact IDs |
| Model attempt | Provider and requested/resolved model IDs; attempt number; generation settings; request ID; input/output tokens and category details; usage source; status/error; duration; price version; cost/currency/coverage |
| Tool attempt | Logical call, typed tool/version, attempt, sanitized argument reference, output reference, error class/code, timestamps, retryability |
| Handoff | Sender/receiver invocation IDs, sequence, source artifact IDs, concise task/message summary, relation type, actual/planned flag |
| Artifact | Producer, immutable content hash, MIME/size, storage key, preview, schema version, evidence refs, redaction status, lifecycle draft/accepted/rejected/superseded |
| Evaluation | Artifact and rubric IDs/versions, evaluator identity/model, deterministic results, criterion scores, verdict, evidence refs, duration and separate evaluation cost |
| Price record | Provider, model, currency, effective dates, source URL/retrieval date, per-category rates and billing rules |

Payloads must not contain credential values, hidden chain of thought or arbitrary executable commands. Store sanitized observable rationales and evidence. Untrusted Markdown is rendered with raw HTML disabled and links restricted to safe protocols. Artifacts are retrieved by authorized ID, never by a client-supplied filesystem path.

## Events and states

Events include `run.queued`, `run.started`, `agent.started`, `model.started`, `model.completed`, `model.failed`, `tool.started`, `tool.completed`, `tool.failed`, `handoff.sent`, `artifact.created`, `validation.completed`, `agent.completed`, `agent.failed`, `run.cancel_requested`, `run.completed`, `run.failed`, `run.cancelled`, `run.timed_out`, `run.budget_exceeded`, and `telemetry.export_failed`. W01 assigns exact payload schemas. Recovery emits a resumed marker without inventing a second successful model response.

Run state: queued -> running -> one of succeeded, failed, cancelled, timed_out, budget_exceeded. `run.completed` means succeeded only after required validation. A completed invocation can contain failed attempts followed by success. `cancel_requested` is not terminal; stop further work, cancel provider work where possible, reconcile in-flight usage and then close. Completed runs are immutable except separate append-only corrections/evaluations; terminal retries create a new linked run.

A11 adds `matrix.created`, `route.proposed`, `route.validated`, `simulation.event`, `exception.assessed` and `route.replanned`, with dataset/plan/manifest IDs and typed payloads. Model explanations never substitute for independent route certificates. Store run outcome and fleet outcome separately: a verified infeasibility/no-candidate diagnostic can complete the analysis mission successfully without claiming a feasible route or on-time delivery. Require explicit artifact kind `accepted_plan` or `accepted_diagnostic` before finalization.

Route certificates carry `scope` initial_full_plan/residual_suffix, source plan/matrix/state hashes, future-stop coverage and independent constraints. Historical simulated violations are separate immutable facts. The active simulator's private future-event manifest is not an agent-readable artifact; agent tool authorization restricts it even within the same project. Active simulation history includes revealed events only.

## Metric dictionary

All metrics share a server-resolved cohort and snapshot. Default time filter is run creation time in `[from,to)`, with timezone explicit. Agent/model filters select runs containing matching invocations/calls; run metrics include entire matching runs. Agent charts then use matching invocations only, labeled as such. A selected run remains fully inspectable even when a chart-level filter narrows highlights. Never silently sum only visible table rows.

| Metric | Definition and display rule |
|---|---|
| Execution count | Distinct matching run IDs; separate live and fixture datasets |
| Mission success rate | succeeded / (succeeded + failed + timed_out + budget_exceeded); show numerator/denominator; queued/running/cancelled excluded and counted separately |
| Mean run duration | Mean wall duration of started terminal runs, including cancelled/timed-out runs; exclude pre-start cancellations; show cohort count and p50/p95 separately |
| Tokens | Sum input + output once per billable leaf attempt; cached input and reasoning output are subsets where provider defines them that way; show coverage |
| Cost | Sum known leaf charges in one currency; provider totals override estimates for that call; missing calls make total partial, never zero |
| Error count | Failed model/tool attempts; count agent/run terminal failures separately to avoid counting propagated errors as independent tool errors |
| Most-used agent | Highest invocation count; label ties and count |
| Slowest agent | Highest mean completed invocation duration with sample count; show total contribution separately |
| Retry count | Sum `max(attempt_count - 1,0)` by logical call; analyst revisions reported separately |
| Quality | Versioned rubric score 0–100 on evaluated artifacts; unevaluated is null; show score distribution and evaluated fraction |
| Tool error rate | Failed tool attempts / all completed tool attempts; canceled/in-flight attempts excluded explicitly |

Example billing fixture: 1,000 input tokens including 200 cached, 300 output tokens including 50 reasoning. Total tokens = 1,300, not 1,550. If uncached input is $1/M, cached $0.50/M and output $2/M, estimated call cost = $0.0015. These prices are invented test rates, not vendor pricing. Decimal strings are serialized; round only presentation. Invalid categories or missing rate rules produce unavailable estimates. All retries with known usage count, including failures. Evaluation spend has a separate subtotal plus an all-in total.

Fleet metrics are defined in LOGISTICS-SPEC.md and returned separately: distance, lateness/on-time with served coverage, parcel/shift utilization, estimated operating cost and optional emissions with factor coverage. Never convert a quality rubric score into route feasibility or use the observed-agent Sankey as a vehicle-route map.

Run wall time includes waiting and concurrent work. Invocation durations can overlap; their sum is not end-to-end latency. Critical-path computation uses explicit dependency edges and well-defined intervals. Correlation between cost and quality does not prove causation.

## Budget reservation and settlement

Before each billable model/tool dispatch, atomically reserve a conservative maximum prospective charge against the run's remaining budget under a database lock. Compute the reservation from the exact price version, bounded input, maximum output and known fixed/tool charges; use uncached input rates unless cache eligibility is certain. Enforce `settled_known + held_reservations + new_reservation <= run_budget`. Judge calls, retries and escalations require their own reservations, including calls from concurrent branches. A project-level aggregate budget uses the same transactional rule where configured.

Dispatch fails closed if required rates, usage bounds or billing categories are unknown. A provider-specific adapter must establish a conservative upper bound; otherwise disable that live configuration. Atomic reservation denial emits an observable budget event and prevents dispatch. Settle known usage once under the attempt ID and release only the proven unused remainder. Duplicate responses must not settle twice. A timed-out/uncertain attempt retains its reservation until reconciled; do not release funds merely because a lease expired or a retry was scheduled. If unresolved reservations prevent further work, end with budget_exceeded plus a billing-uncertain explanation.

Provider invoices may differ from estimates, rounding or delayed adjustments; this is an application-side conservative spending control, not a guaranteed invoice cap. If reconciliation exceeds a reservation, record overrun, freeze further dispatch and surface the discrepancy. Test two simultaneous calls competing for the last available balance, retries while prior usage is unknown, judge costs, stale price records, duplicate settlement and crash recovery of held funds. Use provider account limits as a separate backstop where available.

## Chart semantic contracts

Graph nodes show role aggregates or actual invocations, with a visible mode label. Planned edges are dotted and excluded from observed communication counts. Timeline uses actual intervals and separate retry rows. The Sankey is a **two-column communication matrix**: distinct sender-role nodes on the left and receiver-role nodes on the right, one unit per observed handoff. Sender and receiver nodes remain different identities even for the same role. Each message contributes to exactly one edge; total edge weight equals the observed handoff count. There are no intermediate nodes and no claim that messages or tokens are conserved through an agent. Repair messages and verifier fan-out each count as their own observed events; event sequence and iteration remain available in details. Test a verifier with two outgoing messages and an analyst repair. Heatmap cells show scenario x agent mean latency with `n`; an optional error mode uses an explicitly named denominator. Null cells are hatched. Comparison uses paired scenario/input groups with equal metric definitions and exposes cohort imbalance.

## API surface

| Endpoint | Contract |
|---|---|
| `POST /api/v1/runs` | Validated mission/config/budget; project-scoped idempotency key; transactionally persist request; return 202 and run ID |
| `GET /api/v1/runs` | Allowlisted filters/sort, stable cursor pagination; default 50, maximum 200 rows; return snapshot and count |
| `GET /api/v1/runs/{id}` | Summary, metadata, artifact refs and last committed sequence; no unbounded embedded event history |
| `GET /api/v1/runs/{id}/events?after_seq=N` | Ordered bounded history; deterministic cursor and continuation |
| `GET /api/v1/runs/{id}/stream` | SSE, IDs based on run sequence, Last-Event-ID resume, heartbeat, duplicate-safe client reducer |
| `GET /api/v1/metrics` | Shared filters and snapshot token; denominators, coverage and units returned with values |
| `GET /api/v1/artifacts/{id}` | Authorization, MIME policy, bounded preview or download; immutable content hash |
| `POST /api/v1/runs/{id}/cancel` | Idempotent request; does not claim instant cancellation |
| `GET /api/v1/comparisons?left=...&right=...` | Two authorized runs; normalized metric and artifact comparison |

A11 endpoints: `GET /api/v1/datasets`, `GET /api/v1/scenarios`, `GET /api/v1/route-plans/{id}`, `GET /api/v1/route-plans/{id}/geometry`, `GET /api/v1/runs/{id}/fleet-metrics`, and `GET /api/v1/runs/{id}/simulation-events`. All have project authorization, bounded responses and immutable version refs. Run creation validates dataset/scenario/logistics-policy/model-policy IDs. No input field may override hard constraints without creating a new recorded policy version. Route comparison displays input/event-manifest comparability and excludes invalid objective-only savings claims.

Typed errors contain code, safe message, request ID and retryability. Validate IDs, query bounds, payload size and project scope at the boundary. All hosted deployments require authenticated API and artifact access. A localhost-only development profile may use a fixed synthetic project and no identity provider; it must bind to loopback and refuse nonlocal deployment in that mode.

SSE backfills committed events then follows new rows; one stream per selected run, not per chart. A stale cursor returns a recoverable snapshot-expired condition. Overview refreshes a consistent snapshot instead of depending on cross-run global commit order. Offline replay reduces the stored event stream locally and never calls an agent or incurs spend. A new execution from an old input is explicitly labeled Rerun.

## Retention and recovery

Proposed local retention is 30 days for raw artifacts and 90 days for sanitized events; pin experiment release exports until project submission is complete. Make these configurable policy values before deployment. Deletion follows references across artifacts, checkpoints, database and external traces; preserve a redacted tombstone where needed. Verify backup restore with known checksums and a reconstructable projection. Append-only describes ordinary event operations, not an exemption from deletion requirements.
# U12 route memory extension

`dispatch_trips` remains authoritative history; no separate mutable learned-route table replaces it. Route group/variant IDs hash normalized directional places, parcel/deadline workload, service and broker policy; variants retain semantic pickup/drop order and occurrence identity. Successful metrics use completed accelerated simulations only. Trip library samples are trips; broker-context samples are completed full missions, with elapsed time as fleet makespan and distance as fleet total. `deliveries_per_simulation_hour` is completed mission cadence, not measured driver labor productivity. Explicit `sample_unit`, mission/trip counts and ranking basis accompany model aggregates.

`route_memory.context`, `.assessed` and `.admission` record bounded evidence, current selection/revalidation and final trip-admission outcome. `model.omitted` records policy/memory omissions without creating provider attempts. Agent usage is null with `not_applicable_routine_policy` or `not_applicable_route_memory`; it is neither a missing billed response nor a cached-token provider result. Historical replay hides the final route-memory summary until terminal completion and exposes per-role omission only at the corresponding recorded output.

API endpoints and payload boundaries are exported from executing Pydantic models into packages/contracts/openapi.json; the documented operational contract is DISPATCH.md and ROUTE-MEMORY.md. Unknown history/provider fields never become implicit authority. A final road/fleet race may reject admission after zero explanations; the final result is an explicit diagnostic, with `selection_outcome` separate from `admission_outcome` and the actual omitted roles retained.

## U13 budget email

`budget_alerts` stores one logical event per project budget: immutable reason/snapshot/time, delivery state, attempt count, lease/claim, safe diagnostic and completion timestamps. It is separate from Langfuse's event outbox. Budget trigger and ledger change share a transaction; a rejected global reservation commits the alert before raising, while no reservation/provider dispatch is manufactured. SMTP occurs outside the transaction and completion is fenced by the current claim. No sender, recipient, host, password or raw SMTP exception is persisted in this record or exposed by GET `/api/v1/budget-alerts`.

The first reason is `budget_reached`, `global_dispatch_blocked` or `project_frozen`; snapshots retain known/held USD and conservative CAD valuation separately. Worker backfill detects historical exhaustion/freeze and validated lowered ceilings. Three known pre-DATA attempts may run; accepted DATA with failed QUIT remains sent, uncertain DATA or expired sending lease is terminal uncertain, and a stale completion cannot overwrite it. The global-cost view is independent of status fetch failure. U14 locates it in Analytique, outside execution replay pages. BUDGET-EMAIL.md defines operational/configuration and recovery limits.
