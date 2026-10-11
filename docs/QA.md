# Isolated operator browser checks

The reusable QA profile serves the current application with a disposable SQLite database and checkpoint file outside the repository. It runs the real durable worker (`run_once`), two deterministic S01 analytics workflows and two completed route-history samples. Road geometry/matrices, geocoder results and unavailable municipal traffic are explicitly synthetic. It does not read private dotenv files, construct model adapters, deliver email or drain external telemetry. Public browser basemap resources remain subject to browser connectivity; the route tables work without them.

## Start for MCP browser verification

From the repository root, with existing Python/web dependencies installed:

```powershell
.\.venv\Scripts\python.exe qa/start_isolated.py
# Optional fixed synthetic five-van roster for configurable-fleet browser acceptance:
.\.venv\Scripts\python.exe qa/start_isolated.py --fleet-fixture
```

Open `http://127.0.0.1:5174/?view=dispatch`. `GET /api/v1/qa/fixture` through port5174 or API8061 returns the same fresh fixture ID, `synthetic: true`, dispatch prohibitions and available public demonstration places. Both ports must be unused: startup refuses existing servers and Vite uses `strictPort`; there is no fallback to the operator API8000/web5173. The isolated proxy translates only the exact origin `http://127.0.0.1:5174` to the application's existing approved local origin. Other origin headers reach the unchanged API guard and are rejected.

Stop the launcher with Ctrl+C. It terminates only its owned direct Python/Node children and removes the temporary directory after their exit; partial-startup failures follow the same cleanup. Forced process-tree termination or a machine crash cannot execute Python cleanup and can leave an OS-temp directory. No workspace, fleet, budget or operator process is deleted/reset. Restarting the QA profile creates new state.

## Inputs and acceptance

`qa/fixtures/orders-valid.csv` supplies two public demonstration pairs with synthetic references/customer metadata, UTF-8 accents and a quoted comma. `orders-invalid.csv` has a zero parcel count. Use these only in the isolated profile. Search resolves `4500`, `1050`, `5300` and `400 rue` deterministically; `4500` is a feasible assumed depot.

The default profile preserves the normal four vans for existing browser specs. `--fleet-fixture` selects only the fixed public `qa/fixtures/fleet-five.json`: IDs `van1/est/ouest/nord/sud`, capacities `2/4/6/8/10`, synthetic QA names and a deliberately long Nord label. No arbitrary fleet path or inherited operator fleet variable is accepted. The fixture identity reports which profile is active. Use the five-van profile for MCP roster/capacity/long-name checks; the existing route specs use default IDs.

1. Preview invalid and valid CSVs; verify errors, disabled commit on invalid rows and zero persistence before commit. Commit two valid orders, repeat, reload and verify no duplicate. Conflicting references, invalid UTF-8 and oversized files must preserve existing orders.
2. Select saved orders through keyboard-accessible controls, prepare with default `none` explanations and inspect all five roles/certificate. Check zero model attempts and ready/unstarted trips. Only an explicit simulation start advances a trip; completed simulation is not real delivery evidence.
3. Inspect widths360/390/768, focus order and accessible order controls. Existing textual delivery/route alternatives stay available.
4. Download analytics CSV through the UI; verify BOM, units, filters, receipt/export times, coverage, newest200 table bound and absence of addresses/customer metadata.

## Reusable checks and evidence scope

```powershell
.\.venv\Scripts\python.exe -m pytest qa/test_isolated.py
Set-Location qa
# Discovery does not launch a browser or server:
npx.cmd playwright test --config playwright.orders.config.ts --list
# Only when browser automation is explicitly permitted; stop any manual QA launcher first:
npx.cmd playwright test --config playwright.orders.config.ts
npx.cmd playwright test --config playwright.routes.config.ts
npx.cmd playwright test --config playwright.budget.config.ts
```

Orders/routes/budget configs start their own strict API+frontend harness. The historical default `playwright.config.ts` and observatory spec still expect operator fixture history on8000/5173; they are outside this isolated-profile change. Browser specs being discoverable is not browser execution evidence. The current user-approved browser verification path is MCP, and this change does not run Playwright, CDP or another browser runner.

## Task record

Assigned IDs: U17 broker intake, U12 route checks, U14 responsive/CSV acceptance, U02 documentation, U04 truthful evidence, R02 deterministic tools, R05 trace accuracy, R18 confidentiality. Owned files: `qa/route_memory_server.py`, isolated launcher/self-check/config, routes browser spec, new orders spec/fixtures and this guide. Dependencies: current API/order/broker/worker contracts and existing Python/Node dependencies. Acceptance: no private dotenv/provider/email/exporter dispatch; fresh temporary state; complete certified intake-to-ready/start path; strict ports/proxy identity; owned-process cleanup; static browser spec discovery and separately recorded MCP evidence. Exclusions: operator service mutation, paid calls, external email/export, production origin changes, autonomous browser automation, production carrier/GPS/POD claims. Independent review and release records are owned by the lead.

2026-10-11 harness checks: four pytest checks pass, including guarded dotenv imports in separate interpreters for both default/five-van profiles, rejected reuse of an occupied loopback port, stopped owned child/readiness failure, synthetic CSV preview/import and real worker-produced five-role valid plans with zero attempts and explicit ready-to-running simulation. A second actual launcher invocation while8061/5174 were occupied exits1 before spawning children or creating state (expected WinError10048). Ruff passes. Static discovery lists four orders, five routes and three budget browser cases; none of these browser cases was executed by the harness implementer. Initial MCP CSV upload revealed that origin5174 was rejected; the bounded QA proxy correction returns200 for exact5174 and retains403 for an external origin. Independent review and the lead's MCP evidence are recorded separately.

After the lead completed its first MCP intake/export checks, the implementer verified the exact QA Node command and parent PID, stopped only that owned child and observed supervisor exit1 on child loss, backend termination, closed8061/5174 listeners and removal of its OS-temp directory. A fresh `--fleet-fixture` launch then passed owned unique API identity and same-identity frontend proxy checks against the final U19 backend. Operator8000/5173 and its worker remained outside these actions. A frontend child loss is deliberately reported as an error even when used for this lifecycle check.
