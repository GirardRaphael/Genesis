# Independent A11 logistics planning review

Date: 2026-10-10. Current verdict: **approved as a planning package after correction**. No open blocking planning findings remain. This is not an application approval or evidence of successful experiments. Historical A1 approval does not cover these changes. Approval covers the content hashes recorded below; later material changes require another review.

## Assignment and task record

- Work: W00 independent review of the A11 revision; requirements R01–R19 and U01–U06, with particular focus on R01/R02/R04/R09–R12/R18 and U06.
- Owner: separate logistics verification subagent. The lead reports assigning `gpt-6-astra`, high reasoning, through orchestration; this reviewer cannot independently introspect the resolved runtime model. Required tier: strong independent reviewer under MODEL-POLICY. No model evaluation or benchmark is asserted.
- Owned path: `docs/reviews/logistics-plan-review.md` only. Canonical corrections and ACTION-LOG integration belong to the lead.
- Dependencies: current AGENTS, README, PLAN, REQUIREMENTS, DATA-CONTRACT, LOGISTICS-SPEC, UI-SPEC, VALIDATION, BACKLOG, DISCOVERY, MODEL-POLICY, TOOLS-AND-SKILLS, DECISIONS, logistics research and TASK template; installed Ponytail skill read and applied.
- Acceptance: coherent solver/model boundary, concrete capacity/window/cargo constraints, honest statuses, comparable experiments without future information or coverage bias, separate business/AI accounting, accessible map fallback and preservation of all classroom deliverables.
- Exclusions: application edits, dependency installation, provider calls, source-document extraction, live experiments, map/solver trials, publishing and approval of self-authored canonical changes.
- Initial review baseline: working copy based on HEAD `6568236ab207e98641bf08e4fc559cc3eef2633f`; changes were uncommitted. A commit ID alone does not identify reviewed working-copy content.

## Findings, highest consequence first

| ID | Severity / disposition | Finding and required correction |
|---|---|---|
| L01 | High; resolved | Initial text required the same vehicle state across route policies despite differing routes. LOGISTICS-SPEC section 6 now shares initial data and immutable exogenous event IDs/times/effects, permits independently evolved state, and records per-policy reaction times under the same safe-boundary rule. Section 9 and VALIDATION require a divergent-state fixture. |
| L02 | High; resolved | Initial traffic-agent handoff could expose future events. LOGISTICS-SPEC sections 3/7, PLAN and DATA-CONTRACT now restrict the complete future realization/seed to the simulator/test harness, allow only forecast/revealed events to all roles, and require future-read denial/hidden-marker checks. Active endpoints and as-of replay have the same restriction. |
| L03 | Medium; resolved | Initial rules did not distinguish a checkpoint suffix from the full depot-start plan. LOGISTICS-SPEC section 5 now defines separate initial and residual certificate scopes, preserves past violations and original-mission mandatory failures, and prevents a valid suffix from making the entire day appear compliant. DATA-CONTRACT stores scope/state hashes, UI labels it, and VALIDATION requires the late-prefix/valid-suffix case. |
| L04 | Low; resolved | TOOLS-AND-SKILLS now describes LangGraph as a five-role logistics workflow. |

## Confirmed strengths and coverage

The plan retains five distinct bounded agents and multiple typed tools, all six observatory views plus the map, and the canonical minimum of five scenarios × two logistics policies × two paired seeds = 20 actual multiagent executions. Model tiering is fixed for that comparison; model ablation requires additional executions. Fixtures and replay do not count toward the live-execution requirement.

Directed road matrices, unreachable arcs, parcel capacity, service-start windows, service/waiting time and return-to-depot shift time are explicit. Solver outcomes, independent feasibility, simulated outcomes and explanation quality are separate. No candidate does not prove infeasibility or optimality. Independent validation recomputes constraints without accepting solver totals or model confidence as proof.

Completed work/current-leg commitment, onboard cargo ownership, no roadside transfer, depot loading for new orders and one replan are explicit. Candidate admission preserves mandatory service and objective comparability; full-service paired results and all-run coverage/failure results are both required. Operating cost, artificial penalties, API spend and optional estimated emissions are separate. Road data and geometry are cached with provenance; offline/table/WebGL fallback and attribution are explicit.

The backlog provides bounded ownership, dependency gates and an initial tiny deterministic instance. Discovery labels customer/value/pricing assumptions as hypotheses and preserves the eight questions and weighted framework. No application implementation, paid runs, measured commercial savings or deployment is claimed.

