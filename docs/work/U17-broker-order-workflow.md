# U17 — Durable broker intake and economical planning

Date: 2026-10-11. User authorization: implement the prioritized broker usefulness changes.

## Scope and acceptance

Requirements: U17 (broker workflow), U02 documentation, U03 tiered delegation, U04 honest UI, U05 independent review and publication, R02 deterministic tools, R05 truthful evidence, R18 confidentiality. Existing requirement IDs retain their original meaning; this work-package identifier is not a replacement for those requirements.

Deliver a local operator slice: persistent orders with customer/reference/date, validated CSV intake, searchable backlog, selection into the existing certified multi-vehicle planner, no mandatory model calls, and explicit review before starting simulated trips. Preserve addresses and orders across reloads through server persistence. Prevent duplicate references and concurrent planning of an order. Never convert simulated completion into proof of real delivery.

## Shared contract

- Order: `id`, `reference` (1..64), `customer` (0..120), `service_date` (ISO date or null; organizational only, not a solver time window), `pickup`, `dropoff` (strict existing Place), `parcels` (1..40), `deadline_minutes` (1..480), `version`, timestamps, `status`, `plan_id` (nullable). Reference uniqueness is trimmed/case-insensitive. Status is `open`, `planning`, `planned`, or `cancelled`; planned means attached to a proposal, never delivered.
- `GET /api/v1/orders`: bounded list `{items,total}` with search `q`, optional status; return actionable states derived from linked plan. Failed/diagnostic plans release orders safely for retry. Completed simulations do not release orders for duplicate dispatch.
- `POST /api/v1/orders/batch`: `{items:[order input...]}` (1..10), atomic/idempotent by normalized reference + identical content; conflicting reference returns 409; no partial write.
- `POST /api/v1/orders/import/preview`: `{csv:string}` (bounded by existing 16 KiB HTTP limit), returns `{items:[valid order inputs],errors:[{row,field,message}]}`. Header: `reference,customer,service_date,pickup_label,pickup_longitude,pickup_latitude,dropoff_label,dropoff_longitude,dropoff_latitude,parcels,deadline_minutes`. Max 10 rows per import. Coordinates are required; no ambiguous automatic address resolution. Preview does not persist; commit through batch only when no errors. UTF-8/BOM and quoted commas accepted, reject unknown/missing/duplicate columns and malformed rows. Never execute spreadsheet formulas.
- `POST /api/v1/orders/{id}/cancel`: `{version}`; open only, optimistic conflict, idempotent same resulting state. Retain record rather than delete.
- BrokerRequest gains optional `order_ids` (1..10 unique when supplied). Every selected delivery must match authoritative orders including stable `id=order.id`; no mixing arbitrary deliveries with tracked orders. Creating the run and claiming orders must be one transaction; same idempotency key returns same run; competing key cannot claim an active order. Existing untracked requests remain compatible.
- BrokerRequest `explanation_policy` adds `none`. Default operator UI uses `mode=live, explanation_policy=none`; this means real road tools and solver without a model, explicitly labeled deterministic planning (not live traffic/driver evidence). No Anthropic key/model validation or billing reservations for `none`. Existing `always`, `routine`, and fixture behavior retained. Five deterministic roles still produce durations/tool evidence, tokens/cost remain inapplicable with an explicit reason. No fabricated usage.
- Created trips remain `ready`. Human review/start is explicit and simulation-labeled; no autonomous driver contact.

## Ownership

- Backend orders agent: new orders module/tests, `db.py`, `broker_api.py`, and later `dispatch.py` safe proposal-cancellation reconciliation. Parent registers module in `api.py`. Backend agent implements API `none` gating and coordinates with runtime agent.
- Runtime/UI planning agent: `broker_runtime.py`, `workflow.py` if needed, `BrokerPlanning.tsx`, `BrokerPlanning.css`, `dispatchTypes.ts`, dedicated tests. Add optional `orderIds?: string[]` prop, serialize as `order_ids` only when supplied. Parent owns Dispatch integration.
- Order-board UI agent: new `OrderBoard.tsx`, CSS, helper/types and tests only. Props `draft: BrokerDelivery[]`, `onSelectOrders: (orders: BrokerOrder[]) => void`, optional `refreshKey?: number`. Save current draft with editable per-row reference/customer/date, preview imports then commit, search/filter/select open orders, explicit cancel, selected orders to planner. Export shared BrokerOrder type from order module. No direct Dispatch edits.
- Parent: Dispatch/App integration, API registration/detail labeling, docs and QA integration; independent verifier after implementations complete.

## Checks and exclusions

Required: atomic duplicate/import behavior, restart persistence, concurrent order claim, failed-plan release, immutable order payload check, no-provider deterministic full workflow, all five roles plus certificate/ready trips, frontend typecheck/tests/build, browser MCP if permitted, independent source review. Use temporary DBs and mock roads for destructive/integration tests. No live model spending required.

Not this release: authentication/tenancy, real GPS/POD, driver mobile app, external carrier tendering/invoicing, editable heavy-truck fleet, physical cargo recovery, production routing SLA. Those remain release gates for real transport operations. Do not describe this local slice as a production TMS.

