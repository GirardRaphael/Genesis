# U18/U19 independent local-readiness review

Date: 2026-10-11. Status: approved for normal source publication within the local U18/U19 scope below. No blocking finding remains in the reviewed implementation and documentation. Operator-worker activation and the listed production/accessibility gates remain open.

## Task record

Independent reviewer: Codex review subagent, separate from recovery, fleet, QA and frontend authors; actual runtime model identity is not exposed to this context. Applied the reviewed Ponytail skill. Requirements: R02/R05/R12/R14/R15/R18, U02–U05/U09/U10/U11/U14/U17 and the U18/U19 work-package acceptance criteria.

Owned file: this review only. Dependencies: completed recovery, configurable-fleet, frontend and isolated-QA source; final test evidence; shared contracts/status documents. Acceptance checks: inspect overwrite/accounting/privacy and schema boundaries; verify configuration fencing, capacity/cargo/reservation checks; inspect QA startup isolation; rerun relevant temporary-fixture checks; record exact reviewed source hashes and limitations. Exclusions: operator data, private environment files, external providers, paid models, SMTP, browser automation outside approved MCP, deployment, commits and pushes. The lead owns the shared action-log entry.

## Executed backend and isolation evidence

- Independently ran `python -m pytest tests/test_backup.py -q`: 18 passed on the initial recovery source.
- Inspected recovery online-copy, integrity/schema validation, manifest completion marker, exclusive destination creation, bounded lock retries, checksum verification and generic CLI diagnostics. The guide correctly excludes separate LangGraph checkpoints, worker restart, uncertain external-call reconciliation and production cutover.
- Detected that the first U19 fleet table used a separate metadata registry, making recovery's exact schema validation incompatible. The fleet author moved the table into canonical `db.metadata` during review. A temporary U19 initialized database then backed up successfully. Independently reproduced rejection of a legacy database without that table. The lead corrected the validator to permit only the known absent optional dispatch tables, while comparing their exact shape when present, and added legacy/current full-dump preservation cases. Independently reran the final 20 recovery cases: passed.
- Independently ran the integrated recovery/fleet/dispatch/broker-solver/broker-runtime/deterministic-broker/route-memory/orders suite in a child interpreter with private environment loading disabled, provider variables removed and temporary import/checkpoint paths: 137 cases passed. This run collected recovery18/fleet34 before the final additions. A separate 22-case run passed final recovery20 plus worker-startup validation and the 30-node road-matrix boundary. Current collection confirms 141 cases across these eight files; all are covered by those successful runs. These are fixture checks, not live provider or PostgreSQL evidence.
- Independently ran `python -m pytest qa/test_isolated.py -q`: three passed. It checks occupied-port refusal, owned-process termination/readiness failure, guarded dotenv import, temporary order intake, a worker-generated five-role certified plan, no model attempts and explicit simulation start. No browser was launched by the reviewer.
- After the final owned-instance identity check and five-van fixture flag were added, reviewed those changes and independently reran the QA suite: four passed, covering both default/five-van profiles.
- Inspected fleet binding/version fencing, quiescent-change checks, ready/running/queued work and cargo locks, historical retired IDs, manual/reuse/start capacity checks, frozen broker capacities, independent certificate/admission checks and bounded 1,000-assignment/13-second solver search. The author found and corrected the old 24-node provider bound to 30; the reviewer read that correction and independently passed its boundary test. No remaining blocking backend finding.
- Ruff passed all changed backend and QA Python files plus new recovery/fleet tests. `git diff --check` passed. Existing OR-Tools/SWIG import deprecation warnings remain; no failure is hidden by them.
- Reviewed frontend roster loading/failure handling, request IDs, retained selection, capacity labels, historical vehicle labels, accessible text alternatives, dynamic controls and narrow navigation styling. The original arbitrary-ID color collapse was corrected with a shared ten-color active-roster mapping. A follow-up review found existing running markers were not recolored after configuration loaded; the lead corrected that update before animation. Independently ran the final color/selection test file: ten passed, then the production TypeScript/Vite build after the marker correction: passed (Vite 7.56 seconds). Existing large-vendor-chunk warnings remain. No remaining blocking implementation finding.
- Independently compared exported OpenAPI with `app.openapi()` in a fresh isolated temporary application: exact JSON equality passed. The first review probe used Windows' default text encoding and falsely differed on the French default name; rerunning with explicit UTF-8 resolved that probe error without changing the export.
- Review-probe limitations: an initial standalone Python probe lacked `PYTHONPATH=services` and failed before importing application code. A later temporary probe passed backup but its own unclosed SQLite diagnostic connection prevented automatic temporary-directory cleanup on Windows; no operator path was involved. After process exit released the handle, the reviewer verified the exact temporary path and removed only that probe directory.

