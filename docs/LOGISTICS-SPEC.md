# A11 logistics domain specification

Status: proposed implementation contract, selected by the user on 2026-10-10. This file and PLAN.md supersede A1 domain examples in earlier research. Numerical scope/limits are engineering assumptions to verify during W01, not measured results or commercial guarantees.

## 1 Product and scope

Build an observable delivery-planning workbench for a small fleet dispatcher. Mission: assign deliveries to vehicles, order visits under capacity and service-window constraints, compare a transparent baseline with a bounded solver candidate, simulate disruption, and inspect every agent's outputs and decisions. The business product is route planning; model tokens/cost remain a separate system-observability layer.

First dataset: one depot, 3–5 identical vans, 25–50 synthetic stops in a compact Montréal demonstration area, one working day, outbound deliveries only, one integer parcel-capacity dimension, service duration, hard service-start windows and return-to-depot shift end. No personal names, real addresses, live GPS or real dispatch. Dataset region is provisional; all coordinates and road-source permissions are recorded. Snap valid synthetic points to a driveable network and flag unreachable pairs rather than using straight lines as road evidence.

Exclude multi-depot, pickups/returns, real-time traffic feeds, driver-hours compliance, electric charging, vehicle-specific road restrictions, learned demand forecasting, unrestricted agent SQL/code, and autonomous contact with drivers. Add these only through a new contract. OSRM's default driving profile does not establish commercial-vehicle suitability; identical small demo vans avoid pretending to model truck restrictions.

## 2 Solver and AI boundary

Use OR-Tools RoutingModel for a capacitated vehicle-routing problem with time windows. The agents coordinate, diagnose and explain; typed deterministic tools generate matrices, solve routes, simulate events and independently check constraints. Never accept an LLM-generated sequence or arithmetic as a feasible route without the validator.

Use an OSRM table adapter for directed road distance/time matrices and route adapter for geometry. Freeze cached responses and road-data/profile/version/checksum in the experiment manifest. OSRM route/table data supplies a road baseline, not a live traffic feed; trip-service waypoint ordering does not solve this fleet problem. CI uses recorded/synthetic matrices. A small local routing-service profile or an explicitly permitted provider is evaluated in W01; public demo endpoints are not a production SLA or an offline dependency.

Publish four separate statuses: solver search outcome; independent feasibility; experiment simulation outcome; explanation validation. A time-limited feasible candidate is labeled feasible, not proven globally optimal. A timeout/no candidate is not proof of infeasibility. Record incumbent/bounds only if the solver actually supplies them. Retain initial and final objective, time/solution limits, parameters, seed where supported, runtime and version. Solver runs are CPU-bounded and cancellable separately from model budgets.

## 3 Five application agents

| Agent | Course-role mapping | Input and allowed tool | Required output and handoff |
|---|---|---|---|
| Planning | Coordinator | Mission, dataset and immutable constraint policy; dataset loader | Structured work order and allowed objectives; request traffic evidence; distribute assignments; publish only verified plan or verified diagnostic |
| Simulated traffic | Researcher | Matrix snapshot and permitted forecast descriptor; matrix/scenario tool | Versioned static planning forecast, assumptions and revealed-event refs; send to optimization/monitoring. Hidden evaluation schedule remains simulator-only |
| Optimization | Analyst | Work order, matrix and constraints; baseline constructor + OR-Tools adapter | Baseline/candidate route artifacts with objective components, unserved stops and search status; send to monitoring |
| Monitoring | Verifier | Candidate, source inputs, current simulation state and revealed events; validator/simulator | Feasibility certificate, predicted/current realized KPIs and issues; future simulation schedule remains inaccessible to the model |
| Exception | Exception handler | Monitoring report and policy; typed change-request tool | No-action verdict or bounded replan request with affected stops/vehicles and frozen completed work; send to optimization and planning |

Exception assesses every run, including an explicit no-action result for normal conditions, so it is genuinely observable across scenarios. Five roles have separate versioned prompts and schemas. Monitoring's route acceptance depends on independently recalculated constraints; its model may explain a certificate but cannot override a failing certificate. A separate development reviewer approves changes; it is not a sixth cosmetic application role.

