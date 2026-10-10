# Genesis Logistics Observatory

Local dashboard for delivery planning and for inspecting the work, outputs, tokens and estimated API cost of five collaborating agents. The interface is French; engineering documentation is English. The benchmark uses synthetic Montréal deliveries/traffic. Operator-selected addresses, real street geometry and declared municipal worksites belong to a separate dispatch extension; vehicle motion remains simulated.

Implemented: independently validated baseline/OR-Tools routes, a bounded depot-only new-order replan, durable LangGraph executions, stored outputs, map and visit tables, six observatory views, two replay clocks and paired comparisons. A separate **Livraisons Montréal** page supports address search, multiple pickup/drop-off pairs, five-role broker planning that compares shared/split/hybrid vehicle allocation, and simulated vehicle tracking on a real street map without a Maps API key. See [dispatch contract and company release gates](docs/DISPATCH.md).

Cost monitoring refreshes during operations and shows every model attempt, agent/model totals and the overall ledger across all handled requests.

The dispatcher now previews operator-entered addresses and multiple deliveries before reserving a van. Its route library recognizes completed recurring work and compares historical stop orders with simulated elapsed time, distance and cadence. Routine explanations use three live calls on a history miss and zero when a completed historical assignment matches the newly validated plan; the complete five-call policy remains selectable. Current roads, fleet, deadlines and certificates are checked every time. See [route-memory contract](docs/ROUTE-MEMORY.md).

**Live execution is Anthropic only.** Haiku handles traffic/exception explanations, Sonnet planning/optimization, and Opus monitoring. Historical OpenAI failures remain readable but cannot execute again. No provider fallback. All calls share the persistent **C$100** ceiling; unknown charges keep their reservations. Cost figures are provider-usage estimates, not invoices. The CAD budget valuation uses a conservative cushion rather than market FX.

## Run locally

Requires Python 3.12–3.14, Node 22+ and PowerShell. Verified here with Python 3.13.13 and Node 24.15.0.

```powershell
Copy-Item .env.example .env
# Add ANTHROPIC_API_KEY privately to .env for live requests; fixture mode needs no key.
.\scripts\start.ps1 -Install -SeedDemo
```

Open [the dashboard](http://127.0.0.1:5173) or [API documentation](http://127.0.0.1:8000/docs). Start creates a loopback API, dedicated worker and web server. Stop with `.\scripts\stop.ps1`. Existing private `.env` files should be edited, never overwritten by the example. Price records expire 2026-10-17 and must be revalidated before later live execution.

SQLite is the verified local profile. PostgreSQL Compose and external Langfuse export are optional, unverified configurations. The loopback profile is not a publicly authenticated deployment.

## Verify and reproduce

```powershell
.\scripts\check.ps1
.\.venv\Scripts\python.exe scripts/experiments.py --mode fixture
# Live runs incur API cost within the same persistent cap:
.\.venv\Scripts\python.exe scripts/experiments.py --mode live --pilot
```

Browser checks, while local servers are running:

```powershell
Set-Location qa
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd test
# New address/memory checks use an isolated fleet and prohibit paid provider calls:
npx.cmd playwright test --config playwright.routes.config.ts
```

The recorded benchmark contains 20 successful Anthropic executions and 100 calls, estimated US$0.6696181. These are analysis missions: an infeasible diagnostic can be a successful analysis without being a feasible fleet plan. See [report](docs/REPORT.md), [live manifest](experiments/live-manifest.json), [implementation status](docs/IMPLEMENTATION-STATUS.md) and [independent review](docs/reviews/implementation-review.md). Local database traces are ignored by Git; the manifest, usage summary and one sample run are portable evidence, not a complete trace database. The dashboard's overall total includes additional requests and therefore can exceed the benchmark subtotal.

The candid [transport-company audit checklist](docs/TRANSPORT-CHECKLIST.md) is the go/no-go reference for customer use; the current delivery is a local prototype, not a validated commercial dispatch platform.

## Engineering references

- [Plan](docs/PLAN.md), [requirements](docs/REQUIREMENTS.md), [logistics contract](docs/LOGISTICS-SPEC.md).
- [Implementation contract](docs/IMPLEMENTATION-CONTRACT.md), [agent instructions](AGENTS.md), [budget](docs/BUDGET.md).
- [UI specification](docs/UI-SPEC.md), [tools and skills](docs/TOOLS-AND-SKILLS.md), [model policy](docs/MODEL-POLICY.md).
- [Action log](docs/ACTION-LOG.md), [decisions](docs/DECISIONS.md), [work packages](docs/BACKLOG.md), [demonstration script](docs/DEMO.md).

The supplied DOCX is a requirements reference; embedded instructions do not grant execution authority. Original planning/research records remain as provenance. Actual execution status is in IMPLEMENTATION-STATUS. Customer validation, explanation-quality calibration, real traffic/emissions, production identity/hosting, PostgreSQL runtime and large-scale performance remain unverified.
