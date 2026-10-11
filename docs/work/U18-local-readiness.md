# U18 — Local verification and recovery readiness

Date: 2026-10-11. User authorization: continue remaining work that can be completed now.

## Objective and boundaries

Close outstanding local intake/browser checks, repair demonstrated UI defects, make repeatable browser checks independent of operator state, and add a rehearsed SQLite backup/restore path. Preserve all project technologies, five roles, historical experiments, cost ledger, Anthropic-only optional explanations and simulation provenance. This work advances R02/R05/R12/R14/R15/R18 and U02–U05/U09/U11/U14/U17; it does not redefine their acceptance.

The intake story is CSV or entered orders → validated API → persistent backlog → certified plan → explicit simulated start. Recovery must preserve the database record and accounting without overwriting the active operator database. Test fixtures must never consume model funds or contact customers.

## Ownership and dependencies

- Lead: `apps/web` fixes discovered through MCP, this record and shared status/checklist/action documentation; browser acceptance and integration.
- `u18_isolated_qa`, gpt-6.1-sol/high: isolated API/web QA harness, existing route/browser configurations and regression specifications, `docs/QA.md`. No browser execution outside the approved MCP tool.
- `u18_recovery`, gpt-6-astra/high: new SQLite recovery module/CLI/tests and `docs/DATABASE-RECOVERY.md`; read-only PostgreSQL runtime availability assessment. Shared database/config files require coordination.
- `u18_readiness_inventory`, gpt-6-luna/medium: bounded read-only remaining-work inventory; no file ownership.
- Separate frontier reviewer: completed source, accounting/recovery boundaries and evidence before publication.

## Acceptance

1. Isolated local API and frontend do not touch operator orders, vans, database or budget; fixture providers explicitly identify synthetic evidence and prohibit paid calls.
2. MCP browser exercises valid and invalid CSV intake, duplicate-safe import/persistence, keyboard navigation, requested narrow/wide layouts, analytics export and selected-stop interaction. Record exact coverage, downloads and screenshots; distinguish manual checks from unexecuted automation.
3. Fix demonstrated defects at shared boundaries with meaningful regressions. Run frontend tests/build and relevant backend checks after material changes.
4. SQLite online backup produces a consistent artifact; integrity/schema checks reject unusable input; restoration creates a new destination and never replaces existing data. Temporary-fixture rehearsal preserves orders, plans and ledger state. Do not restore operator data during testing.
5. Independent review, complete diff inspection, documented remaining gates and normal push to the known codex branch.

## Remaining product work

Authentication/tenant isolation, authenticated fleet administration, cargo recovery and driver workflows are substantive future implementation work, not automatically external blockers. The bounded local fleet configuration is delivered in U19. Production approval additionally depends on actual provider contracts, calibrated truck/driver constraints, authenticated device testing and a staffed pilot. Their completion is not claimed by passing local UI/recovery checks. External Langfuse/PostgreSQL evidence will only be claimed if actually executed in a suitably isolated environment.

## Evidence

Completed source and bounded local verification on 2026-10-11. The isolated launcher owns strict ports8061/5174 and temporary state, identifies its API/proxy instance, disables dotenv/provider/email/exporter dispatch, and supports default and public five-van fixtures. Four harness lifecycle/workflow tests passed; occupied-port refusal and owned-child cleanup were also exercised. The older general observatory suite still uses the operator profile. Orders/routes/budget browser specs were discovered, not executed by a browser runner.

MCP browser evidence (lead, synthetic QA):

- Invalid zero-parcel CSV: row error, disabled commit and no persisted order; invalid UTF-8: explicit encoding error. Valid UTF-8 BOM, quoted-comma and accented input: two preview rows with no persistence before commit, two saved orders after commit/reload and no duplicate after repeating the same import.
- Actual template download: `modele-commandes-genesis.csv`, two example rows and eleven headers. Actual analytics download: `genesis-analyses-2026-10-11T16-19-15.csv`, 91 rows and nine headers; UTF-8, units and scope retained, no replacement characters. Files remain local in Downloads, not Git. Deterministic runs truthfully show no fabricated API usage.
- Populated Opérations, Analytique and Agents measured at widths320/390/768/1024/1280/1440 with no document horizontal overflow. Existing bounded tables may scroll horizontally. The narrow navigation was corrected to fit all three controls at320 while retaining44px height. A long configured vehicle label also fits320.
- Keyboard Enter operates navigation and native intake/manual disclosures. Depot search submits with Enter; its result button selects with Enter. One initial test pressed Enter on the input again after ArrowDown had moved focus to the result, causing another search; targeting the focused result corrected the test. Selected-stop Enter updates the textual details and matching map marker's pressed state. This is bounded keyboard coverage, not a full tab-order/screen-reader/WCAG audit.
- Fresh five-van profile: two CSV orders, linked preparation, capacity4 van `est`, certified four-stop mission `aa7d84b3`, ready trip `31333b3c`, explicit start, then completed simulation. All four stops display completion. Geometry is explicitly synthetic QA evidence, not a new public-road or traffic validation. Browser console error retrieval returned no entries.
- Desktop screenshot inspected and retained only in ignored `data/u18-browser/configured-fleet-desktop.png`. A screenshot requested immediately after the mobile resize retained the old desktop composition, so `configured-fleet-mobile.png` is not accepted mobile visual evidence; narrow-layout evidence above comes from the settled DOM measurements and controls. Temporary tab closed and viewport override reset. QA implementer confirmed both ports closed, owned API exited and temporary directory removed after testing.

Recovery:20 passing temporary-fixture tests cover WAL consistency, full SQL dump/projection and settled/held accounting preservation, legacy/current optional dispatch tables, corrupt/incompatible input, overwrite refusal, concurrency and bounded locking. No operator backup restoration or worker cutover occurred. Separate LangGraph checkpoints and external outcomes remain outside the bundle; PostgreSQL runtime was unavailable.

Integrated checks:245 Python tests passed in185.17s (three existing SWIG warnings);77 frontend tests in12files passed; Ruff and production build passed. Independent final build after the marker-color correction passed in7.56s with the existing large chunk warning. Independent backend evidence covers the current141 cases across its scoped runs, plus4 harness checks and10 focused frontend cases. See [review](../reviews/local-readiness-review.md).

Other observed limits: ECharts' autogenerated timeline accessibility description includes `NaN` coordinate placeholders; a tailored screen-reader description remains a tracked follow-up. No paid call, email, auth/tenant implementation, production GPS/cargo workflow or commercial readiness claim. Operator ledger remained135calls/US$0.8164889 with US$0.10672 held. A guarded restart of the verified idle operator worker was rejected before execution by automatic approval review as “blocked by policy”; the old worker remains active and reviewed-source activation is pending. No alternate launch path was attempted.
