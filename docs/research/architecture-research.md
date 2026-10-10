# Architecture research and recommendation

Research date: 2026-10-10. Status: planning evidence; no implementation or runtime verification claimed. Requirements supplied in the task brief: at least four distinct agents, two tools, twenty runs across five scenarios, and graph, timeline, Sankey, comparison, heatmap and KPI views.

This research note supplies rationale, not a competing specification. [PLAN.md](../PLAN.md), [DATA-CONTRACT.md](../DATA-CONTRACT.md), [MODEL-POLICY.md](../MODEL-POLICY.md) and [VALIDATION.md](../VALIDATION.md) govern implementation where a research recommendation is broader or less specific.

## Decision

Build one focused observatory around a Python LangGraph execution service, PostgreSQL as the authoritative operational event store, a typed API and server-sent event stream, and a custom web interface. Export correlated telemetry to Langfuse through OpenTelemetry. Langfuse supplies trace investigation and evaluation capabilities; the custom interface supplies the domain-specific output inspection and six coordinated views. Avoid adding a second orchestrator, Kafka, Redis, a vector database or another tracing vendor until a measured requirement justifies it.

This is an engineering proposal, not a claim that these products jointly provide the application out of the box. Package versions, licenses, hosting constraints and actual interoperability need a short integration spike before the stack is locked.

## Primary-source findings