## Execution and review evidence

- Implementers: backend/order concurrency assigned gpt-6-astra/high; runtime/planner and order-board interface separately assigned gpt-6.1-sol/high; lead owns integration, feedback, docs and QA selectors. Independent gpt-6-astra/high reviewer owns the review record. A bounded gpt-6-luna/medium inventory verifies preservation of required technologies and evidence.
- Full Python suite: 187 passed, 3 existing SWIG warnings, 155.89 s. Collected before the last review regression additions; independent final affected suite covers 40 tests, including cancellation-before-finalization and deterministic failure metadata. Runtime omission checks also pass without keys/budgets/model constructor access.
- Frontend: 74 tests in 12 files; TypeScript/production build passes with existing large MapLibre/ECharts chunk warnings. Ruff on affected Python and diff whitespace checks pass. Five route browser cases parse via test discovery; their selectors are updated for the new collapsed optional settings/default.
- Review fixes: preserve intake reference/customer/date across edits/removals and return from saved-order selection; retain submission errors across background refreshes; do not attach requested Anthropic model IDs to deterministic tool failures; reopen entirely cancelled/unstarted proposals even when cancellation races finalization. Failed network/model costs remain governed by the original ledger.
- User reminder was checked against source DOCX: advanced architecture explicitly lists LangGraph/Langfuse/React Flow/Apache ECharts; minimum four roles and 20 executions/five scenarios remain in scope. U17 retains five roles, all six visuals, benchmark artifacts and deck. No tool-only broker run is offered as replacement live experiment evidence. External Langfuse/PostgreSQL stay unverified.
- Browser MCP successfully inspected current user tab 4. Vite later had no listening 5173 process; automatic approval review rejected the attempted hidden background restart as blocked by policy. No alternate browser/launch bypass was used. New UI clicks and screenshot acceptance remain pending user startup. API OpenAPI confirms orders and none policy loaded. The idle worker's exact workspace command/PIDs and zero queued/running jobs were verified before stopping it to avoid stale-code execution. User was given web/worker startup commands; no credentials or private input were emitted.
- Current OSRM operator summary verified at https://routing.openstreetmap.de/about.html. Corrected docs/DISPATCH.md: the wiki's commercial/paywall restrictions refer to the previous demo server. Current summary names one-request-per-second maximum, attribution/user-agent and no heavy use; no full legal-policy approval is inferred.

## Startup and bounded browser acceptance — 2026-10-11

The user explicitly replied to both outstanding startup prompts with instructions to start the services. The lead then successfully launched the web server and updated worker in hidden processes, retaining the already-running loopback API. Vite listens on 5173; proxied API health returns `ok`, and OpenAPI exposes orders and the `none` explanation policy. A separate gpt-6-luna/medium startup checker independently confirmed HTTP 200 and the live worker process. The lead verified both new error logs were empty. This supersedes the prior startup blocker; no approval bypass, service reseed or private environment inspection was used.

Browser testing used the existing working Codex in-app tab through MCP. No alternate browser automation was used. Public demonstration places and clearly marked `QA-U17-20261011-A/B` references were the only new inputs:

1. Save the two example pickup/drop-off pairs with references and a QA customer label; repeat the save and reload. Exactly two persistent orders remain.
2. Select both orders into the linked/read-only planner; search and select the actual geocoder result for Gare Centrale as the assumed depot. Only the already-free V3 is eligible; existing occupied/cargo-held vans stay untouched.
3. Submit the default deterministic plan. Run `98999e54-c134-49fe-a3f5-dca595bcb356` completes with an independent valid certificate, one ready four-stop V3 trip, 15.3 km and approximately 42 minutes. Estimated fleet cost is C$52.02, separate from API cost. Shared and single-van candidates pass; the split candidate explains its insufficient eligible fleet. No trip starts automatically.
4. Open technical details: all five roles complete, with displayed durations of 60, 945, 4,071, 37 and 31 ms. Each explicitly omits the model explanation and marks tokens/API cost inapplicable. Browser console error retrieval is empty for this check.
5. Cancel only this unstarted QA proposal. Both orders return to `open` with no plan ID and V3 becomes available. Cancel the two QA orders individually through their confirmation controls, retaining their history; return to freeform entry. No existing trip, vehicle cargo or customer order is changed.

The overall ledger remains **135 model calls / US$0.8164889**, equal to the pre-check baseline. No paid generation, email, budget reset or real driver operation occurred. Local screenshot evidence is `data/u17-browser-verified.jpg` (ignored, public QA data only); it captures the ready proposal and all five role durations before cancellation. Source code is unchanged from reviewed commit `31df373`.

Limits: this is a successful saved-order-to-proposal/rejection browser journey, not the full browser suite. It does not cover CSV file upload, started-trip completion, comprehensive keyboard/mobile/accessibility checks, PostgreSQL, external Langfuse, licensed routing availability or real carrier operations. Earlier source/test approval remains scoped as recorded by the independent reviewer.
