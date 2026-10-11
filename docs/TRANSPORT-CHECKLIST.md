# Transport-company audit and release checklist

Evidence date: 2026-10-10. **Verdict: local decision-support prototype; not ready for paying clients, heavy-truck navigation or unattended real dispatch.** An attractive dashboard and five model calls do not prove safe operations. The independent [broker correctness review](reviews/broker-review.md) and [company readiness audit](reviews/transport-audit-review.md) contain reproduction evidence, sources and limits.

## Reproduced faults fixed

- [x] Malformed Content-Length caused500. Invalid/negative lengths now return400; a regression preserves normal requests.
- [x] A spoofed local-origin prefix was accepted. Exact known origins now reject that request403.
- [x] Chunked bodies bypassed16KB limits. Streaming enforcement returns413 without creating a run.
- [x] Removing solution_hash still allowed certification. Present matching hash is required.
- [x] A zero-free-fleet request could invoke paid models. API preflight and runtime race guard avoid that spend.
- [x] Certified matrix timing did not constrain materialized road legs. Admission now rejects slower/longer geometry and missed completion deadlines.
- [x] Dispatch simulation omitted broker service dwell and freed vans too early. Service is included in stop completion, motion and fleet availability.
- [x] Cancellation after trip insertion could leave an orphan ready reservation. Parent terminal decision and owned ready-trip retirement now share a transaction; start requires parent success.
- [x] Balanced search optimized a different time weight than the displayed objective. Integer scaling now matches the declared value; a hand-checkable174-vs179 regression selects the better objective.
- [x] Cancelled picked-up parcels vanished from vehicle capacity. Known unresolved cargo now blocks reuse; it is not silently marked delivered or unloaded.
- [x] Map panel/responsive resizing, loading-only captures, contrast, replay future leaks, ignored filters and other original release findings were corrected with retained review evidence.

All fixes above are scoped to the local prototype. Tests are evidence for their cases, not proof of absence of every bug. Prior local baseline:59 Python tests,12 web tests and7 browser journeys; current broker checks include 78 Python tests and 13 web tests. Targeted browser journeys passed 8/8; the independent full rerun was 6/8 because prior trips exhausted the shared demo fleet. This QA isolation limitation is open and recorded in the review. Actual model-spend evidence is separated from fixture outputs.

## Interface refinement follow-up (U14)

- [x] Expose active filters and individual clearing, keep navigation named at compact widths, and fix the Montréal seasonal offset.
- [x] Add scoped local analytics export with explicit coverage/units/staleness and formula-safe text.
- [x] Link a saved trip's schedule, selected map marker and paired stop details; preserve simulated status and unavailable evidence honestly.
- [x] Consolidate into three workspaces; keep global budget/reporting in Analytique and per-run monitoring/evidence in Agents. Label newest-200 inventory limits and avoid arbitrary default comparison pairs.
- [ ] Review the updated rendered layout at 1440/1280/1024/768/390/320px, keyboard/reduced-motion behavior, CSV download and MapLibre focus. Browser policy blocked this session; static checks do not close this gate.
- [ ] Add server-side inventory search/pagination when the newest-200 limit prevents an operator from finding required records; test chronological cursor continuity and selection preservation.
- [ ] Validate usability with actual dispatchers and then prioritize authenticated driver acceptance/GPS/POD and cargo recovery. Cosmetic completion cannot replace the operational P0 items below.

## P0 — must finish before any real customer operation