| Evidence verified on research date | Consequence for this project |
| --- | --- |
| LangGraph distinguishes thread-scoped checkpoints from cross-thread stores; in-memory checkpoints do not survive a restart. Persistent PostgreSQL and SQLite options are documented. [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | Use persistent checkpoints for execution recovery. Keep business events and artifacts in an application schema, distinct from framework internals. |
| LangGraph documents checkpoint history, replay and forking. [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers) | Label observational playback separately from execution replay. A new execution can create new model/tool results and spend. |
| OpenTelemetry's general semantic-conventions site now directs GenAI conventions to a dedicated repository. [Registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/), [GenAI repository](https://github.com/open-telemetry/semantic-conventions-genai) | Pin a convention revision and implement one mapping adapter. Do not copy old attributes without checking their current status. |
| Langfuse exposes OTLP/HTTP ingestion and APIs for observations and aggregate metrics. [Public API](https://langfuse.com/docs/api-and-data-platform/features/public-api) | Correlate application events with traces; use backend APIs, never browser-held secret credentials. |
| Langfuse can ingest usage and cost or infer cost from model definitions. Ingested values take precedence; pricing updates affect new generations. [Cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking) | Retain raw usage, exact model identity, price version and whether cost is reported or estimated. Unknown cost must remain unknown. |
| Langfuse provides evaluation workflows and masking before export. [Evaluation](https://langfuse.com/docs/evaluation/overview), [Masking](https://langfuse.com/docs/observability/features/masking) | Use deterministic checks alongside rubric-based judging. Redact sensitive content before telemetry export. |
| PostgreSQL notifications are delivered after commit; identical notifications can be folded; payload size is limited. [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html) | Persist event rows first. Notifications can wake consumers but cannot be the authoritative replay log. |
| SSE is one-way, supports event IDs and reconnection, and has connection limits under HTTP/1. [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) | Use one stream per active client and explicit backfill semantics; send user commands through normal authenticated API requests. |

## Proposed component boundaries

1. **Execution worker:** runs the four agent roles, invokes tools through typed adapters, enforces budgets and emits lifecycle events. Separate long-running work from request-serving processes. Concurrency and retries must be bounded.
2. **Operational database:** stores runs, agent invocations, tool attempts, immutable event records, artifact metadata, evaluation records and version manifests. Keep checkpoints in a separate schema. An outbox supports retryable export to external telemetry.
3. **Artifact store:** holds full outputs, datasets and large tool results. Database rows contain immutable references, content hashes, MIME type, size and access scope. Start with an explicitly managed local artifact directory for development; use object storage for deployment.
4. **Read API:** returns paginated runs, selected span/event details, output previews and server-computed aggregates. Authorization applies to every query and artifact fetch. Filters and time ranges have one shared contract across all visualizations.
5. **Live delivery:** reads committed events after a cursor; streams compact changes. On reconnect, backfill from storage before following live events. Display stale/disconnected status and offer snapshot recovery if the cursor has expired.
6. **Observability adapter:** maps domain events to OTel spans/links and Langfuse observations, preserving correlation IDs. Export failure must be visible without making external tracing the sole record of completed work.
7. **Interface:** overview for triage, run explorer for filtering, run workspace for graph/timeline/output inspection, and experiment comparison for evaluation. Keep finalized outputs easy to find; avoid burying the product's primary value behind a decorative graph.

## Proposed data contract

Each event includes schema version, globally unique event ID, tenant/project ID, run ID, invocation ID when relevant, event kind, occurrence timestamp, ingestion timestamp, trace/span identifiers, causation ID, and a redacted typed payload. Preserve separate agent invocation, model call and tool attempt identities: an agent is not a single model call.

Allocate sequence numbers transactionally under a per-run ordering mechanism; do not assume an unconstrained global database sequence equals commit order. Enforce uniqueness on producer event IDs to make retries idempotent. Ordering for display is ingestion sequence with timestamps available as evidence. Cross-run views need a documented cursor strategy or snapshot boundary; a naive `id > last_id` scan can skip late-committing rows.

Model attempts carry provider/model/version, temperature and other relevant generation settings, prompt/template version, token categories, service tier, response status, duration and usage provenance. Do not double-count cached tokens already included in total input or reasoning tokens already included in total output. Cost uses decimal arithmetic, explicit currency, price-source version and estimation status. Sum leaf billable calls once; parent spans are aggregates.

Artifacts carry producer invocation, accepted/rejected/superseded status, output schema version, validation results and evidence references. Evaluation records carry rubric/version, evaluator identity/model, evidence pointers, score scale, timestamp and explicit unavailable status. Never present an uncalibrated judge score as a probability of correctness.

## Four-agent demonstrator

Use the canonical bounded data-analysis workflow: coordinator specifies the analysis and success criteria, assigns work and finalizes only an accepted result; researcher retrieves an evidence bundle with source references and missing-data notes; analyst produces calculations and a recommendation from that evidence; verifier independently checks the draft and returns an accept/revise/reject verdict with evidence links. Allow at most one analyst repair cycle. A deterministic router enforces transitions. The roles have distinct prompts, responsibilities and output schemas, not four cosmetic names around an identical task. Report preparation remains part of these outputs; there is no separate writer agent.

Two initial tools: an allowlisted dataset/document reader, and a deterministic typed metric calculator that also supports independent verification. Restrict tool inputs and resource bounds; do not expose arbitrary SQL, generated Python or shell execution. Make tool versions and exact input/output artifacts inspectable. Begin with fixture-backed adapters, then enable live model execution with credentials and explicit spending limits.

Compare the canonical baseline policy (capable standard model for all four roles) with the candidate tiered policy (economy researcher extraction, standard coordinator/routine analysis, capable verifier for difficult contradictions), as defined in MODEL-POLICY.md. Pin actual available provider model identifiers during the integration spike. Record routing, escalation and fallback decisions. Changing model strength is an evaluated configuration change, not a presumed quality improvement.

## Six views: truthful semantics

| View | Data and interaction contract |
| --- | --- |
| Agent graph | Actual invocations and handoffs; distinguish planned edges from observed edges, retries and parallel branches. Selecting a node filters timeline and opens its outputs. |
| Timeline | Start/end intervals, overlap, retries and queue time; open invocations remain visually open. Run wall time is not the sum of parallel durations. |
| Sankey | Two columns: sender-role nodes and receiver-role nodes have distinct identities, including for the same role. Each observed handoff contributes once to one edge; total edge weight equals observed message count. Include repair messages and verifier fan-out. No intermediate nodes or through-agent flow conservation. Provide count labels, an accessible sender/receiver table and timeline sequence details. |
| Comparison | Same scenario/dataset/version boundaries; report sample counts, missing values and paired differences. Compare quality, cost and latency together. |
| Heatmap | Agent/scenario versus a named metric, with units and denominator; unavailable cells differ from zero. Provide a readable table alternative. |
| KPIs | Success rate with denominator, run latency, known cost plus missing-cost coverage, tool error rate and rubric scores. Specify time window and inclusion rules. |

## Verification plan

Use the five canonical scenarios: S01 clean complete cost/usage dataset; S02 missing/contradictory evidence; S03 recoverable tool timeout; S04 seeded numerical defect detected by the verifier with at most one repair; S05 worker interruption after checkpoint. The minimum experiment matrix is five scenarios x two policies (baseline and tiered) x two repeats = twenty real executions. The stronger target is five x two x five = fifty when budget permits. Fixtures support deterministic checks but do not count toward R04 live executions. Pair scenario inputs across policies and interleave or randomize policy order as specified in VALIDATION.md. Treat twenty runs as functional demonstration, not statistical proof of production quality. Preserve scenario input, expected invariants, config/version manifest, event export and artifacts for every run.

Before accepting the first end-to-end slice, test process restart recovery, duplicate ingestion, delayed events, stream disconnect/backfill, concurrent runs, bounded retry, budget termination and inaccessible cross-project artifacts. Rebuild projections from the event log and compare aggregates. Verify external trace correlation and explicit export failure behavior. Verify the absence of secrets in exported payloads using deliberate test markers.

For model quality, establish deterministic schema/numerical/evidence checks first. Have a separate verification model judge final artifacts against a versioned rubric and cited evidence; retain disagreements and sampled human review as calibration. A model cannot certify that code works: run actual integration and browser tests, and preserve their results. Distinguish application-development reviewer agents from the four domain agents being observed.

## Rejected shortcuts and open decisions

- An animated graph alone is not an observatory; output inspection, provenance and failure diagnosis are core acceptance gates.
- Checkpoints are execution recovery state, not a replacement for an explicit product event contract.
- Browser-only mock data may validate layout but cannot establish telemetry correctness or completed integration.
- Raw chain-of-thought is neither required nor an output artifact to collect; expose concise decisions, tool evidence and final work products.
- Set retention and deletion behavior for database rows, artifacts, checkpoints and external traces together; content redaction and retention are distinct controls.
- Defer large-scale streaming infrastructure until measured event volume or fan-out exceeds the tested PostgreSQL design.
- Resolve deployment target, tenant model, authentication provider, budget ceiling and permitted external telemetry region before production rollout. These do not block the local planning and fixture-backed vertical slice.

## Research action record

Performed primary-source web searches for LangGraph persistence/recovery, Langfuse tracing/evaluation/cost, and OpenTelemetry GenAI conventions; opened the source pages linked above; checked PostgreSQL notification and SSE transport semantics; synthesized the proposed boundaries, event contract, chart meanings and verification gates. No dependencies installed, no external accounts created, no live model runs executed, and no application code written by this research task.

Alignment revision, 2026-10-10: W00; requirements R01, R02, R04, U02 and U03. Owner: architecture research subagent; inherited model configuration, exact model ID not independently available. Owned file: this note only. Dependencies read: README, PLAN, REQUIREMENTS, DATA-CONTRACT, VALIDATION, MODEL-POLICY, BACKLOG and installed Ponytail skill. Applied a documentation-only patch to align roles, tools, policy comparison and execution matrix, and make canonical-contract precedence explicit. Acceptance check: compare amended sections against canonical role/tool tables and five-scenario/two-policy/two-repeat matrix. Exclusions: application code, experiments, other owners' files, independent approval and publishing. Lead integrates this record into ACTION-LOG.md and obtains independent review.

Sankey correction, 2026-10-10: W00; requirements R10, R11 and U02. Same research owner and file scope. Independent verification identified invalid flow conservation at verifier fan-out. Read the revised DATA-CONTRACT and UI-SPEC Sankey definitions with `rg`, then replaced this note's Sankey row with the canonical two-column sender/receiver event-count semantics. Acceptance: separate node identities, one edge contribution per observed message, repair/fan-out inclusion and no through-agent conservation match both contracts. No other design changes or runtime checks; independent re-review and central action-log integration remain with the lead.
