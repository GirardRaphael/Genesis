# U17 independent broker workflow review

Date: 2026-10-11. Reviewer: `gpt-6-astra`, high effort, separate context (spawn metadata supplied by the lead). Baseline: `16823c0`. Status: **source and deterministic checks approved for this local prototype; browser acceptance remains incomplete**. No unresolved blocking source findings in the manifest below.

## Task record

Requirements: U17 broker intake, U02 documentation, U03 delegation, U04 honest UI, U05 independent verification and reviewed publication, R02 deterministic tools, R05 truthful evidence and R18 confidentiality. Preserve the source project's R01/R03/R04/R07–R10 five-role workflow, advanced architecture, live benchmark and six observatory views.

Owned file: this review only. Dependencies: completed U17 backend, planning runtime, order board, Dispatch integration and documentation. Acceptance: immutable order matching; atomic/idempotent claims; safe failure/rejection recovery; bounded CSV; no-provider planning with five roles and explicit unavailable usage; retained draft data and actionable errors; independent checks against a frozen source manifest. Exclusions: implementation changes, real customer database writes, paid model calls, external carrier communication and production-readiness approval. Browser verification belongs to the lead and is attributed separately.

## Findings resolved before approval

1. **P2 — cancellation before successful finalization leaves orders stuck.** With temporary SQLite and mocked road providers, pause `Store.finish` after `BrokerRuntime.execute` materializes ready trips. Cancel every trip through the API, then replay the captured successful finalization call. Observed all trips `cancelled` with orders `planned`. `release_rejected_proposal` only handles an already successful run; finalization needs the same conservative reconciliation or cancellation must reject pending plans. No started work may be released.
2. **P2 — draft metadata lost after address-row changes.** The initial OrderBoard reconciliation uses array index plus full delivery content. Editing a delivery regenerates its reference/customer/date; deleting an earlier delivery also regenerates surviving rows. Stable draft identity and preservation tests are required.
3. **P2 — submission errors erased by unrelated polling.** The initial BrokerPlanning poll clears the same error state used for failed submissions every three seconds. Keep action errors until an appropriate new action or successful submission.
4. **P2 — deterministic tool failure can name an unrequested model.** The shared workflow failure path derives `requested_model` from the Anthropic environment for every `mode=live` failure, including `explanation_policy=none`. Keep model IDs null and the explicit deterministic usage reason on that path.

All four findings were corrected and rereviewed. Finalization now invokes the same conservative rejection check under the owner lock, requiring the exact expected trip set, every trip cancelled and every `started_at` null. Stable draft UUIDs preserve metadata through edits/removal/reordering; temporarily selecting saved orders retains the freeform draft and its metadata. Poll errors have separate state. Deterministic failures now retain null model IDs and an explicit inapplicable-usage reason.

## Independent verification

- Final affected pytest: `python -m pytest tests/test_orders.py tests/test_broker_deterministic.py tests/test_validation_feedback.py -o addopts='' -q` — **40 passed**, 30.05 seconds. Covers the newly reproduced finalization race, started/unknown-trip nonrelease, stale fences, batch atomicity, competing/same-key claims, restart persistence, strict CSV, immutable inputs, zero-provider success/failure evidence and sanitized validation feedback. Three existing SWIG deprecation warnings.
- Broader independent regression command adds `tests/test_broker_runtime.py tests/test_dispatch.py tests/test_telemetry.py` — **71 passed**, 112.41 seconds. This process began before the last fixes; the final affected rerun above establishes those fixes. Initial affected tree also passed 38 tests; the two extra final regressions close review findings.
- `npm.cmd test` — **74 tests across 12 files passed**, including draft identity/reconciliation, omission labels and validation-envelope tests. These tests include helper/static-render checks; they do not establish full browser interaction or visual acceptance.
- `npm.cmd run build` — **passed**, TypeScript and Vite production bundle. Existing large-chunk warnings remain for chart/map bundles.
- `git diff --check` — passed. Source review includes the final QA selector update, which was **not executed in a browser** during this review.
- Independently constructed the cancellation/finalization boundary above with a temporary database, mocked road matrix/geometry and captured finalization arguments. Final reproduction exited successfully and disposed the database engine. No paid provider calls or customer database writes.
- Two earlier scratch runs were unsuccessful: missing `services` on Python import path; then an incomplete finalization replay used empty detail and hit a Windows temporary-file cleanup lock. Neither is approval evidence. The corrected reproduction uses the actual captured arguments and closes the engine.

## Source-project preservation

Independent `git diff --name-only 16823c0 --` checks returned no changed files for `Observability.tsx`, `Chart.tsx`, `Analytics.tsx`, `Replay.tsx`, `Fleet.tsx`, frontend dependencies, `requirements.txt`, `services/genesis/worker.py`, `experiments/` or `docs/REPORT.md`. React Flow graph, ECharts timeline/Sankey/comparison/heatmap/KPI paths, LangGraph execution and Langfuse worker integration remain. The shared workflow change is limited to truthful failure metadata for the new omission policy. The App change is dispatch wording; existing observatory navigation remains. Stored benchmark evidence is preserved, and new tool-only broker runs do not establish new live-model benchmark evidence.

