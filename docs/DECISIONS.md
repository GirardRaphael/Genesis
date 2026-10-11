# Decision and risk register

Decisions are dated 2026-10-10 and remain implementation proposals unless explicitly marked completed.

| ID | Decision | Reason | Revisit trigger |
|---|---|---|---|
| D01 | Historical A1 selection superseded by D14 | Initial lead proposal; user later selected A11 | Retained for provenance only |
| D02 | Advanced LangGraph/Langfuse/React Flow/ECharts path | Original UI and complete graph/temporal analysis | Integration spike fails delivery envelope |
| D03 | PostgreSQL events authoritative; Langfuse secondary | Replay correctness and independence from exporter outage | Measured throughput/fan-out exceeds tested limits |
| D04 | Historical four-role A1 proposal superseded by D15 | Current A11 maps course functions to five meaningful logistics roles | Retained for provenance only |
| D05 | Separate durable worker; bounded tools and budgets | Recovery and predictable spending | Measured queue/worker requirements warrant maintained queue |
| D06 | Output/evidence inspector central | Primary user need is understanding usable agent work | Usability evidence indicates different navigation |
| D07 | Minimum 20, target 50 balanced runs | Meet brief and provide more informative comparison | Budget/precision analysis |
| D08 | Ponytail skill-only pinned install completed | User explicitly required it; reviewed instruction surface | Reviewed upstream update provides concrete benefit |
| D09 | Local-first, no compulsory hosted SaaS | Source accepts local app; no configured hosting/credentials | User requests hosting or delivery needs it |
| D10 | Markdown planning package | Readable by humans and future AI; easy to version/review | User requests a Word/PDF copy |
| D11 | Atomic reservation before every billable dispatch | Concurrent calls and uncertain retries must not spend the same remaining allowance | Provider pricing/billing model changes; reserve/settle adapter reevaluation |
| D12 | Two-column sender/receiver Sankey | Message fan-out invalidates through-agent conservation; each observed handoff is counted once | A separately specified conserved quantity becomes useful |
| D13 | Explicit eight-question discovery and weighted selection | Annex B evidence must not be replaced by assumed commercial demand | Interviews, topic approval and evidence-backed scoring completed |
| D14 | User-selected A11 delivery/logistics observatory | User explicitly chose the domain; operational map and constraints provide meaningful visualization | User direction or approved course-scope change |
| D15 | Five roles: planning/traffic/optimization/monitoring/exception | A11 roles map coordinator/researcher/analyst/verifier; exception has bounded replan/no-action output | Measured redundancy; retain course minimum functions |
| D16 | OR-Tools routes; independent validator; OSRM matrices; MapLibre map | Models coordinate/explain, deterministic tools establish feasibility | Compatibility spike or measured solver limitation |
| D17 | Single depot, 3–5 vans, 25–50 synthetic stops | Protect advanced project's two-person feasibility and privacy | W01 timing/resource evidence |
| D18 | Traffic simulation and actual agent traces use separate clocks | Prevent simulated road time from being mistaken for agent latency or real traffic | Genuine live-data integration with a new contract |
| D19 | Logistics policy comparison with fixed model tiering | Avoid confusing route gains with model-policy changes | Separate additional controlled model ablation |
| D20 | Cargo locked to carrier; no roadside rescue in MVP | Replanning indices cannot move physical parcels | Explicit depot/reload/transfer model extension |
| D21 | Private future events; shared exogenous schedule, independent evolved states | Avoid oracle leakage and impossible equality of vehicle positions across policies | Explicit forecast-policy experiment |
| D22 | Initial vs residual certificates; historical violations retained | A suffix begins at a checkpoint and cannot undo past lateness/missing cargo | New whole-day compliance contract |
| D23 | GitHub destination resolved and initial push completed | User supplied GirardRaphael/Genesis; origin configured; reviewed branch published with ordinary push | User changes destination; future pushes use same authorized remote |
| D24 | Implemented SQLite local profile; PostgreSQL configurable | Docker daemon unavailable; source permits SQLite; local queue/lease/budget/recovery tests pass | Running PostgreSQL integration and production deployment required |
| D25 | User-selected Anthropic after OpenAI rate-limit failures | User removed OpenAI key; only Anthropic execution enabled, preserving the persistent C$100 budget and prior attempts; no silent provider fallback | User explicitly changes provider; new runs freeze provider/model policy |
| D26 | Overall ledger cost plus leaf attempt usage | User requested global, agent/model and individual operation metering | Higher-scale SQL projections and longer-history benchmarks |
| D27 | Native browser-test entry for projected Windows files | Modified test file appeared as symlink and discovery skipped it; direct import bridge restores five-case discovery without altering cases | Ordinary checkout/CI still uses the explicit single entry |


