# U19 — Configurable local van roster

Date: 2026-10-11. User authorization: continue feasible remaining functionality, including configurable fleets.

## Scope and ownership

Requirements U09/U10/U11, R02/R05 and U02–U05. Replace operator-only four-van assumptions with a validated local roster while preserving the separate academic benchmark, current cargo locks, independent capacity validation and simulation provenance. This is a configuration feature for the local pilot, not an authenticated fleet management system or truck navigation.

- Backend owner `u19_fleet_backend`, gpt-6-astra/high: fleet configuration module, dispatch/broker runtime and API, bounded solver and route-memory boundaries, focused backend tests and `docs/FLEET-CONFIGURATION.md`.
- Lead: frontend shared types, configured vehicle selectors/labels/map legend, integration, contract export and shared documentation.
- Separate frontier reviewer: final source, configuration fencing, reservation/cargo safety and verification evidence.

## Agreed contract

Optional `GENESIS_FLEET_CONFIG` identifies a local JSON document `{version:1,vehicles:[{id,name,capacity_parcels}]}`. The default remains four vans with 40-parcel capacities. Validate 1–10 unique short IDs and per-van capacity 1–40. Configuration paths and private data must not enter traces or error messages.

`GET /api/v1/dispatch/config` exposes the configured roster and a canonical configuration fingerprint. Fleet snapshots carry the same fingerprint and per-vehicle name/capacity. Broker requests freeze the admitted version; worker and trip admission must reject incompatible/stale configuration. Retired vehicle history remains readable. Active reservations, running work, queued broker work or unresolved cargo prevent incompatible reconfiguration. The separate benchmark fleet is unchanged.

The UI derives eligible/manual vehicles from the API, shows capacity, preserves valid selections on refresh and uses stable IDs for requests. An unavailable configuration disables new manual creation; no invented fallback roster. Existing historical trip IDs remain readable even when not in the current idle roster.

## Acceptance

- Default compatibility and custom 1/2/5-vehicle rosters; duplicate/invalid IDs/capacities and unknown mutation IDs rejected.
- Manual, reused-route and broker capacity checks agree; solver/certificate/admission use the frozen roster.
- Reconfiguration cannot erase cargo or reservations; stale processes and frozen plans fail closed.
- Frontend tests/build, focused backend regressions, configured-roster browser smoke in isolated QA and independent review.
- Operator data and private `.env` remain unchanged. No new paid calls or external driver actions.

## Evidence

Delivered validated local configuration, persisted API/worker configuration fencing, capacity-aware manual/reuse/broker/start admission, route-memory policy versioning and bounded ten-van search. The directed matrix accepts up to30nodes (ten van origins plus twenty stops). The API contract export matches a fresh isolated application's OpenAPI exactly. No dependency was added. Configured labels/capacities now drive the frontend; current roster IDs receive ten distinct stable colors shared by legend, routes and vehicle markers, including markers created before configuration finishes loading.

Author and independent tests cover default/custom1/2/5/10 rosters, unknown/invalid IDs, capacity, blocked reconfiguration with ready/running/queued work or cargo, retired history, stale processes, frozen plans, idempotent retries, bounded separated search and the matrix limit. Final full suite:245Python and77web tests passed; lint/build passed. Independent review covers141 scoped backend cases across successful runs,4 isolated harness cases and10 selection/color cases. See [review](../reviews/local-readiness-review.md) and [U18 browser evidence](U18-local-readiness.md).

MCP verified five configured names/capacities in broker controls, manual selector and map legend, including a long label at320px. Two imported orders were assigned to capacity4 `est`, producing a certified four-stop ready trip. Its explicit simulation start and completion were observed; stop selection synchronized list/map/details. These are synthetic QA fixtures with zero paid model requests. Operator configuration and cargo were not changed.

Deployment limitation: API/Vite serve the reviewed changes, but the guarded idle operator-worker restart was rejected before execution by automatic approval review (“blocked by policy”). The old worker remains running. Restart the worker through an allowed operator action before enabling a custom roster; follow the quiescent API+worker procedure in [fleet guide](../FLEET-CONFIGURATION.md). The new worker source was exercised only in isolated tests/QA this turn.

Physical recovery, authenticated fleet administration, drivers/shifts, weight/volume/pallets and heavy-truck restrictions remain separate work.
