# Independent U14 interface review

Status: **approved for the bounded local source implementation below; rendered browser acceptance remains open**. Date: 2026-10-11. Base: `e8eb34d247c7db69e886ac1cf502ac63d28ec946`. No unresolved blocking finding in this U14 scope. This is not a commercial-readiness or WCAG certification.

Independent reviewer: separate `budget_email_verifier` Codex context, assigned `gpt-6-astra` / high by the lead; runtime model identity is not independently exposed. This context owns no implementation files and changed only this report and its manifest.

## Task record and reviewed tree

- Work/requirements: U14 interface refinement and three-workspace consolidation; U02–U05 review/documentation; U07 cost/null/currency truth; U08 analytics; U09/U12 dispatch selection; R07–R12 interaction, visualization and accessible alternatives; R18 confidentiality.
- Owned paths: this review and `docs/reviews/interface-manifest.json`. Source/tests belong to implementation owners; the lead owns contracts, ACTION-LOG, integrated evidence and publication.
- Dependencies read: AGENTS, README, PLAN, REQUIREMENTS, DATA-CONTRACT, LOGISTICS-SPEC, MODEL-POLICY, UI-SPEC, U14 interface/analytics/dispatch work records, existing API projections and the UI diff. Applied the reviewed Ponytail skill and React best-practices checklist.
- Acceptance: three named main destinations retain historical links and selected evidence; visible/removable filters preserve unrelated selection; URL history stays usable; Montréal timezone is explicit; inventory/export scope matches data; missing costs/durations stay missing; replay retains its boundary; CSV text cannot become spreadsheet formulas; stable trip/stop selection clears when hidden/removed; native list controls remain available without the map.
- Exclusions: source edits, backend migration, provider/email calls, `.env` or operator-database access, commits/pushes, and live browser/UI automation. U15 presentation work (`presentations/**` and `docs/work/U15-technical-presentation.md`) is explicitly outside this approval.

The [normalized-LF manifest](interface-manifest.json) records **27 material files**: changed and nonignored untracked U14 source, tests, contracts, README and three work records relative to the base. Aggregate SHA-256: `9e72c9be00c5844bb9a4fcfad5471f7a5670390c63edd0b6c053d58d638bccbc`. Each file is decoded as UTF-8, CRLF/CR normalized to LF, and SHA-256 hashed; the aggregate hashes sorted `path + NUL + lowercase file hash + LF` records. Review artifacts, ACTION-LOG, IMPLEMENTATION-STATUS and the named U15 paths are excluded. Material changes invalidate the relevant approval. Publication metadata was read separately for truthful scope and evidence attribution.

## Findings resolved before approval

1. **P2 — analytics timezone.** The freshness label initially used the viewer's implicit browser timezone. The final formatter specifies `America/Toronto` and visibly qualifies Montréal; export timestamps remain explicitly UTC.
2. **P2 — zero-call execution scope.** Initial CSV metadata implied every matching execution contained a matching model call, but server filtering also matches agent invocations, including demonstrations/omissions with zero calls. Final metadata distinguishes invocations/attempts from calls, with a zero-call regression case. Exact-decimal claims are limited to API cost strings; the reused mean fleet-cost projection is numeric.
3. **P2 — inventory count consistency.** Initial rows and total came from different endpoint responses. Final `runTotal` is stored from the same `/runs` response as its `items`, avoiding that cross-response count mismatch.
4. **P3 — comparison placeholder.** Selecting an enabled empty option immediately fell back to an automatic selection. The final placeholder is disabled, and explicit selected IDs outside the current cohort remain represented by labeled options.

The first source freeze was revoked when the user requested fewer primary tabs. Its 39-test result and earlier manifest were superseded, not used to approve final navigation. The lead then froze the consolidated tree and the affected checks below were rerun.

## Source assessment

The shell exposes exactly Opérations, Analytique and Agents. Default/unknown routes and the brand lead to dispatch; all explicit legacy view values remain accepted. Overview, fleet, history, comparison and observatory each activate Agents and retain their selected native context option. Navigation updates preserve run/comparison IDs and filters. History mutations occur outside React state-updater callbacks, with typed model/search changes replacing rather than growing history. Active filter controls escape external labels and distinguish local inventory search from server filters.

Global budget/alert status and aggregate reporting now live in Analytique; execution views keep per-run evidence without duplicate cohort panels. Global-cost polling remains independent of its filters and mail status. Native overview metering disclosure still passes the replay sequence boundary. Comparison candidates require matching scenario/seed/provenance and exclude broker workflows; unavailable money/duration remains unavailable.

Analytics guards snapshots by query and abort state, hides wrong-query data, marks retained same-query data stale, and disables export until a matching snapshot exists. CSV metadata describes three separate reads, whole-cohort usage versus newest-200 summaries, coverage and receipt/export times. Quoting, embedded newlines, BOM/CRLF and formula-prefix neutralization cover untrusted text. API decimal strings, zero/missing distinctions and USD/CAD units are retained; individual addresses, full model outputs and private inspection fields are omitted.

Dispatch resolves `(tripId, stopId)` against visible current routes and clears hidden/removed selections. Native schedule buttons expose pressed state, paired-stop navigation and stored evidence. Map marker reconciliation keeps marker elements and MapLibre classes; ordinary polling does not repeatedly recenter. Simulation, ETA provenance and unavailable constraints remain explicit. These are source findings, not claims that live WebGL, focus or scrolling has been observed.

Styles supply compact navigation names, labeled narrow navigation, wrapping controls, explicit focus treatments, readable labels and reduced-motion handling where applicable. README, contracts, D32/D33, UI specification and work records describe the bounded implementation and preserve operational release gates. Existing API/budget/provider contracts and dependencies remain unchanged.

## Verification evidence

Independently executed after the final freeze:

- `npm.cmd test -- src/state.test.ts src/WorkspaceControls.test.tsx src/analyticsData.test.ts src/analyticsExport.test.ts src/dispatchSelection.test.ts src/dispatchView.test.ts src/replayState.test.tsx`: **41 passed across 7 files**, 1.50 seconds.
- `npm.cmd run build`: TypeScript and Vite passed; **2520 modules**, Vite 5.91 seconds. Existing map/chart chunk-size advisory remains.
- Normalized file hashes matched the final manifest; `git diff --check` passed.

Lead-reported supporting evidence, distinguished from independent execution: all **60 frontend tests across 9 files** passed (1.37 seconds), build passed (5.90 seconds), and **8 isolated usage/dispatch API cases** passed (7.75 seconds). No redundant full backend run was performed by this reviewer. Browser regression selectors were inspected as source, not executed. Historical screenshots are reference only. A review-document patch attempt was rejected because it targeted the same path twice; no file changed in that failed attempt, and the report was then written normally.

## Remaining limits

Browser MCP rejected the live-page operation; no alternate browser, Playwright/CDP, indirect renderer or policy workaround was attempted by this reviewer. The lead reports restoring Vite after diagnosing a stopped web server and an unsupported browser error-page URL; this does not establish browser acceptance. New rendered layout/reflow/contrast, actual keyboard and MapLibre focus, and CSV download delivery remain unverified. The explicit visual/operational gates in TRANSPORT-CHECKLIST remain open. This review approves only the recorded U14 source scope, not U15 slides or future visual claims.
