"""Deterministic evaluation; sealed schedules are never part of planning inputs."""

from .metrics import cad
from .models import Dataset, Stop, content_hash
from .scenarios import ALIASES, rehash
from .solver import _plan, _route, validate_plan


def _manifest(scenario_id, seed):
    # Only the simulator owns this schedule. Public dataset seed is not an event payload.
    jitter = int(content_hash({"evaluation": "v1", "paired_seed": seed})[:4], 16) % 121
    time = 900 + jitter
    if scenario_id == "S02":
        return [
            {
                "id": "congestion-1",
                "sim_time_s": time,
                "kind": "congestion",
                "multiplier": 2,
                "until_s": 7200,
            }
        ]
    if scenario_id == "S04":
        return [
            {
                "id": "outage-1",
                "sim_time_s": time,
                "kind": "vehicle_unavailable",
                "vehicle_id": "van-1",
            }
        ]
    if scenario_id == "S05":
        return [
            {
                "id": "new-order-1",
                "sim_time_s": time,
                "kind": "new_order",
                "stop_id": "new-order-01",
            }
        ]
    return []


def revealed_events(scenario_id, seed, as_of_s):
    """Only return occurred events; no manifest/seed or future cursor escapes."""
    return [
        dict(e)
        for e in _manifest(ALIASES.get(scenario_id, scenario_id), seed)
        if e["sim_time_s"] <= as_of_s
    ]


def _reload_dataset(dataset, vehicle, new_stop, departure_s):
    van = vehicle.model_copy(update={"shift_start_s": departure_s})
    # The new synthetic point is exactly one grid step east and north of the depot.
    return rehash(
        Dataset(
            id=f"{dataset.id}-reload",
            scenario_id=dataset.scenario_id,
            seed=dataset.seed,
            depot=dataset.depot,
            stops=[new_stop],
            vehicles=[van],
            location_ids=[dataset.depot.id, new_stop.id],
            distance_m=[[0, 620], [665, 0]],
            duration_s=[[0, 104], [111, 0]],
            road_source=dataset.road_source,
        )
    )


def validate_reload(
    dataset, original_plan, state, expected_state_hash, reload_dataset, reload_plan
):
    """Validate a depot-only residual addition; carrying vehicles stay untouched."""
    # Numerical checks use the depot-only addition's full local route, while the
    # certificate fingerprint identifies the exact stored residual artifact.
    local_plan = reload_plan.model_copy(
        update={"scope": "initial_full_plan", "parent_plan_id": None}
    )
    check = validate_plan(reload_dataset, local_plan).model_dump(mode="json")
    issues = list(check["issues"])
    if content_hash(state) != expected_state_hash:
        issues.append("Stale simulation-state hash")
    if state.get("plan_hash") != content_hash(original_plan):
        issues.append("Frozen original routes changed")
    originals = {v.id: v for v in dataset.vehicles}
    active = {r.vehicle_id for r in original_plan.routes if r.stop_ids}
    for route in reload_plan.routes:
        if route.vehicle_id in active or route.vehicle_id not in state.get(
            "idle_depot_vehicle_ids", []
        ):
            issues.append("Cargo/depot lock: vehicle is not an unused depot vehicle")
        vehicle = originals.get(route.vehicle_id)
        if vehicle is None:
            issues.append("Unknown original vehicle")
        else:
            residual_vehicle = next(v for v in reload_dataset.vehicles if v.id == route.vehicle_id)
            if (
                residual_vehicle.capacity != vehicle.capacity
                or residual_vehicle.shift_end_s != vehicle.shift_end_s
            ):
                issues.append("Residual vehicle capacity/shift changed")
            if "revealed_order" not in state:
                issues.append("Missing revealed new-order source")
            else:
                expected = _reload_dataset(
                    dataset,
                    vehicle,
                    Stop.model_validate(state["revealed_order"]),
                    state["sim_time_s"] + 120,
                )
                if expected.input_hash != reload_dataset.input_hash:
                    issues.append(
                        "Residual inputs differ from original fleet/revealed order/loading state"
                    )
        if route.departure_s < state["sim_time_s"] + 120:
            issues.append("Depot loading time omitted")
    check.update(
        scope="residual_suffix",
        valid=not issues,
        issues=issues,
        plan_hash=content_hash(reload_plan),
        state_hash=expected_state_hash,
        frozen_plan_hash=content_hash(original_plan),
        prior_violations=state.get("prior_violations", []),
        scope_description="New depot-loaded order only; original vehicle commitments preserved; does not recertify realized prefix.",
    )
    return check