Normal flow: planning -> traffic -> optimization -> monitoring -> exception -> planning finalization. Exception flow adds at most one optimization -> monitoring repair/replan cycle. Data/feasibility defects are reported as such and do not trigger unlimited model retries. Maximum 15 model calls, 24 tool calls, one replan, two retry attempts for transient requests, five-minute run wall timeout and 20 seconds per optimization search are initial spike limits. Log and tune these from measurements. Prices and budgets must be configured before live model calls; solver/fixture mode works without them.

## 4 Data records and units

| Entity | Required fields |
|---|---|
| Dataset | Immutable ID/hash, region, coordinate CRS EPSG:4326, timezone America/Toronto, service-day origin, seed, generator version, permission/license, depot/stops/fleet refs |
| Stop | Stable ID, `[longitude, latitude]`, demand integer parcels, nonnegative service seconds, service-start window `[earliest,latest]`, mandatory/optional flag, allowed penalty if optional |
| Vehicle | Stable ID, capacity parcels, start/end depot, shift start/end seconds from day origin, activation cost/rate policy |
| Matrix | Directed distances integer meters and durations integer seconds, index-to-location mapping, unreachable pairs, source/profile/version/hash, scenario ID, simulation assumptions |
| Route plan | Plan/version ID, parent plan if replan, input/matrix/policy IDs, vehicle visits with arrival/start/departure/load, depot return, geometry ref, unserved IDs, objective components, solver status and validation certificate |
| Simulation | Event ID, simulated time seconds, scenario/seed, disruption type, vehicle/stop/arc IDs, effect policy, before/after state, frozen route prefix and evaluation-version ID |
| Fleet metrics | Plan/scenario/policy IDs, planned versus realized simulated provenance, served/on-time/unserved counts, distance, time components, utilization, operating-cost estimate and emissions estimate with coverage |

The model execution clock is UTC actual time; the delivery simulation clock is seconds from service-day origin. Advancing replay of actual agent events does not advance vehicle positions unless an associated stored simulation event is selected. Route plan versions and simulated events are immutable artifacts linked to trace IDs. Model-routing policy IDs and vehicle route-policy IDs are different fields.

## 5 Constraint semantics

For each route, start and finish at the specified depot within the shift. Each served stop is visited exactly once across the fleet. Every mandatory stop must be served for a feasible full plan; optional stops can be omitted only under the stored penalty policy and remain prominently visible. No vehicle exceeds parcel capacity; outbound load starts with its assigned deliveries and decreases at service. All travel arcs must be reachable.

Compute arrival = previous departure + directed travel seconds; service start = max(arrival, earliest); departure = service start + service duration. Hard window constrains service start <= latest, not departure. Waiting and service count toward shift time. Report return-to-depot travel and time. Empty vehicles are unused and incur no activation cost unless the recorded policy explicitly says otherwise.

Objective: enforce hard feasibility, then minimize estimated fleet operating cost plus declared optional-stop penalties. Cost components and penalties use integer minor units in the solver, decimal values in reports, bounded to avoid overflow. Persist weights and rounding. No claim of lexicographic priority unless implemented/proven. Fleet operating cost = activation costs + distance rate × km + paid-time rate × route duty hours; per-km rate states whether fuel/maintenance is included. Penalties are artificial optimization preferences, not spent money, and are excluded from reported operating cost. Report service coverage and every omitted stop beside cost.

Infeasible/no-solution diagnostics can be a successful agent analysis if accepted as a diagnostic, while fleet plan feasibility remains false/unknown. Never equate `run.succeeded` with all deliveries completed or on time. A partially served route is labeled feasible_with_unserved only when omitted deliveries are authorized optional; mandatory omissions invalidate it. Do not silently relax capacity/windows to manufacture savings.

Initial certificate scope is the full depot-to-depot plan under its frozen planning matrix. Residual certificate scope is only the future suffix from each recorded effective checkpoint position/available time/current cargo to depot return, plus committed next-leg completion. It does not require a second initial depot departure. Preserve completed/pending stop partitions and all previous realized lateness/violations as immutable history. A feasible future suffix does not certify the already traveled day as fully on time or restore unserved mandatory orders. Unrecoverable cargo/mandatory omissions stay original-mission failures; a diagnostic may include useful feasible suffixes while full-service outcome remains failed. Cumulative simulation metrics combine executed prefix and suffix once and retain earlier violations.