## Final evidence reconciliation and remaining gates

Reviewed the final README, recovery/fleet/QA guides, requirements, data contract, decisions, checklist, status, U18/U19 work records and action entries A097–A101. The lead's recorded MCP evidence covers CSV validation/preview/import/retry/reload, actual template/analytics downloads, bounded keyboard navigation and linked stop selection, populated responsive layouts at six widths, and a five-van fixture order-to-certified-ready-plan-to-explicit-start/completed-simulation flow. These browser actions were performed by the lead and reconciled as reported evidence; the reviewer did not independently replay them. The stale mobile screenshot is explicitly excluded as visual proof. Browser specs were discovered but not executed. Full keyboard/screen-reader/reduced-motion acceptance and the ECharts `NaN` description are explicitly retained as unchecked work.

The lead reports the complete 245-test Python and 77-test frontend runs; the independently executed checks above provide separate scoped corroboration. All 30 implementation/API-contract hashes were rechecked unchanged after final source freeze; final documentation hashes are recorded below. Staged/working diff whitespace checks pass. Source publication is approved subject to the lead's normal remote/branch/staged-path checks; this review does not claim a push occurred.

PostgreSQL execution, authenticated production readiness, actual driver/cargo recovery and live-model/external-service behavior are outside this review's executed evidence. The reviewer did not approve an operator-database cutover. Any material change to the source manifest below invalidates the affected source approval.

Runtime activation limitation reported by the lead: automatic approval review rejected the guarded operator-worker restart before execution. The existing operator worker remains running; activation of the reviewed worker source is pending. The isolated fixture worker executed the reviewed source. Source publication does not claim an operator worker upgrade, restored-database cutover or completed company deployment.

## Reviewed implementation source manifest

SHA-256 of exact working-file bytes after the final marker correction. Git line-ending normalization can change byte hashes without changing source semantics; compare the actual diff as well. Generated build output is excluded.

| File | SHA-256 |
|---|---|
| `apps/web/src/BrokerPlanning.css` | `427b77cc37cf88585cfdc5474cae61d5be7da8a8257735ff3fa7028db47c66b9` |
| `apps/web/src/BrokerPlanning.tsx` | `012bf6663b62aeae4a6d2fc173130d6c413046a2f2a269d3b5397ace6467ef79` |
| `apps/web/src/Dispatch.tsx` | `ef3ceb2f06e4d3789fac6c3769584b3c43ba2e4277cf20e426e83352528c5585` |
| `apps/web/src/DispatchMap.tsx` | `ff57b9635ad34c47406b3c1ed02f54662f316f529af47f1517727a2e57568f0d` |
| `apps/web/src/dispatchTypes.ts` | `2fe6a34417395a10eabf02e8b12f0912f28c26aa193e9ac114c1f1bcedef3fd3` |
| `apps/web/src/dispatchView.test.ts` | `eca2b2b274f31b6575c209f4adf3932137cea3c58338ffb6c10c7a68d1b8914c` |
| `apps/web/src/dispatchView.ts` | `45609f5c673f92dd0b55ee55954a832ff444d9d7dc329a8e9538cd6e109ec5b2` |
| `apps/web/src/style.css` | `2198f07d59da603ea56f43ad045ff49d61a9a8bd5e8d5411d0279b5c548fa3e0` |
| `qa/fixtures/fleet-five.json` | `b8471148a0ba3fc074ec70e50fc5443bb5f6598165edac6c098a112d75eae3df` |
| `qa/fixtures/orders-invalid.csv` | `5727093bdb4d240df72e302128adf6d9db6c5f7aad628edb8ed83daac94cbad3` |
| `qa/fixtures/orders-valid.csv` | `46be5a69ad5dfe1bf750f2c534a332f8d3671c281e0f17fb53eb5ac748964f24` |
| `qa/playwright.orders.config.ts` | `646d959273b3704340aaa22e753c5cdfa917d0199838a3d5ffab1b1fe2c276f3` |
| `qa/playwright.routes.config.ts` | `2b0534d5c64c78329823b085cfd6541c5eccd8297a915b497c412cd4e3b35ec9` |
| `qa/route_memory_server.py` | `9684cca2de894545707c1589d5c5c3c5f4e2c3cb5be0e09977cd188611adbe2d` |
| `qa/start_isolated.py` | `5a4230c6485cbab04171b60de64fa046448f181e465fec3419c9388dcfe03176` |
| `qa/test_isolated.py` | `eacc37ab0e4d0c733d138dd60355062c868bbf1bd5c2cd501d2596059ef28c64` |
| `qa/tests/orders.browser.spec.ts` | `3f883344f0bc3a52ab490d271c9a5d5a5ebc7bab5ce5a349f14381bf98a195e0` |
| `qa/tests/routes.browser.spec.ts` | `b521f7f30513032f72e15809b352019b875958b28a419400af8878d7a40d197a` |
| `qa/vite.config.ts` | `cc4841a4639bc82625f58d39ecfc23f6904a908c817a27bf23e785c10d453ec0` |
| `services/genesis/backup.py` | `fef126a7a26a6b6b819f2420f774378877a8e40b2ab685037d5e21a216188570` |
| `services/genesis/broker_api.py` | `be073c61d92beb210ed27da598065fb605d201b831a62ecd1ac919d0e6108c42` |
| `services/genesis/broker_runtime.py` | `a8c59b79b3b69443ff65998db2fd1e2eb1d91b6985ed7e47cc3e81141b84520b` |
| `services/genesis/broker_solver.py` | `67dafabe7e2a49959830bc5fbbb78a05021554500e85f8bf17a4dac39e4a749e` |
| `services/genesis/dispatch.py` | `d045751da4c3aeed0ef46fdac8f5ac4e1af59062891b3d5aaf9d4e818c009024` |
| `services/genesis/fleet_config.py` | `b7d2f87c59329325e5ccec1c0ffb7596f442d2cfe88f813e3d2d45d9d6057f53` |
| `services/genesis/route_memory.py` | `a2ed02736f5f7ab88b32081789420adff82ace109d5711b7193b02ffbe1b674c` |
| `services/genesis/worker.py` | `1d6c8416fbf3e014b3c4f210c59608f9c8550bc4abe3b269e629edbd63c7f74d` |
| `tests/test_backup.py` | `d752f01fd25d681586fbf04539ad054245b972f27a8e2f07c827cbe8909a327e` |
| `tests/test_fleet_config.py` | `d20d321bc9cf0d0914288d2df053fb8b2a5dbceaa84b2442d201dbaa45ddd8f5` |
| `packages/contracts/openapi.json` | `10ebb4e42f76c5a6b511c3cc997e54cc7b1b8f4f586a7adfb945b0fcb6aabe5d` |