def simulate_plan(dataset: Dataset, plan, scenario_id, seed, allow_replan=False) -> dict:
    scenario_id = ALIASES.get(scenario_id, scenario_id)
    if scenario_id != dataset.scenario_id or seed != dataset.seed:
        raise ValueError("Simulation must match the dataset scenario and paired seed")
    manifest = _manifest(scenario_id, seed)
    events = [dict(e, exogenous=True) for e in manifest]
    stops = {s.id: s for s in dataset.stops}
    vehicles = {v.id: v for v in dataset.vehicles}
    indices = {s: i for i, s in enumerate(dataset.location_ids)}
    served = {}
    route_metrics = []
    violations = []
    diagnostics = []
    replan_certificate = None
    replan_plan = None
    replan_dataset = None
    replan_applied = False
    original_certificate = validate_plan(dataset, plan)
    outage = next((e for e in manifest if e["kind"] == "vehicle_unavailable"), None)
    congestion = next((e for e in manifest if e["kind"] == "congestion"), None)
    if len({r.vehicle_id for r in plan.routes}) != len(plan.routes) or len(
        [s for r in plan.routes for s in r.stop_ids]
    ) != len({s for r in plan.routes for s in r.stop_ids}):
        raise ValueError("Simulation rejects duplicate vehicles/stops")

    def travel_time(source, target, departure):
        t = dataset.duration_s[source][target]
        if t is None:
            raise ValueError("Cannot simulate unreachable route arc")
        if (
            congestion
            and congestion["sim_time_s"] <= departure < congestion["until_s"]
            and target >= 1
            and (target - 1) % 7 >= 4
        ):
            t *= congestion["multiplier"]
        return t

    for route in plan.routes:
        v = vehicles[route.vehicle_id]
        now, node = v.shift_start_s, 0
        load = sum(stops[s].demand for s in route.stop_ids)
        initial_load = load
        distance = travel = waiting = service = 0
        stranded = False
        events.append(
            dict(
                id=f"departure-{v.id}", kind="departure", sim_time_s=now, vehicle_id=v.id, load=load
            )
        )

        def apply_outage_at_boundary():
            if not outage or outage["vehicle_id"] != v.id or now < outage["sim_time_s"]:
                return False
            events.append(
                dict(
                    id=f"outage-applied-{v.id}",
                    kind="outage_applied",
                    sim_time_s=now,
                    vehicle_id=v.id,
                    location_id=dataset.location_ids[node],
                    onboard_unserved=[s for s in route.stop_ids if s not in served],
                    load=load,
                    reaction_rule="next safe completed-service boundary; no cargo transfer",
                )
            )
            violations.append(dict(kind="vehicle_unavailable", vehicle_id=v.id, sim_time_s=now))
            return True

        for sid in route.stop_ids:
            if apply_outage_at_boundary():
                stranded = True
                break
            stop, target = stops[sid], indices[sid]
            seconds = travel_time(node, target, now)
            distance += dataset.distance_m[node][target]
            travel += seconds
            arrival = now + seconds
            start = max(arrival, stop.earliest_s)
            waiting += start - arrival
            service += stop.service_s
            late = max(0, start - stop.latest_s)
            if late:
                violations.append(
                    dict(kind="late_service", stop_id=sid, sim_time_s=start, late_s=late)
                )
            load -= stop.demand
            served[sid] = {"service_start_s": start, "late_s": late, "vehicle_id": v.id}
            events.append(
                dict(
                    id=f"service-{sid}",
                    kind="service",
                    sim_time_s=start,
                    vehicle_id=v.id,
                    stop_id=sid,
                    arrival_s=arrival,
                    departure_s=start + stop.service_s,
                    late_s=late,
                    load_after=load,
                    coordinates=stop.coordinates,
                )
            )
            now, node = start + stop.service_s, target
        if not stranded and route.stop_ids:
            stranded = apply_outage_at_boundary()
        if not stranded:
            seconds = travel_time(node, 0, now)
            distance += dataset.distance_m[node][0]
            travel += seconds
            now += seconds
            events.append(
                dict(id=f"return-{v.id}", kind="depot_return", sim_time_s=now, vehicle_id=v.id)
            )
            if now > v.shift_end_s:
                violations.append(dict(kind="shift_return", vehicle_id=v.id, sim_time_s=now))
        duty = now - v.shift_start_s
        cost = (
            v.activation_cents + distance * v.distance_cents_per_m + duty * v.time_cents_per_s
            if route.stop_ids
            else 0
        )
        route_metrics.append(
            dict(
                vehicle_id=v.id,
                distance_m=distance,
                travel_s=travel,
                service_s=service,
                waiting_s=waiting,
                duty_s=duty,
                operating_cost_cents=cost,
                initial_load=initial_load,
                parcel_utilization=initial_load / v.capacity,
                shift_utilization=duty / (v.shift_end_s - v.shift_start_s),
                stranded=stranded,
                remaining_load=load,
            )
        )

    new_event = next((e for e in manifest if e["kind"] == "new_order"), None)
    if new_event:
        at = new_event["sim_time_s"]
        new_stop = Stop(
            id=new_event["stop_id"],
            label="Commande révélée",
            coordinates=(
                dataset.depot.coordinates[0] + 0.004,
                dataset.depot.coordinates[1] + 0.003,
            ),
            demand=3,
            service_s=150,
            earliest_s=at,
            latest_s=at + 3600,
        )
        stops[new_stop.id] = new_stop
        for event in events:
            if event["id"] == new_event["id"]:
                event["revealed_order"] = new_stop.model_dump(mode="json")
        active = {r.vehicle_id for r in plan.routes if r.stop_ids}
        idle = [
            v
            for v in dataset.vehicles
            if v.id not in active and v.capacity >= new_stop.demand and v.shift_start_s <= at
        ]
        if allow_replan and idle:
            state = dict(
                sim_time_s=at,
                plan_hash=content_hash(plan),
                idle_depot_vehicle_ids=[v.id for v in idle],
                revealed_order=new_stop.model_dump(mode="json"),
                completed_stop_ids=sorted(
                    e["stop_id"]
                    for e in events
                    if e["kind"] == "service" and e["departure_s"] <= at
                ),
                prior_violations=[x for x in violations if x["sim_time_s"] <= at],
                reaction_rule="depot-idle vehicle only; every existing current leg and cargo assignment remains committed",
            )
            state_hash = content_hash(state)
            v = idle[0]
            residual_data = _reload_dataset(dataset, v, new_stop, at + 120)
            residual_route = _route(residual_data, residual_data.vehicles[0], [new_stop.id])
            residual_plan = _plan(
                residual_data, [residual_route], "depot_reload_once", "feasible_candidate"
            )
            residual_plan = residual_plan.model_copy(
                update={"scope": "residual_suffix", "parent_plan_id": plan.id}
            )
            replan_certificate = validate_reload(
                dataset, plan, state, state_hash, residual_data, residual_plan
            )
            if replan_certificate["valid"]:
                replan_applied = True
                replan_plan = residual_plan.model_dump(mode="json")
                replan_dataset = residual_data.model_dump(mode="json")
                visit = residual_route.visits[0]
                served[new_stop.id] = dict(
                    service_start_s=visit.service_start_s, late_s=0, vehicle_id=v.id
                )
                events.extend(
                    [
                        dict(
                            id="reload-start",
                            kind="depot_loading",
                            sim_time_s=at,
                            vehicle_id=v.id,
                            stop_id=new_stop.id,
                            duration_s=120,
                            state_hash=state_hash,
                        ),
                        dict(
                            id="reload-departure",
                            kind="departure",
                            sim_time_s=at + 120,
                            vehicle_id=v.id,
                            load=3,
                        ),
                        dict(
                            id="reload-service",
                            kind="service",
                            sim_time_s=visit.service_start_s,
                            vehicle_id=v.id,
                            stop_id=new_stop.id,
                            arrival_s=visit.arrival_s,
                            departure_s=visit.departure_s,
                            late_s=0,
                            load_after=0,
                            coordinates=new_stop.coordinates,
                        ),
                        dict(
                            id="reload-return",
                            kind="depot_return",
                            sim_time_s=residual_route.return_s,
                            vehicle_id=v.id,
                        ),
                    ]
                )
                # Paid loading is real duty; validator checks the travel suffix separately.
                duty = residual_route.duty_s + 120
                route_metrics.append(
                    dict(
                        vehicle_id=v.id,
                        distance_m=residual_route.distance_m,
                        travel_s=residual_route.travel_s,
                        service_s=residual_route.service_s,
                        waiting_s=0,
                        loading_s=120,
                        duty_s=duty,
                        operating_cost_cents=residual_route.operating_cost_cents
                        + 120 * v.time_cents_per_s,
                        initial_load=3,
                        parcel_utilization=3 / v.capacity,
                        shift_utilization=duty / (v.shift_end_s - v.shift_start_s),
                        stranded=False,
                        remaining_load=0,
                    )
                )
            else:
                diagnostics.append("Residual depot reload rejected by independent certificate.")
        if not replan_applied:
            diagnostics.append(
                "New mandatory order remains unserved: replan disabled or no eligible unused depot vehicle."
            )
    elif allow_replan:
        diagnostics.append(
            "Exception assessed: no safe beneficial depot-only replan; onboard cargo and committed legs retained."
        )
    missing = sorted(set(stops) - set(served))
    mandatory_total = sum(s.mandatory for s in stops.values())
    mandatory_served = sum(stops[s].mandatory for s in served)
    on_time = sum(x["late_s"] == 0 for x in served.values())
    total_distance = sum(r["distance_m"] for r in route_metrics)
    metrics = dict(
        distance_km=total_distance / 1000,
        fleet_cost_cad=cad(sum(r["operating_cost_cents"] for r in route_metrics)),
        served=len(served),
        total=len(stops),
        on_time=on_time / len(served) if served else None,
        on_time_count=on_time,
        late_minutes=sum(x["late_s"] for x in served.values()) / 60,
        mandatory_served=mandatory_served,
        mandatory_total=mandatory_total,
        unserved_ids=missing,
        utilization=sum(r["initial_load"] for r in route_metrics)
        / sum(v.capacity for v in dataset.vehicles),
        shift_utilization=sum(r["duty_s"] for r in route_metrics)
        / sum(v.shift_end_s - v.shift_start_s for v in dataset.vehicles),
        emissions_kg_co2e=None,
        emissions_coverage=0,
        routes=route_metrics,
        full_service=mandatory_served == mandatory_total,
        violations=violations,
        outcome="completed_on_time"
        if mandatory_served == mandatory_total and not violations and original_certificate.valid
        else "service_diagnostic",
    )
    return dict(
        events=sorted(events, key=lambda e: (e["sim_time_s"], e["id"])),
        metrics=metrics,
        provenance="deterministic synthetic simulation; not measured traffic or live dispatch",
        manifest_hash=content_hash(manifest),
        simulation_version="departure-fixed-v1",
        simulation_complete=True,
        replan_applied=replan_applied,
        replan_count=int(replan_applied),
        replan_certificate=replan_certificate,
        replan_plan=replan_plan,
        replan_dataset=replan_dataset,
        diagnostics=diagnostics,
        assumptions=[
            "Each leg holds departure-time congestion for its duration.",
            "Outage is applied at the next completed-service boundary; cargo stays stranded.",
            "One bounded replan can load one new order on an unused depot van; no roadside rescue or route resequencing.",
            "Zero simulated decision delay; actual solver/agent duration is a separate clock.",
        ],
    )