Customer/reference/date metadata is excluded from broker model inputs. Order inputs stay immutable; tracked planning accepts only exact authoritative payloads. No key/provider configuration, model adapter or budget reservation is needed for the deterministic policy. Five roles, tool calls, handoffs and independent certificates still execute. Cancellation/finalization safety is verified under SQLite, the supported local profile.

## Final reviewed source manifest

SHA-256 of filesystem bytes, captured after the lead declared source/formatting frozen. Includes changed runtime/UI/tests and the reviewed, unexecuted QA selector update. Documentation was read separately; later evidence/action-log additions are not included in this source manifest. The review file cannot hash itself.

```text
3a7e30ca14ad07433c2226c4106035542ef00cea6be53e10e886406d4c979a4c  apps/web/src/App.tsx
51684214c83761236bec629c62f118ee325cb7f112e2d75695b8a4b1222c143f  apps/web/src/BrokerPlanning.css
b469cc6955bb016716feb79ebde2f4a1b4ace44751cfc83b653f3d53bc10f26c  apps/web/src/BrokerPlanning.tsx
b5efa52a74c86fc495c7c40364c18c0ad67ccda8e8f91fde788d208305c56c83  apps/web/src/BrokerPlanning.test.tsx
00351512ba2db0aafff155dcb62bcd8fe5db621cd2781ba8d8efcac0e677f36f  apps/web/src/Dispatch.css
44b8a6dee4cb61bdec7c7053c63fa8e5589af337f8817a3b2f268299f11f3914  apps/web/src/Dispatch.tsx
a602ee6c5cabf3f904fec097b905cc3230ea007ebb84adf2f5762d322bcdff5f  apps/web/src/OrderBoard.css
09971ca9037ba2f90f12cba012f9f65b2d4b504252399fec120f34659404e32f  apps/web/src/OrderBoard.tsx
e49d9442c7f79288c57d5d3456c813a1f0d000f5384069d9d83230e32afd0569  apps/web/src/api.ts
9a9179076b88697d14a369fa372fbd5ef15b881e0e9e8d76dca7f964a569503a  apps/web/src/api.test.ts
5ef04a47d4d6249b4448ff2f41c489f2c016e6388c8812ce856be910970b1180  apps/web/src/dispatchTypes.ts
6f0aab10e2eb36c6cbd4bf6f642a804f8f9b3a5ad0d52084115758cd6b2cd635  apps/web/src/orderData.ts
5fb95f4cfc744f4e1272ccfce7fdeb6d33ff50d3da6288d8487d030692ba8f02  apps/web/src/orderData.test.ts
3356ac1cc774b541b0cbb86ae907b007031f0e2472496958ca29a92e51a84680  services/genesis/api.py
2cff5e3730bfd9d78d58aa789ccbb0d2df037e2e40fe5f8ae0d97e21dd5a051d  services/genesis/broker_api.py
e8707eee84b67a4cbe180de5c9ff8131e3b6ffe6489ec9dd76a3be0db645ade7  services/genesis/broker_runtime.py
2773205aad895f9d24cfe6142745e4d1df8fb39b97837691a7acbe0de1ba0fdd  services/genesis/db.py
4e2f19e492aef303054931646114911590ebca2cc024a7664a29136cb273261d  services/genesis/dispatch.py
d528d34a23df40ef13fa5fc987a091e30acefd39e45db2c7c87d9053d3ec1059  services/genesis/orders.py
80e5b55b2ca06512be7ec41ab139eb1081372e84f84875b87c3961ebe4c5e399  services/genesis/workflow.py
a2b583ed24aa1ac8b20776118858d9b6e8d669333af940e84fedb0f3c89ec620  tests/test_broker_deterministic.py
47a6d26a612ddb68806d55e78ab45567be7c7ef93add6a853ed0143d060c939f  tests/test_orders.py
7903fa43981c1c3d2abc156bf05cbb7705ad2d9488e0e53c57a6abe68bc3a464  tests/test_validation_feedback.py
45e69acafc3f1dbd555440320f2469cddc5ed2828a4b31a2994518aa690dcb9c  qa/tests/routes.browser.spec.ts
```

## Limits and decision

No blocking source findings remain for the hashed tree. The lead reported automatic approval review rejected launching the updated web/worker processes; no workaround was used. Consequently the newly implemented browser flow, mobile layout, keyboard interactions and whole-app startup have not received browser acceptance in this review. The existing idle worker was stopped by the lead to avoid executing requests with obsolete code; startup remains a user/environment action. This review approves the source and deterministic evidence, not a claim that the updated app is running or production-ready.

Production identity/tenancy, PostgreSQL execution, live routing availability, actual driver operations, new paid benchmarks and external Langfuse execution remain unverified. No real customer database writes, model spending, implementation edits, commits or pushes were performed by this reviewer. Material source edits invalidate the affected review and require manifest refresh plus relevant checks.
