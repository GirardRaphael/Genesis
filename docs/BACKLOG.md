# Executable work packages

Every task uses docs/templates/TASK.md. The owner records the actual model and command evidence. Effort estimates in PLAN.md apply to the whole implementation, not guarantees per task. No work package below is claimed implemented.

| ID | Owner tier | Dependencies | Owned deliverable | Acceptance / done |
|---|---|---|---|---|
| W00 | Lead/product researcher + independent frontier reviewer | None | Plan, source matrix, skills register, design direction, DISCOVERY.md eight answers and weighted matrix | No unresolved planning blockers; source requirements mapped; Ponytail evidence retained; discovery answers labeled evidence/hypothesis, first fixture provenance recorded before implementation; interviews/scoring required before commercial claims |
| W01 | Strong backend + normal frontend | W00 | Dependency locks, contracts, migration, deterministic fixture, local skeleton | Compatible stack recorded; schema validates; migration/fixture roundtrip; offline launch; baseline machine recorded |
| W02 | Strong workflow implementer | W01 | Four agents, prompts, reader/calculator, bounded graph | One complete live mission exercises roles/tools with verified output; no free-form execution |
| W03 | Workhorse UI/API implementers with disjoint paths | W01 | Run inventory, detail API, artifact view, typed filters | UI -> API -> DB -> output path; stable URL and shared cohort; no credential leaks |
| W04 | Strong reliability implementer | W02 | Durable claims/checkpoints, event/outbox/SSE, retries/budgets/cancel, atomic cost reservation/settlement | Restart/disconnect and concurrent-budget cases; duplicate handling; unresolved usage holds funds; Langfuse correlation |
| W05 | Strong UI designer/implementer | W03; W04 for live state | Six charts, replay, compare, tokens, component states | Every chart matches contract; accessible alternatives; linked output inspection; visual review |
| W06 | Independent verifier + workhorse fixes | W04 + W05 | Test suite, CI, review and performance records | Required flows and failure fixtures pass; no blocking review findings; secret scan clean |
| W07 | Analysis lead + separate runtime judge | W06 | 20 minimum live runs, experiment manifest, findings | Five scenarios, paired policies, calibrated rubric, all ten questions addressed with limits |
| W08 | Economy documentation + strong evidence reviewer | W07 | README install, report, demonstration, packaging | Fresh install rehearsal; report recommendations supported; 10–12 minute rehearsal |
| W09 | Lead release + independent reviewer | W08 | Reviewed branch/commit, optional hosted preview | Requirements matrix complete; push only to known remote; actual outcome recorded |

## First implementation task brief

W01 should not build every screen. Create the event schema and one scenario fixture first; validate identities, status, missing metrics, currency and replay order. Establish Python/TypeScript contracts and local database launch. Record exact versions and compatibility in an ADR. Then stub a run detail screen that renders final output, producer, verification and evidence from that fixture. Run the contract roundtrip and browser inspection. Hand the frozen interface to W02/W03 before expanding scope.

## Parallel work boundaries

Backend owns schema/migrations and API semantics. Frontend owns rendering/state using generated types. Runtime agent owner owns prompt versions and graph state. Verifier owns review records, not production fixes. Lead resolves contract changes and integrates evidence. Low-cost agents can maintain tables/templates and enumerate test cases; they cannot independently change billing, privacy or ordering rules.

## Change request format

State the new requirement, affected IDs, reason, alternative considered, implementation cost, test impact and whether scope/timing changes. Record acceptance in DECISIONS.md. Avoid silently broadening the MVP into a general SaaS control plane.
