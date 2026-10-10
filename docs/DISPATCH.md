# Montréal dispatch contract and business deployment gates

User requested a company-facing address/vehicle workflow on 2026-10-10, initially Google Maps, then explicitly selected an alternative that needs no API key. This extension uses real OpenStreetMap street geometry and public municipal worksite data. Vehicle motion and delivery completion are simulated, not GPS or proof of delivery. The original five-role benchmark remains synthetic and separate from these operator-created trips.

## Operator workflow

1. Open **Livraisons Montréal**. The initial map fits the Montréal island area; **Voir toute l’île** restores that view.
2. Search a public place or address explicitly, then select the matching result. Input changes cancel stale searches. Search is bounded to the Montréal demonstration bounding box, which includes nearby areas; this is not an exact island municipal geofence.
3. Add pickup → drop-off pairs, parcel quantities and a vehicle. Up to ten deliveries per trip; 40 parcels per individual pickup. Each parcel batch is dropped before the next pickup, so concurrent load never exceeds that batch. Manual mode preserves the selected order. The default broker mode compares consolidated, separated and hybrid fleet candidates under an explicit objective. A bounded feasible candidate is not a global-optimality proof.
4. Create the road route. OSRM calculates drivable geometry and static durations. Missing, unreachable or excessively snapped road stops return a typed error; no straight-line substitute is called a road route.
5. Start the simulation. Server timestamps drive progress at 60 simulated seconds per real second, with three-second refresh and smooth map interpolation. ETA after starting refers to this accelerated clock. A vehicle cannot run two simultaneous trips. Cancel retains the trip and its unserved stops. Known completed pickups without completed drops keep the vehicle unavailable with unresolved cargo; return/unload/transfer recovery is not yet implemented.
6. Toggle **Chantiers déclarés** to inspect permit locations and source freshness. These are declared worksite periods, not measured speeds, current work-hour confirmation or automatic route avoidance.

## Providers and verified boundaries