## 6 Baseline and experiments

Baseline is a deterministic nearest-feasible-next heuristic with stable ID tie-break, capacity/windows/return-time checks and explicit unserved IDs. It is a reproducible comparison, not an asserted optimal or universally feasible algorithm. Candidate uses the same source inputs/constraints/cost definition under a fixed search budget. Validate both independently. A lower distance obtained by skipping deliveries is not improvement. Report paired feasible full-service results separately and all-run service coverage/failure rates alongside them; retain excluded pairs to avoid survivorship bias.

When a valid baseline exists, adopt a candidate only if it preserves mandatory service, passes independent validation and has no worse comparable declared objective. Otherwise retain the baseline and expose the rejected candidate with reason. Optional-stop omissions must remain visible and follow the same penalty policy. This admission rule applies to the frozen planning snapshot; later simulated outcomes can still be worse and must be reported honestly. When neither plan is valid, return a diagnostic rather than selecting the cheaper invalid plan.

Minimum 20 actual multiagent executions: five scenarios × two logistics policies (`baseline_only`, `solver_with_one_replan`) × two paired seeds. Target 50 at five paired seeds if budget permits. Every run includes the five roles; baseline policy's exception proposes a diagnostic without applying replan. Model tiering stays fixed across the logistics-policy experiment. A separate secondary model-tier ablation uses additional runs and explicit manifests; it does not get conflated with the primary route-policy comparison.

Scenarios: S01 nominal day; S02 clustered congestion snapshot; S03 tight/incompatible mandatory windows; S04 vehicle unavailable under a fixed simulated incident schedule, handled at a safe stop-boundary; S05 one new order introduced under a fixed schedule, handled at a safe stop-boundary. Paired policies receive the same initial fleet/data and exogenous event IDs/times/effects; their later positions can differ because routes differ. Declare the same next-safe-boundary reaction rule and record each actual reaction time. Primary experiments evaluate both from the same event manifest, not from whichever route looks better.

Initial planning uses a frozen static scenario matrix. Dynamic effects are evaluated by a deterministic simulator; at a configured safe stop-boundary checkpoint, one replan uses a new frozen matrix/state. Freeze completed stops and the current leg/prefix; residual vehicles start from their checkpoint positions with remaining load and shift. The new order must be loaded at the depot by an eligible vehicle; it cannot appear in a van already carrying unrelated stock. If no admissible reload/residual plan fits, expose an unserved diagnostic. This is a bounded snapshot approximation, not a continuous time-dependent traffic optimizer.

Onboard deliveries stay assigned to their carrying vehicle until a modeled depot reload. MVP excludes roadside transfers/rescue; a broken-down van's undelivered onboard stops become explicitly unserved. Do not assign its cargo to a healthy van by changing only a solver index. Idle depot vehicles may load eligible remaining orders using an explicit loading-time event. Replanning preserves leg-in-progress commitment and completed prefix; feasibility includes these physical restrictions.

For a healthy vehicle in a committed leg when another incident is assessed, its residual start is the next committed stop with an explicit available time after that leg/service, not a fabricated instantaneous node or position. A stop-boundary outage is a simulation simplification; it does not model a mid-road breakdown. Record these approximation limits beside scenario results.

Residual requests/results carry a simulation-state hash. Before adoption, require the result's hash to match current state; reject stale results instead of overwriting newer vehicle state. The first demo uses stepwise simulation paused at planning checkpoints and explicitly assumes zero simulated decision delay, while showing actual solver/agent runtime separately. Any later experiment modeling decision delay must advance both policy simulations consistently and revalidate effective start times; it is a separate recorded setting.

## 7 Simulation and metrics

Traffic is a labeled model with a versioned seed, multiplier policy, affected directed arcs/region/time intervals and scenario assumptions. Specify whether each leg uses departure-time conditions and holds them fixed for that leg. Keep matrix and actual simulated travel separate. Never present these values as measured real congestion or a real ETA guarantee. Same manifests reconstruct the same simulated events; time-limited solver choices may vary, so preserve actual solutions rather than promising identical optima.