| D28 | Anthropic-only application execution | User explicitly removed OpenAI execution; historical failed attempts remain inspectable and budget stays shared | User explicitly selects another provider with verified rates |
| D29 | Power BI-style analytics in the custom dashboard | User requested KPI/graph/donut exploration; reuse ECharts and common filtered API cohorts | Broader warehouse/reporting needs demonstrated |
| D30 | Keyless Montréal dispatch with open road map/address/routing providers | User declined Google billing/API setup; OpenFreeMap/Photon/OSRM are replaceable and the local prototype separates real street geometry, declared worksites and simulated vehicles | Commercial deployment requires owned geocoding/routing, authentication, driver tracking and SLA evidence |
| D31 | Implemented local one-per-budget email queue with a separate SMTP worker (U13) | Preserve transactional budget evidence and delivery state without blocking model work or adding a provider dependency | Verified external mail service, a new budget lifecycle, supported recovery/reset requirements or a measured need for another transport |

## ADR D31 — budget email, 2026-10-10

Store one immutable logical alert per persistent project budget in a dedicated database table. Capture it with the budget transition or global refusal, then send outside the transaction through an independent worker thread. Reuse Python's SMTP/EmailMessage standard library with verified TLS and private environment settings; no new mail account, dependency or trace-export coupling is required.

Allow at most three known pre-DATA attempts. Ambiguous DATA, lost sending claims and crashes after acceptance become terminal uncertain with no automatic resend. SMTP acceptance is distinct from inbox receipt. Do not add a reset/resend operation in this release: a reviewed recovery transition is required before retrying terminal states. The cost panel reads status independently so transport/status failures cannot stall the budget display. See BUDGET-EMAIL.md for contracts, configuration and limitations.

## ADR D32 — bounded interface completion, 2026-10-11

Use the existing React components, native controls and read projections for operator polish. Keep per-call monitoring behind a native overview disclosure and fully visible in the observatory; global costs and alert state remain independent of filters. Export one local typed CSV with explicit scope/coverage instead of adding a reporting service. Stop inspection is a UI selection over existing trip data, never a substitute for broker certification. No extra dependencies, artificial KPI trends or new operational authority are needed.

Browser policy rejected the live-page inspection. Continue static-render/logic/build and independent source review without another automation surface; publish the bounded source improvement with that verification limitation. Current visual/browser acceptance remains open rather than reusing old screenshots as proof of this render.

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
| GitHub destination previously missing, now resolved | Initial publication was blocked | User supplied GirardRaphael/Genesis; origin configured and normal push succeeded; preserve history |
| Invalid route explained convincingly | Wrong dispatch proposal | Independent capacity/windows/visits/return/cargo certificate; model cannot override |
| Cheaper by skipping deliveries | False savings | Required/optional coverage beside metrics; comparable service cohort; penalties excluded from money |
| Simulated traffic or emissions claimed real | Misleading commercial/environmental evidence | Explicit simulated/estimated labels, factor/source coverage and separate clocks |
| External map/routing outages | Broken demo/reproducibility | Cached matrices/geometry, packaged background and route-table fallback |
| Solver timeout presented as infeasible/optimal | Wrong conclusion | Separate actual search status and independent feasibility; no unsupported proof claims |

## Outstanding external inputs

Anthropic API access and the C$100 cap were configured; 20 live experiments completed. Classroom approval is needed to claim the academic topic is approved. GitHub destination is established from the user's URL and the reviewed planning branch is published. No guessed identities, budgets, URLs or fabricated approvals have been inserted. All other plan work can proceed from these defaults.
### D33 — Three operator workspaces

On 2026-10-11 the user rejected redundant primary pages. Keep Opérations, Analytique and Agents as the only main destinations, open Opérations by default, and move existing execution projections into the Agents context selector. Preserve all explicit historical query URLs, run selections and filters. Remove duplicate cohort/global reporting from execution pages; Analytique owns aggregate charts, global cost and budget-email status. Individual run metering remains in Agents. This avoids deleting evidence or replacing the routing contract solely to simplify navigation. Browser acceptance remains pending a user reload from the MCP-blocked data: error page.

### D34 — Selected addresses follow the strict Place contract

U16 removes geocoder metadata at the shared address-selection boundary, retaining only label and coordinates for pickup, drop-off and depot. Keep the API's unknown-field rejection: ignoring arbitrary extra input would hide the client mismatch. QA geocoder results include IDs so the preview, manual and broker request checks exercise the real provider shape. This changes no backend schema, routing algorithm, model policy or persisted history.