| Capability | Provider | Evidence / operational limit |
|---|---|---|
| Street map | [OpenFreeMap](https://openfreemap.org/) / OpenStreetMap / MapLibre | No key required; attribution displayed. Public service allows commercial use but has no SLA. Browser desktop/mobile tiles checked |
| Address search | [Photon](https://github.com/komoot/photon) | Explicit searches, five results, bounded region, cache and throttling. Public demo permits reasonable project usage; use an owned instance for business reliance |
| Road directions | [OSRM](https://project-osrm.org/docs/v26.5.0/http) | Real sample route and consecutive identical waypoint tested; static driving profile, no measured traffic or vehicle restriction certification. [Demo policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy) excludes relying on public demo access behind a commercial paywall |
| Declared worksites | [Ville de Montréal dataset API](https://donnees.montreal.ca/api/3/action/package_show?id=entraves-et-travaux-en-cours) | Official current CSV, 1,952 source rows observed; 1,412 within current permit period/region in the checked response, source updated2026-10-10. Cache15min, 2MB/2,000-item limits, bounded redirects, freshness/stale labels and retained last data on failure |

The separately catalogued [real-time CIFS obstruction feed](https://donnees.montreal.ca/dataset/entraves-circulation) returned404 during verification. Its absence is not replaced by invented congestion. Nominatim's public service was not selected as a generic tracking/address service; [its usage policy](https://operations.osmfoundation.org/policies/nominatim/) restricts autocomplete and tracking use. Google was not enabled: keys and billing are required, and [billing budgets do not themselves cap charges](https://developers.google.com/maps/billing-and-pricing/manage-costs).

## API and persistence

All endpoints retain the application's loopback host/client/origin boundaries. GET `/api/v1/dispatch/config`, `/geocode?q=...`, `/trips?limit=...`, `/trips/{id}` and `/traffic`. POST `/trips` accepts name, van1–van4 and bounded pickup/drop-off/place/parcel data. Creation accepts an Idempotency-Key. POST `/trips/{id}/start` and `/cancel` apply state transitions. The separate `dispatch_trips` table preserves operator inputs and road evidence; it does not fabricate LLM token usage or spend.

Trips expose route source/computed time, ordered stops, simulation clock, positions, completion coverage and retained cancellation. Public-provider URLs are fixed defaults; trusted environment variables `GENESIS_GEOCODER_URL` and `GENESIS_ROUTER_URL` select owned HTTP services. Do not put credentials in those URLs. Address searches are sent to the selected geocoder; customer names/contact/payment data are not requested and do not enter model traces.

## Company release gates

The delivered profile supports a local operator pilot. It is not a validated public SaaS or a live dispatch/GPS system. Before a paying-company rollout:

| Gate | Concrete work | Acceptance |
|---|---|---|
| Identity and tenancy | Hosted authentication, role-based dispatcher/driver access and tenant-scoped records | Cross-tenant denial tests; least-privilege driver updates; audit trails |
| Provider ownership | Owned Photon/OSRM, regional data-refresh jobs and observed capacity/SLA | No public demo dependence; load/failure/restore tests at actual fleet size |
| Driver tracking | Authenticated GPS ingest and device clock/freshness checks | Real driver/device test; stale-position states; no simulated point labeled GPS |
| Operations | Proof of delivery, cancellation/reassignment rules, shifts/cargo/time windows, calibrated road snapping | Dispatcher-approved fixtures and independent physical feasibility checks |
| Traffic | Reliable legal incident/speed source and traffic-aware ETA/reroute policy | Measured update latency, source coverage and ETA calibration; route respects known closures |
| Hosting and data | TLS, backups/recovery, production PostgreSQL, retention/privacy controls | Restore rehearsal, external integration tests and authorized deployment |

These gates are explicit exclusions from the tested local release, not completed features. No provider API key or additional paid cloud account was created.

## Agent-coordinated broker allocation (U10)

Default **Planifier avec les agents** creates a queued five-role workflow. Live mode uses the configured Anthropic tiers within the same persistent C$100 allowance and a default US$1 request cap. Fixture mode is explicitly deterministic. The role tools freeze free-vehicle origins, request a directional road table, compare consolidation/split/hybrid candidates, independently validate the selected candidate and recheck dispatch admission. Actual live model summaries pass evidence references to the following role; they explain verified results and do not override numerical constraints or compute route arithmetic.

`POST /dispatch/plans` accepts deliveries with 1–480-minute completion deadlines, a depot, selected eligible vans, objective (cost/fastest/balanced), service duration and editable estimated CAD rates. `GET /dispatch/plans` and `/plans/{id}` expose status, five-role outputs, usage, candidates, certificate and committed trip IDs. Four vans, ten pickup/drop pairs, parcel capacity40 and an eight-hour modeled horizon are the local bounds. Existing running/reserved work stays locked; known unresolved cancelled cargo is unavailable. No-free-fleet preflight prevents model spending; a changed fleet at admission produces a diagnostic rather than overwriting another job.

The solver assigns each pickup and drop to one vehicle, preserves strict precedence and onboard load, and checks service-completion deadlines. A one-vehicle plan is selected when its certified objective is better; deadline/fastest cases can select several vehicles. The balanced monetary/time score uses exact integer scaling; costs are assumptions, not customer quotes or measured profit.

The certificate binds the selected solution and frozen directed matrix. Committed road geometry must stay within each certified duration/distance bound; admission additionally checks actual road duration plus service. Published fleet costs are conservative matrix estimates, distinct from exact invoiced or persisted-road costs. Simulated positions hold during service; a van stays busy through its last service. All selected ready trips are inserted together, cannot start before the owner run succeeds, and are retired in the same transaction if cancellation/failure wins. A failed second route cannot publish only half the fleet plan.

A live integration pilot (`experiments/broker-live-pilot.json`) completed five actual Anthropic calls, used 8,338 tokens and estimated US$0.0335999, selecting one shared-vehicle candidate for two public-location deliveries. This one example does not validate commercial ETA accuracy, truck suitability, optimality or explanation quality. Source/solver/SDK and browser tests provide the scoped implementation evidence; company go/no-go remains in TRANSPORT-CHECKLIST.md.
