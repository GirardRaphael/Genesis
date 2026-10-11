# Local fleet configuration — U19

This extension configures the local Montréal dispatch roster. The synthetic S01–S05 benchmark fleet and historical provider records retain their original contracts. Route and vehicle motion remain simulated; parcel capacity does not establish truck suitability, legal load, driver qualifications, or live vehicle availability.

## Setup and boundaries

Without `GENESIS_FLEET_CONFIG`, the roster remains `van1`–`van4`, named **Fourgonnette 1**–**Fourgonnette 4**, each with capacity 40 parcels. To configure another local roster, create a private UTF-8 JSON file and set `GENESIS_FLEET_CONFIG` to its absolute path in the local application environment. API and worker must use the same file contents. No configuration is changed by these instructions or by automated tests.

```json
{
  "version": 1,
  "vehicles": [
    {"id": "courier1", "name": "Fourgonnette Centre", "capacity_parcels": 12},
    {"id": "courier2", "name": "Fourgonnette Nord", "capacity_parcels": 24}
  ]
}
```

The file is bounded to 16 KiB. It contains 1–10 vehicles with unique stable IDs matching `[a-z][a-z0-9_-]{0,7}`, a visible name of 1–80 characters, and integer capacity 1–40 parcels. Unknown properties, duplicate IDs, invalid versions, boolean/string capacities and out-of-range capacities fail validation. IDs fit the existing eight-character dispatch database column. Names are display labels; use a new stable ID for a different physical vehicle. Configuration errors omit file paths and file contents.

Changes require a controlled restart: finish or cancel unstarted trips and queued plans, complete running simulations, and resolve existing cargo through an explicitly supported recovery process before changing the roster. Stop API and worker; update the file; restart both. There is no fleet-editing endpoint or hot reload. An unresolved cargo lock cannot be removed by renaming/deleting its van, cancelling another trip, or changing capacity. Cargo recovery itself remains a separate implementation gate.

The complete roster is bound once per process engine. `dispatch_fleet_config` persists its validated JSON and SHA-256 version. Every changed roster, including a name change, requires no ready/running trips, no unresolved cancelled-trip cargo and no queued/running broker plan. Startup also rejects unknown historical vehicle IDs when they retain active work or cargo, even if the configured roster is unchanged. Completed and empty cancelled history stays readable after a quiescent removal.

An older API or worker compares its bound version to the accepted database version before new admission and fails closed if another process accepted a change. New requests cannot silently overwrite that mismatch. A broker request captures its fleet version and selected capacities; the worker rejects a different version before planning. Existing idempotency keys can still return their previously accepted records without reassigning work. API and worker startup validate configuration before accepting or claiming work.

## API and route evidence

- `GET /api/v1/dispatch/config` adds `vehicles: [{id, name, capacity_parcels}]` and `fleet_config_version`. Its legacy `capacity_parcels: 40` is the maximum permitted individual delivery size, not the capacity of every vehicle.
- `GET /api/v1/dispatch/fleet` adds the same version and each vehicle's name/capacity alongside availability, origin provenance and unresolved cargo. No local file path is returned.
- Broker `vehicle_ids` may be omitted to select the configured roster. Explicit unknown IDs and duplicate IDs are rejected. Up to ten selected IDs are supported. Historical accepted requests remain immutable.
- Manual create, saved-route reuse and simulated start enforce the selected vehicle's capacity. A manually ordered pickup/drop-off route loads and unloads each delivery in sequence; its total day volume may exceed capacity while every leg remains within capacity.
- Frozen broker snapshots include configuration version and vehicle capacities. Solver inputs, independent certificates, route memory policy and transactional materialization use those capacities. Final admission still checks availability and intervening trip changes.

The solver keeps the existing 3-second hybrid search and 1-second single-vehicle searches, at most 13 seconds of configured OR-Tools search with ten vehicles. The separated comparison examines at most 1,000 stable-order assignments. Setup, validation and geometry requests add wall time; these bounds are not an end-to-end response SLA. Results remain feasible candidates or explicit diagnostics, never a claim of globally optimal allocation.

## Task record and acceptance

Assigned scope: U19 local configurable fleet, supporting U02/U05/U06/U09/U10/U12 and R02/R05/R14/R18. Backend owner: delegated `u19_fleet_backend` agent; actual model identifier was not exposed to that agent. Lead owns shared requirements/action log and frontend integration. A separate reviewer owns independent review.

Owned files: `services/genesis/fleet_config.py`, `dispatch.py`, `broker_api.py`, `broker_runtime.py`, bounded changes to `broker_solver.py`, `route_memory.py` and `worker.py`, `tests/test_fleet_config.py`, and this guide. Dependencies: persistent Store transactions, existing cargo projection, independent broker certificate, shared dispatch metadata, frontend configuration consumers and SQLite recovery schema compatibility. Exclusions: hosted fleet CRUD/authentication, driver truth, heavy-truck routing, cargo transfer/recovery, benchmark changes, operator data edits, paid model calls and external messaging.

Acceptance covers default behavior; one/two/five/ten-vehicle configurations; malformed/duplicate/unknown IDs and capacities; manual creation/reuse/start capacity; broker capacity and no-trip diagnostics; API/worker version agreement; quiescent restart and old-process rejection; active manual reservations, queued plans, running trips and cargo locks; historical unknown cargo; idempotent record replay; bounded ten-vehicle strategy enumeration; and worker startup validation.

Verification on 2026-10-11 used temporary SQLite stores and deterministic road/provider fixtures. The initial fleet suite passed 34 cases; the added worker-startup and 30-node road-matrix boundary cases passed separately (36 fleet cases total). Targeted dispatch/broker/solver/route-memory regression initially exposed four fixture failures caused by an unresolved omitted-roster default; the request-model compatibility fix restored all 14 route-memory tests. Whole-diff inspection also caught and corrected the old 24-node matrix limit before review. Ruff passed the owned Python files. No operator database/configuration, provider API, SMTP server or live fleet was touched. Independent review and integrated-suite results are recorded by the lead in the work/review/action records; PostgreSQL runtime and production fleet suitability remain unverified.