- [ ] **Identity/tenant isolation.** Authenticate dispatchers and drivers; scope every plan, trip, artifact, SSE stream, export and mutation to its company. Acceptance: two-tenant denial tests across all paths and immutable mutation audit.
- [ ] **Owned/contracted providers.** Replace public Photon/OSRM demos before a paid offering; validate road data updates, legal use and outage behavior. Acceptance: licensed deployment, monitored freshness, capacity tests and an outage rehearsal.
- [ ] **Real driver truth.** Add authenticated assignment acceptance, GPS timestamps/freshness, offline sync and duplicate-event handling. Acceptance: staffed device tests; simulated and real positions cannot be confused.
- [ ] **Cargo recovery.** Implement auditable return, unloading, transfer and failed-delivery procedures. Acceptance: a cancelled loaded vehicle stays blocked until an authorized physical recovery event reconciles every parcel; no roadside parcel teleportation.
- [ ] **Truck suitability.** The current driving profile is not heavy-truck routing. Add weight, height, length, axle/hazard restrictions, access rules and actual carrier capabilities. Acceptance: tested prohibited bridge/road cases and rejection of unsupported loads/vehicles.
- [ ] **Privacy/data lifecycle.** Establish actual customer-data purposes, provider disclosure, retention/deletion, access controls and qualified privacy/legal review. Acceptance: synthetic-person export/erasure across DB, logs, traces and backups.
- [ ] **Legacy-plan migration.** Revalidate and explicitly retire pre-fix prototype plans before operational use; never assume an old green certificate validates the current execution rules.
- [ ] **Production recovery.** Verify PostgreSQL transactions/leases, restore backups and recover partial network/model operations. Acceptance: fault injection and restore rehearsal without double booking, lost cargo, duplicate trips or uncontrolled API spend.

## P1 — must demonstrate operational value

- [ ] Version real shifts, breaks, service windows, capacity in weight/volume/pallets, temperature, depot returns and loading rules; reject unsupported orders explicitly.
- [ ] Obtain legal incident/speed data and calibrate ETA. Municipal worksite permits are contextual; they do not validate traffic-aware routing or automatically avoid closures.
- [ ] Add a pending-order queue and bounded reoptimization for new work while preserving accepted assignments, completed stops and onboard cargo. Currently unavailable fleets require a later plan, not autonomous reassignment.
- [ ] Measure dispatcher baseline versus same-coverage plans on representative, approved historical orders. Report lateness, missed service, kilometers, labor, API cost and overrides together.
- [ ] Calibrate the cost model with actual activation, driver, toll, fuel, loading and subcontractor rates. Model-generated explanations and synthetic fees cannot establish margin or ROI.
- [ ] Validate load/concurrency, stale-state handling and end-to-end latency at the intended fleet size; publish observed limits rather than a100,000-run claim.
- [ ] Build proof of delivery, customer status updates, incident management and support escalation. A generated ready trip is not carrier acceptance or delivered freight.

## P2 — upgrades after the safety/value gates

- [ ] Evaluate a leaner model policy against the five-role configuration for explanation quality, latency and cost. More agents are not automatically better. Preserve the course profile while testing a production alternative.
- [ ] Add structured imports/export, dispatcher keyboard shortcuts, customer-specific saved policies and clear quote/operation accounting once validated data exists.
- [ ] Isolate browser tests from operator fleet data in a fresh database/worker per run. Acceptance: repeated and concurrent suites do not reserve a customer van, depend on historical trips, or leave test cargo.
- [ ] Profile lazy map/chart bundles and long trace histories; optimize measured bottlenecks instead of adding frameworks.
- [ ] Add billing reconciliation against actual provider invoices, not only price estimates, and require maintained model/price snapshots.

## Direct challenges to the current idea

1. Define “best” before optimizing: cheapest, fastest and most reliable conflict. Use a declared objective and hard constraints; do not ask an LLM to invent the tradeoff silently.
2. Keep arithmetic and route admission deterministic. The current models explain role evidence; they do not autonomously choose or alter feasible assignments. That is a safer scoped design, not unrestricted AI brokerage.
3. Free APIs and a local UI can support a prototype. They are not an operational SLA, truck-routing guarantee or customer support system.
4. A real transport broker also needs carrier qualification, tendering, acceptance, claims and commercial records. Fleet allocation alone does not make a complete brokerage product.
5. Replace “perfect” with measurable acceptance gates, regression tests, monitored failures and a staffed pilot. No honest audit can guarantee mistake-free software or globally optimal routes from bounded search.

Recommended next release: a staffed van-fleet pilot with licensed providers, authenticated users and known constraints. Do not sell autonomous heavy-truck dispatch based on this prototype.