## Reviewed documentation manifest

Final documentation bytes after the explicit remaining accessibility and authenticated-fleet gates were retained. The review file excludes its own hash. A subsequent factual publication-only action-log entry may record commit/push results; any changed implementation or readiness claim needs renewed review.

| File | SHA-256 |
|---|---|
| `README.md` | `4c79fb926a6d75a49b39e5acd47058193ba033b1fdebd9c8db9cb4772cff7677` |
| `docs/ACTION-LOG.md` | `ad5bb41b0a51f7001b889083bdcc5db878ca4917bf5888c87a50c37363e5f368` |
| `docs/DATA-CONTRACT.md` | `241387cc5db51e45bb7fc1af557ec28cab464b25a07418a43bb9499539bd9b9c` |
| `docs/DATABASE-RECOVERY.md` | `7983752ac96a17d5a1bad300c36439edb70d940faf439c4d693ac40c8f557420` |
| `docs/DECISIONS.md` | `1be15894c5ea298021e05cdd7408fc58bcdfb5d5d2ecf80c76630496a7c69ebe` |
| `docs/FLEET-CONFIGURATION.md` | `287b8f8b49285732077803fa7de7a4a6a371048b3162a43f6b51dce4e3f513f6` |
| `docs/IMPLEMENTATION-STATUS.md` | `0b212047aec028626d640afac8b4cc21b916d53a627c61f63013f5824cf693ba` |
| `docs/QA.md` | `5155d5977e7ae408139bde4955eebef43181ae47a2a0ce39a6daae2b397274e7` |
| `docs/REQUIREMENTS.md` | `3364b17be21bd0b05eb0e3a9ef637c49c08d5a0aad8077ae3c8c205053793815` |
| `docs/TRANSPORT-CHECKLIST.md` | `3f2635dec3633696169bbcb06dae279cca7bf6719ed3c4a2427df1578bd5e43b` |
| `docs/work/U18-local-readiness.md` | `eca5690ed69fcd13419459fd5ddf2faf3c5e8539bec16fb72c5da37ec6e5d326` |
| `docs/work/U19-configurable-fleet.md` | `09b70902496286247bf714cdfd8bcf43b376fb7eac8bb1e4816e88c3a14e7622` |
