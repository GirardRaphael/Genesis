# Executable work packages

Every task uses docs/templates/TASK.md. The owner records the actual model and command evidence. Effort estimates in PLAN.md apply to the whole implementation, not guarantees per task. No work package below is claimed implemented.

| ID | Owner tier | Dependencies | Owned deliverable | Acceptance / done |
|---|---|---|---|---|
| W00 | Lead/product researcher + independent frontier reviewer | None | Plan, source matrix, skills register, design direction, DISCOVERY.md eight answers and weighted matrix | No unresolved planning blockers; source requirements mapped; Ponytail evidence retained; discovery answers labeled evidence/hypothesis, first fixture provenance recorded before implementation; interviews/scoring required before commercial claims |
| W01 | Strong backend/solver + normal frontend | W00 | Locked stack; domain/event contracts; tiny road matrix and hand-checked route; independent validator; migrations | Capacity/windows/return fixtures pass; solver status honest; offline map/table; runtime/memory baseline recorded |
| W02 | Strong workflow implementer | W01 | Five agents, prompts, typed matrix/solver/validator/simulation tools | Actual mission exercises distinct roles and meaningful exception/no-action output; no free-form execution |
| W03 | Workhorse UI/API implementers with disjoint paths | W01 | Fleet/run inventory, stored plan/geometry API, map/visit/output inspector | UI -> API -> DB -> certificate/output path; stable version selection and shared cohorts |
| W04 | Strong reliability implementer | W02 | Durable claims/checkpoints, event/outbox/SSE, retries/budgets/cancel, atomic cost reservation/settlement | Restart/disconnect and concurrent-budget cases; duplicate handling; unresolved usage holds funds; Langfuse correlation |
| W05 | Strong UI designer/implementer | W03; W04 for live state | Map plus six charts, fleet/AI cost separation, dual-clock replay, compare, component states | Stored plan/stop linkage, WebGL fallback, all required charts, coverage/units visible and visual review |
| W06 | Independent verifier + workhorse fixes | W04 + W05 | Test suite, CI, review and performance records | Required flows and failure fixtures pass; no blocking review findings; secret scan clean |
| W07 | Analysis lead + separate runtime judge | W06 | 20 minimum actual agent runs, paired logistics policies/seeds, matrix/event manifests | Five scenarios; fixed model policy; feasible/diagnostic distinction; service/coverage/paired outcomes; all ten questions with limits |
| W08 | Economy documentation + strong evidence reviewer | W07 | README install, report, demonstration, packaging | Fresh install rehearsal; report recommendations supported; 10–12 minute rehearsal |
| W09 | Lead release + independent reviewer | W08 | Reviewed branch/commit, optional hosted preview | Requirements matrix complete; push only to known remote; actual outcome recorded |

## First implementation task brief

W01 starts with a hand-checkable depot/two-vehicle/six-stop instance, asymmetric travel matrix, capacity/time/return constraints, deterministic baseline and independent validator. Test tiny boundaries before 25–50-stop scenarios. Pin OR-Tools/OSRM/map compatibility and state/metric contracts. Create stored geometry or visibly schematic fixture paths, the visit table and certificate/output view. Prove offline operation, contract roundtrip and browser inspection, then freeze interfaces for W02/W03. Research/API secrets are not needed for the deterministic spike.

## Parallel work boundaries

Backend owns schema/migrations and API semantics. Solver owner owns constraints, directed matrices, objective and independent-check integration. Frontend owns rendering with generated types. Agent owner owns prompts/graph state. Verifier owns review records, not fixes. Shared contracts require lead integration. Low-cost agents maintain bounded tables/templates and test inventories; strong models handle feasibility, physical cargo, concurrency, money and reviews.

## Change request format

State the new requirement, affected IDs, reason, alternative considered, implementation cost, test impact and whether scope/timing changes. Record acceptance in DECISIONS.md. Avoid silently broadening the MVP into a general SaaS control plane.
