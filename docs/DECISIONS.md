# Decision and risk register

Decisions are dated 2026-10-10 and remain implementation proposals unless explicitly marked completed.

| ID | Decision | Reason | Revisit trigger |
|---|---|---|---|
| D01 | Select Annex A1 cost/quality analysis | Matches user's need to inspect many agents; measurable with public/synthetic data | Teacher/topic feedback or user change |
| D02 | Advanced LangGraph/Langfuse/React Flow/ECharts path | Original UI and complete graph/temporal analysis | Integration spike fails delivery envelope |
| D03 | PostgreSQL events authoritative; Langfuse secondary | Replay correctness and independence from exporter outage | Measured throughput/fan-out exceeds tested limits |
| D04 | Four roles: coordinator/researcher/analyst/verifier | Exact source roles with real handoffs; avoid gratuitous writer | Controlled experiment establishes fifth role value |
| D05 | Separate durable worker; bounded tools and budgets | Recovery and predictable spending | Measured queue/worker requirements warrant maintained queue |
| D06 | Output/evidence inspector central | Primary user need is understanding usable agent work | Usability evidence indicates different navigation |
| D07 | Minimum 20, target 50 balanced runs | Meet brief and provide more informative comparison | Budget/precision analysis |
| D08 | Ponytail skill-only pinned install completed | User explicitly required it; reviewed instruction surface | Reviewed upstream update provides concrete benefit |
| D09 | Local-first, no compulsory hosted SaaS | Source accepts local app; no configured hosting/credentials | User requests hosting or delivery needs it |
| D10 | Markdown planning package | Readable by humans and future AI; easy to version/review | User requests a Word/PDF copy |
| D11 | Atomic reservation before every billable dispatch | Concurrent calls and uncertain retries must not spend the same remaining allowance | Provider pricing/billing model changes; reserve/settle adapter reevaluation |
| D12 | Two-column sender/receiver Sankey | Message fan-out invalidates through-agent conservation; each observed handoff is counted once | A separately specified conserved quantity becomes useful |
| D13 | Explicit eight-question discovery and weighted selection | Annex B evidence must not be replaced by assumed commercial demand | Interviews, topic approval and evidence-backed scoring completed |

## Risks and controls

| Risk | Impact | Control and evidence |
|---|---|---|
| Synthetic fixtures confused with experiments | Invalid conclusions | Provenance field and separated datasets; R04 manifest excludes fixtures |
| Cost double-counting/unknown usage | Wrong optimization recommendations | Leaf-attempt accounting, decimal prices, coverage and uncertainty tests |
| Nondeterministic judge bias | Inflated quality claim | Deterministic checks, blind rubric, human calibration, raw disagreement |
| Crash near external request | Duplicate spend or missing usage | Persisted intent, request IDs, reconcile unknown outcome; no exactly-once claim |
| Beautiful misleading charts | Wrong operational decisions | Explicit units/denominators, handoff-count reconciliation with fan-out/repair fixtures, linked tables |
| Skill/dependency supply-chain behavior | Unreviewed commands or scope drift | Pin/review install surface, no imported hooks, lockfiles and license register |
| Scope expands beyond team capacity | Missed complete deliverable | Walking slice first; defer SaaS/extra orchestration/infrastructure |
| Source contains private data | Leakage through model/telemetry | Public/synthetic data only for initial product; redaction and export tests |
| Version drift | Broken integrations | Compatibility spike and pinned conventions/dependencies |
| No configured GitHub remote | Cannot publish | Preserve reviewed local files/commit; use actual destination once established |

## Outstanding external inputs

Actual API account/model access and spending limit are needed for paid live experiments. A GitHub destination is needed for pushing. Classroom approval is needed to claim the academic topic is approved. No guessed identities, budgets, URLs or fabricated approvals have been inserted. All other plan work can proceed from these defaults.