The complete exogenous evaluation-event schedule/seed is private to the simulator and test harness during execution. Agent prompts/tools receive only the allowed initial forecast and events revealed by simulated time. Traffic's tool may store a sealed manifest reference server-side; it never returns future-event contents to traffic, planning, optimizer, monitoring or exception models. Test hidden markers/timestamps against all role inputs and reject future-event reads. Completed-run playback may use stored events to reconstruct the past; active simulation endpoints return revealed events only, and as-of replay hides future artifacts.

- Distance km: sum directed road meters for all driven legs, including depot return and replan prefixes, once. Visual geometry length is not the accounting source.
- On-time rate: serviced stops whose simulated service start <= promised latest / all serviced stops. Show mandatory/optional and served/total coverage beside it; unserved stops never make service look better silently.
- Lateness minutes: max(0, service start - latest) for serviced stops under realized simulated conditions. Planned hard windows can pass while disruption makes realized service late.
- Vehicle utilization: assigned parcel load / capacity at departure and duty time / available shift time, as two separately named measures. Do not merge them into an unexplained percentage.
- Operating cost: route-level rates/components above, reported as estimated CAD with price/rate version; separate from model API spend, artificial penalties and optimizer CPU time.
- Emissions: optional transparent operational CO2e estimate `distance_km × documented kg_CO2e_per_km`; show factor source/year/vehicle assumptions and coverage. Until a suitable factor is verified, use a visibly synthetic test coefficient or unavailable. Never call this audited emissions, lifecycle accounting or measured emissions savings.
- Improvement: paired absolute and percent change for comparable outcomes; baseline zero yields undefined percent. Always show coverage and constraints; no promised savings percentage in planning.

## 8 Tools and interfaces

Initial typed tools: dataset loader, matrix/scenario builder, route planner (baseline + OR-Tools), independent route validator/simulator, and bounded exception-request validator. These are observable invocations; do not build separate services for each helper. Independent validation recomputes from input records and plan visits, not solver-reported totals.

Extend DATA-CONTRACT APIs with dataset/scenario listings, authorized route-plan/geometry fetch, fleet metrics, simulation event history and comparison. New missions receive dataset/scenario/policy IDs, never arbitrary URLs or code. Artifact hashes/cursors/project authorization remain shared. Map UI requests stored plan geometry; it does not directly call routing/geocoding services with private inputs.

MapLibre GL JS displays route/stop/vehicle layers plus a synchronized visit table. Map attribution and provider policy remain visible. Local fixture mode has a packaged simplified demo background and stored route geometry, so it functions without public tiles. A configured basemap provider is optional with terms/attribution/limits documented; OpenStreetMap data licensing and its public tile-server usage policy are distinct. No bulk downloads from public tile servers.

## 9 Logistics acceptance gates

Test tiny instances with hand-verifiable routes, directed asymmetric matrices, unreachable stops, service-time/window boundaries, wait/return shifts, overload, duplicate/missing stop IDs, authorized optional omissions, a zero baseline, no candidate vs proven status, and independent recomputation. Test solver timeout/cancellation/process recovery alongside existing trace/budget tests.

Disruption tests preserve completed work, vehicle positions, loading feasibility, one-replan cap, future-event invisibility and cumulative cost/distance without duplicating route prefixes. Map selections link to exact stop/vehicle/artifact IDs; route polylines are stored road paths, with schematic fixture paths explicitly labeled. UI works with WebGL/tiles unavailable through the same textual route table. All six required observatory views remain present alongside the map and fleet KPIs.

Add explicit tests for unequal per-policy evolved state under equal exogenous schedules, future-event access denial, and a late completed prefix followed by a feasible residual suffix whose cumulative outcome remains late/incomplete. Initial and residual certificate scopes must be visibly distinct in artifacts and UI.

The original synthetic benchmark exclusions apply to S01–S05 workflows. User-approved U09 adds a separate address/pickup operator extension; see DISPATCH.md for its street geometry, simulation provenance and company-release limits. It does not alter the original paired benchmark contracts.
