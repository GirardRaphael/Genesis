# U14 — operator interface refinement

Date: 2026-10-11. Requirements: R03, R08–R12, U02–U05, U07–U09, U12, U14.

## Assignment and boundaries

The lead owns App.tsx, style.css, state.ts/state.test.ts, new WorkspaceControls.tsx/WorkspaceControls.test.tsx, qa/tests/observatory.spec.ts, shared documentation and final integration. The analytics owner owns Analytics.tsx/Analytics.css and its export helper/tests. The dispatch owner owns Dispatch.tsx/Dispatch.css/DispatchMap.tsx and its selection helper/tests. Individual task records describe those packages. A separate reviewer may not approve its own implementation.

Purpose: make the current French operator workspace more readable and actionable. Deliver visible removable filters, named responsive navigation, correct Montréal timezone, honest inventory scope, clearer overview controls, linked delivery-stop details and a local analytics export. Preserve existing budget, provider, routing, cargo, replay and privacy contracts. No backend migration, paid calls, email test, production deployment or simulated-to-real claim.

Dependencies: existing React/Lucide/ECharts/MapLibre dependencies, versioned API projections and established local prototype. Ponytail: reuse controls/data and implement bounded changes. Lead model identifier is not exposed; delegated bounded audit uses gpt-6-luna/medium, UI work gpt-6.1-sol/high, independent review gpt-6-astra/high.

## Acceptance

Latest user steering: consolidate the seven primary pages into three workspaces, Opérations, Analytique and Agents. Opérations becomes the default and brand destination. Historical execution pages remain inside a named Agents context selector; existing URLs retain their selected run, comparison and filters. Remove repeated cohort dashboards from execution views so global reporting belongs to Analytique. Lead also owns navigation-related QA selector updates in qa/tests/budget.browser.spec.ts. Verify browser through MCP after the user reloads the stale browser error page; never weaken its URL policy.

- Active filters remain visible when their editor is closed, individual removal preserves unrelated selections, and search avoids per-character history entries.
- Navigation has accessible names even when compact. Mobile styling keeps labels and usable targets; no fake dropdowns. Timezone formatting handles Montréal winter and summer.
- Selected delivery stop, map marker and current trip stay consistent after refresh/filter changes. Existing constraints and simulation labels remain truthful.
- CSV uses only the loaded analytics data and states scope, currencies, completeness, timestamps and missing values. Spreadsheet formulas are neutralized.
- Targeted logic/render tests, all frontend tests, TypeScript build, relevant existing API contract tests, complete diff review and independent approval before normal Git push.

## Verification limit

MCP inventory identified the stopped web server and unsupported data: browser error page. The web server was restored on 127.0.0.1:5173; the API listener was left intact. MCP still rejects navigating from the error page, so the user was asked to reload it. No alternate browser or indirect automation was used. Existing historical screenshots inform layout decisions but are not evidence of the new render.

## Outcome

Implemented with existing dependencies: three primary workspaces, an Agents context selector preserving old deep links, consolidated global reporting in Analytique, darker navigation rail and readable responsive controls; visible removable filters; DST-aware Montréal offset; native per-call disclosure; same-response inventory total; comparable-only default pair; missing cost/duration preserved; linked stop details and local scoped analytics CSV. Browser regression selectors follow the new context selector and budget view; they were updated but not executed under the current policy.

Lead checks: after navigation consolidation, frontend `npm test` passed 60 tests across 9 files (1.37s), TypeScript/Vite production build passed (5.90s, 2520 modules). Existing map/chart chunks remain above the 500kB warning threshold. Targeted isolated API tests `test_overall_usage.py` and `test_dispatch.py` passed 8 cases (7.75s). No production ledger/fleet mutation, paid model request or external email was required. Earlier 57/58-test evidence predates navigation consolidation; the affected final web suite was rerun.

Review corrections included explicit Montréal timestamps in analytics, invocation-versus-call CSV scope, inventory count from the same `/runs` response, and a disabled comparison placeholder. The lead also removed history side effects from React state-updater callbacks and preserved missing numeric comparison values. Independent final review is recorded separately in reviews/interface-review.md.

Remaining verification: new rendered layout, true browser focus/reflow/contrast, MapLibre interactions and downloaded-file delivery are untested this turn. Historical screenshots were viewed only as baseline design reference. No claim of visual acceptance or company readiness follows from these tests. See TRANSPORT-CHECKLIST.md for operational gates and the remaining inventory pagination/dispatcher-usability work.