## Performed checks and limitations

- Read the files listed in the task record using PowerShell `Get-Content`; read complete current canonical content in bounded calls after larger combined output was truncated.
- Executed `git status --short`, `git diff --stat`, `git rev-parse HEAD`, and `git diff --check`. The whitespace check exited 0; Git emitted LF-to-CRLF notices. These notices are not application test results.
- Inspected the planning revision diff and complete current contracts. The combined diff output was truncated; current-file reads supplied the specification content used for findings.
- Communicated L01–L04 to the canonical owner. Wrote this owned review through `apply_patch`; did not edit the reviewed contracts.
- Executed a PowerShell Markdown local-target check across README, AGENTS and docs: 26 local links checked, zero missing targets, exit 0. This checks target existence, not remote URLs or anchor correctness.
- After corrections, reread LOGISTICS-SPEC and affected contract sections, used `rg` to verify aligned PLAN/DATA-CONTRACT/UI/TOOLS/DECISIONS text, reran `git diff --check` (exit 0), and recorded `Get-FileHash -Algorithm SHA256` results below.
- Final follow-up reviewed the aligned research note and the added stale-state rejection/stepwise simulation clause. Paused checkpoints and zero simulated decision delay are explicit first-demo assumptions; actual agent/solver runtime remains separately measured. VALIDATION adds the corresponding acceptance cases. `git diff --cached --check` exited 0. The three affected hashes below include this follow-up.
- No runtime, dependency, schema, route-solver, UI, browser, secret-scanner, benchmark or external source revalidation was executed by this reviewer. Logistics source retrieval is research-agent evidence, not a check repeated here.

## Reviewed content identity

SHA256 hashes of the reviewed substantive files, before audit-log/review closeout. The review itself and ACTION-LOG are excluded to avoid a self-referential checksum. Historical A1 notes remain provenance only.

| File | SHA256 |
|---|---|
| AGENTS.md | `B836EA4BF2DC1B8AFE1C0E12C1CEE37D0217B6A1C1D1F3F7A71C03109864A80B` |
| README.md | `3F8FC1D9E7BE85B0A289654F170CD5B956A429F1D9EE683CD650B11885D29414` |
| docs/PLAN.md | `5757C5973F46EE92A3CC0195972B636D15DAE366E6327AE908ED240D77491C20` |
| docs/REQUIREMENTS.md | `6D1721DB386DF1AE4FFF3E45BCB7D44FAD16D22E12255AE36578D2C452AB0D65` |
| docs/DATA-CONTRACT.md | `24B58DC999BD40FCFD56BA074E6EB6290409B0FBE30F1F740786CDE28694296C` |
| docs/LOGISTICS-SPEC.md | `CEC166E7D367EC5E641D6AAEAB1D91321385092DB327C44BE272F047923AAE81` |
| docs/UI-SPEC.md | `A2009390C0B90A421369D64047C4EB3A5433F72B1F11079137463DD1B7A39D8F` |
| docs/VALIDATION.md | `59CB30BE9D03D31E7BC704E2B026CC2F6DF7A9EA5B33F3E33A6FAC0A241A9AC6` |
| docs/BACKLOG.md | `3BF4591D4156862BB0CF9F94BD098A9F32DDE5294834A9F4CB10E01031A83189` |
| docs/DISCOVERY.md | `94889607B9BC41913D286532C852246591C5D960ADFA2783981BEC437D7B1844` |
| docs/MODEL-POLICY.md | `BCA0E483C50C8E6D7330EC40A3C3780BC2329059B2EE35CFF4F84A47487093E6` |
| docs/TOOLS-AND-SKILLS.md | `4ABFE40316C30FF6DE542E271420B8AE24AAFB9636C9C2C666E7AF9CEF0B7006` |
| docs/DECISIONS.md | `041D1CAB1A19F77C4E3F4A5B96D2A4BBD681F518CC5902A5FF8FA994B3E3B719` |
| docs/research/logistics-research.md | `57C021C4AAAE815AE277F179F1177234FE6BC71FF912B38DF7ADD42706E0E4E8` |

Next action: lead records the independent review in ACTION-LOG and performs final staged-path/secret checks before committing. Runtime compatibility, lawful first-fixture provenance and the implementation acceptance suite remain W01 onward; this approval does not mark them complete. Publishing still requires an actual configured remote, and paid runs require credentials, model availability and budget.
