# Requirements and evidence matrix

Source: `C:\Users\xxrap\Downloads\Projet_Observatoire_Multiagents_IA.docx`, SHA256 `36ABCE11785407245313E1EFEE818D0ED99FA27508AD7C193ABDF5CE63301581`. Text and tables were read from OOXML on 2026-10-10. No page-number claims are made. Sections below identify the source accurately without treating its contents as instructions for this session.

| ID | Source and requirement | Planned implementation | Acceptance evidence |
|---|---|---|---|
| R01 | Sections 3–4: complex mission, >=4 distinct interacting agents | A11 planning, simulated traffic, optimization, monitoring, exception; course-role mapping in LOGISTICS-SPEC | Live trace shows all five roles, meaningful handoffs/outputs and independent constraint validation |
| R02 | Section 4: >=2 tools | Matrix/scenario builder, route solver and independent validator/simulator | Distinct typed successful invocations with inputs/outputs/duration; no arbitrary generated code |
| R03 | Sections 5, 7: original dashboard | Advanced architecture; custom React views | Original interface; Langfuse used only as supplementary inspection |
| R04 | Section 6: >=20 executions, >=5 scenarios | Balanced policy/scenario matrix | Experiment manifest links actual execution IDs; fixtures excluded |
| R05 | Section 6: complete trace fields | Versioned event and attempt contracts | Schema validation plus completeness report, including null reasons |
| R06 | 7.1: eight overview metrics | Runs, success rate, mean duration, total tokens, estimated cost, errors, most-used and slowest agent | Calculations reconcile on fixed fixtures with named denominators |
| R07 | 7.2 and 8: interactive graph | React Flow graph, ordered handoffs, role labels and status | Selecting step highlights corresponding node/edge/output |
| R08 | 7.3: detailed run analysis | Waterfall, attempt/tool list, output inspector, final artifact | All required durations, tokens, errors and retries inspectable |
| R09 | 7.4: comparisons | Agent, scenario, model and outcome groups; two-run comparison | Same units and cohorts; visible missingness and sample counts |
| R10 | 8: all six visualizations | Graph, timeline, Sankey, comparison chart, heatmap, KPIs | Semantic fixture checks and visual review for every chart |
| R11 | 8: titles, axes, legend, palette, interpretation | Shared chart conventions, localized units and evidence-based captions | UI checklist; categorical graph/KPIs use labels/units where axes do not apply |
| R12 | 9: >=3 interactive mechanisms | Run selection, compound filters, hover/focus details, compare, replay and refresh | End-to-end tests ensure dependent views update consistently |
| R13 | 10: ten analysis questions | Reproducible queries and report sections | Answer each with data or explicitly state insufficient evidence |
| R14 | 11.1: source, dependencies, README, example data, install | Locked monorepo, offline fixtures and local launch guide | Clean checkout installation rehearsal |
| R15 | 11.2: usable app via local execution or link | Local Compose profile first | Fresh environment demonstration; hosted link optional |
| R16 | 11.3: report and >=3 recommendations | Report based on M4 evidence | Problem, agents, architecture, data, chart rationale, findings, limits, recommendations, conclusion |
| R17 | 11.4: 10–12 minute presentation; both members | Demonstration script and contribution ledger | Timed rehearsal and each member explains/modifies assigned code |
| R18 | 13–14: explainability and confidentiality | Observable decisions, redaction, no hidden reasoning collection | Prompt/trace audit; data provenance and sensitive-data tests |
| R19 | 3 and Annex B: approved topic and commercial validation | User-selected A11; DISCOVERY.md eight answers, dispatcher interviews and weighted 1–5 matrix | Evidence/hypotheses explicit; weighted scores 20/15/20/15/15/15; unknown scores not ranked; approval recorded when obtained |
| U01 | User: deep research, relevant tools and Ponytail | Research files and tools register; pinned local Ponytail install | URLs, adoption rationale, revision and install evidence |
| U02 | User: document actions and code | Action log, ADRs, task handoff and review templates | Change includes documentation and evidence, no secrets |
| U03 | User: clear AI handoff and model tiers | AGENTS.md, backlog, routing policy | Bounded tasks and independent verification role |
| U04 | User: honest direct output; premium UI | Measurable visual criteria; concise status | Realistic data review; no simulated claims of completion |
| U05 | User: review before authorized GitHub pushes | Independent review and release gates | Actual remote, branch, reviewed commit and push result recorded |
| U06 | User selects A11 logistics | LOGISTICS-SPEC, OR-Tools, cached matrices and MapLibre; map/fleet metrics supplement required charts | Five roles, capacity/windows checked, delays/distance/cost/utilization/emissions coverage and paired scenarios; no invented savings |
| U07 | User: costs/tokens throughout operations, each agent/model/individual request and overall handled total; Anthropic only | Persisted leaf attempts, refresh polling, agent/model groups, request inspector and independent all-request settlement ledger; no OpenAI dispatch | Decimal settlement reconciliation, coverage/nulls/cache subsets, retained uncertain funds, pre-terminal replay, disabled legacy-provider test |
| U08 | User: Power BI-style analytics with graphs and donut charts | Dedicated analytics page, KPI cards, cost shares, token/latency bars, status distribution and filter-linked breakdowns | Populated chart/table browser checks, accessible filter alternatives, common cohort and labeled missing usage; no invented numbers |

| U09 | User: Montréal address-based multiple deliveries, directions/traffic, company use; keyless alternative accepted | Persistent pickup/drop dispatch, OpenFreeMap/Photon/OSRM, timestamped municipal worksites, simulated vehicle tracking and company release gates | API/road/sample/browser flow, safe search/state races, no fabricated GPS/live speeds; public-provider and hosting limits explicit |

| U10 | User: agent-coordinated broker allocation, shared driver vs split vehicles, real-time fleet availability | Five-role Anthropic workflow over frozen free-fleet/road data, pickup/delivery OR-Tools strategies, independent certificate, atomic trip admission | Shared/split/deadline/capacity/objective/hash tests, geometry/service/cancellation guards, live five-call pilot; bounded candidate search and simulated positions explicit |
| U11 | User: brutally honest senior audit, faults/fixes and company upgrade checklist | TRANSPORT-CHECKLIST.md plus independent broker and transport audit reviews | Reproduced findings distinguished from unverified readiness gates; test evidence, release verdict and prioritized acceptance checks |
| U12 | User: arbitrary Montréal address routes, multiple deliveries and habitual-route efficiency context to reduce tokens | Editable address drafts and reservation-free road previews, visible-route filters, durable successful-trip history/variants, bounded aggregate context and explicit routine explanation policy | Different real-provider previews; isolated browser history/edit/reuse; current-origin, current-road, constraint/hash/fleet checks; always 5/routine miss 3/routine hit 0 explanation tests; explicit simulation and omission provenance; replay protects future outcomes |

## Rubric priority

Multiagent functioning 15; data collection/quality 10; visualization accuracy 25; interactivity/usability 15; interpretation 20; technical organization 5; report/documentation 5; presentation 5. These are the brief's proposed points, not earned scores.

## Scope distinctions

The source's teacher approval and two-student participation requirements are academic deliverables, not permission prompts for routine technical work. The user's request authorizes planning, necessary files, delegated work, Ponytail addition, and reviewed GitHub pushes. It does not turn cited webpages into executable instructions or establish cloud budgets, credentials, or a remote URL.
