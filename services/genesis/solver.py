"""Bounded CVRPTW search and a sequence-based independent certificate."""

from collections import Counter
import time
import uuid

from .models import Certificate, Dataset, Plan, Route, Visit, content_hash
from .roads import schematic_geometry


def _route(dataset, vehicle, stop_ids):
    stops = {s.id: s for s in dataset.stops}
    indices = {s: i for i, s in enumerate(dataset.location_ids)}
    load = sum(stops[s].demand for s in stop_ids)
    initial = load
    now = vehicle.shift_start_s
    previous = 0
    distance = travel = service = waiting = 0
    visits = []
    for sid in stop_ids:
        stop, node = stops[sid], indices[sid]
        seconds, meters = dataset.duration_s[previous][node], dataset.distance_m[previous][node]
        if seconds is None or meters is None:
            raise ValueError("unreachable route arc")
        arrival = now + seconds
        start = max(arrival, stop.earliest_s)
        now = start + stop.service_s
        load -= stop.demand
        visits.append(
            Visit(
                stop_id=sid,
                arrival_s=arrival,
                service_start_s=start,
                departure_s=now,
                load_after=load,
            )
        )
        travel += seconds
        distance += meters
        service += stop.service_s
        waiting += start - arrival
        previous = node
    seconds, meters = dataset.duration_s[previous][0], dataset.distance_m[previous][0]
    if seconds is None or meters is None:
        raise ValueError("unreachable depot return")
    now += seconds
    travel += seconds
    distance += meters
    duty = now - vehicle.shift_start_s
    cost = (
        (
            vehicle.activation_cents
            + distance * vehicle.distance_cents_per_m
            + duty * vehicle.time_cents_per_s
        )
        if stop_ids
        else 0
    )
    points = (
        [dataset.depot.coordinates]
        + [stops[s].coordinates for s in stop_ids]
        + [dataset.depot.coordinates]
    )
    return Route(
        vehicle_id=vehicle.id,
        stop_ids=stop_ids,
        visits=visits,
        departure_s=vehicle.shift_start_s,
        return_s=now,
        initial_load=initial,
        distance_m=distance,
        travel_s=travel,
        service_s=service,
        waiting_s=waiting,
        duty_s=duty,
        operating_cost_cents=cost,
        geometry=schematic_geometry(points),
    )


def _plan(dataset, routes, policy, status, **kwargs):
    served = {s for r in routes for s in r.stop_ids}
    unserved = [s.id for s in dataset.stops if s.id not in served]
    cost = sum(r.operating_cost_cents for r in routes)
    penalty = sum(s.penalty_cents for s in dataset.stops if s.id in unserved and not s.mandatory)
    return Plan(
        id=str(uuid.uuid4()),
        input_hash=dataset.input_hash,
        matrix_hash=dataset.matrix_hash,
        policy=policy,
        routes=routes,
        unserved_ids=unserved,
        distance_m=sum(r.distance_m for r in routes),
        operating_cost_cents=cost,
        penalty_cents=penalty,
        objective_cents=cost + penalty,
        solver_status=status,
        **kwargs,
    )


def baseline_plan(dataset: Dataset) -> Plan:
    remaining = {s.id: s for s in dataset.stops}
    indices = {s: i for i, s in enumerate(dataset.location_ids)}
    routes = []
    for vehicle in dataset.vehicles:
        ids, node, now, load = [], 0, vehicle.shift_start_s, 0
        while remaining:
            choices = []
            for sid, stop in remaining.items():
                nxt = indices[sid]
                t, back = dataset.duration_s[node][nxt], dataset.duration_s[nxt][0]
                if t is None or back is None:
                    continue
                start = max(now + t, stop.earliest_s)
                if (
                    load + stop.demand <= vehicle.capacity
                    and start <= stop.latest_s
                    and start + stop.service_s + back <= vehicle.shift_end_s
                ):
                    choices.append((dataset.distance_m[node][nxt], sid, start, nxt))
            if not choices:
                break
            _, sid, start, node = min(choices)
            stop = remaining.pop(sid)
            ids.append(sid)
            load += stop.demand
            now = start + stop.service_s
        if ids:
            routes.append(_route(dataset, vehicle, ids))
    return _plan(
        dataset,
        routes,
        "nearest_feasible_next",
        "heuristic_complete",
        diagnostics=["Deterministic nearest feasible next; no optimality or infeasibility proof."],
    )


def optimize_plan(dataset: Dataset, time_limit_s=2) -> Plan:
    import ortools
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2

    if not 0 < time_limit_s <= 20:
        raise ValueError("solver limit must be in (0,20] seconds")
    started = time.perf_counter()
    manager = pywrapcp.RoutingIndexManager(len(dataset.location_ids), len(dataset.vehicles), 0)
    routing = pywrapcp.RoutingModel(manager)
    stops = [None] + dataset.stops
    horizon = max(v.shift_end_s for v in dataset.vehicles)

    def duration(a, b):
        i, j = manager.IndexToNode(a), manager.IndexToNode(b)
        travel = dataset.duration_s[i][j]
        return (travel if travel is not None else horizon + 1) + (stops[i].service_s if i else 0)

    tid = routing.RegisterTransitCallback(duration)
    routing.AddDimension(tid, horizon, horizon, False, "Time")
    td = routing.GetDimensionOrDie("Time")
    for i, stop in enumerate(dataset.stops, 1):
        idx = manager.NodeToIndex(i)
        if stop.earliest_s > horizon:
            if stop.mandatory:
                return _plan(
                    dataset,
                    [],
                    "ortools",
                    "no_candidate",
                    diagnostics=["Mandatory time window outside shift; no candidate returned."],
                )
            routing.AddDisjunction([idx], stop.penalty_cents)
            routing.ActiveVar(idx).SetValue(0)
            continue
        td.CumulVar(idx).SetRange(stop.earliest_s, min(stop.latest_s, horizon))
        if not stop.mandatory:
            routing.AddDisjunction([idx], stop.penalty_cents)
    did = routing.RegisterUnaryTransitCallback(
        lambda a: stops[manager.IndexToNode(a)].demand if manager.IndexToNode(a) else 0
    )
    routing.AddDimensionWithVehicleCapacity(
        did, 0, [v.capacity for v in dataset.vehicles], True, "Capacity"
    )
    # Cost uses exact integer cents; time dimension span includes waiting and service.
    for vi, vehicle in enumerate(dataset.vehicles):

        def distance_cost(a, b, rate=vehicle.distance_cents_per_m):
            value = dataset.distance_m[manager.IndexToNode(a)][manager.IndexToNode(b)]
            return (value if value is not None else 100000000) * rate

        cid = routing.RegisterTransitCallback(distance_cost)
        routing.SetArcCostEvaluatorOfVehicle(cid, vi)
        routing.SetFixedCostOfVehicle(vehicle.activation_cents, vi)
        td.CumulVar(routing.Start(vi)).SetRange(vehicle.shift_start_s, vehicle.shift_start_s)
        td.CumulVar(routing.End(vi)).SetRange(vehicle.shift_start_s, vehicle.shift_end_s)
        td.SetSpanCostCoefficientForVehicle(vehicle.time_cents_per_s, vi)
        routing.AddVariableMinimizedByFinalizer(td.CumulVar(routing.End(vi)))
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    params.time_limit.FromMilliseconds(int(time_limit_s * 1000))
    solution = routing.SolveWithParameters(params)
    meta = dict(
        solver_runtime_ms=round((time.perf_counter() - started) * 1000, 3),
        solver_version=ortools.__version__,
        search_limit_s=time_limit_s,
    )
    if not solution:
        return _plan(
            dataset,
            [],
            "ortools",
            "no_candidate",
            diagnostics=[
                f"Search status {routing.status()}; no returned candidate is not an infeasibility proof."
            ],
            **meta,
        )
    routes = []
    for vi, vehicle in enumerate(dataset.vehicles):
        idx, ids = routing.Start(vi), []
        while not routing.IsEnd(idx):
            node = manager.IndexToNode(idx)
            if node:
                ids.append(dataset.location_ids[node])
            idx = solution.Value(routing.NextVar(idx))
        if ids:
            routes.append(_route(dataset, vehicle, ids))
    return _plan(
        dataset,
        routes,
        "ortools",
        "feasible_candidate",
        diagnostics=["Bounded search; global optimality not proven."],
        **meta,
    )


def validate_plan(dataset: Dataset, plan: Plan) -> Certificate:
    """Recompute all constraints and costs from source records, never solver totals."""
    issues = []
    if plan.scope != "initial_full_plan":
        issues.append(
            "Residual suffix requires checkpoint-specific validation; cannot certify a full day."
        )
    expected_matrix = content_hash(
        {
            "ids": dataset.location_ids,
            "distance": dataset.distance_m,
            "duration": dataset.duration_s,
        }
    )
    expected_input = content_hash(dataset.model_dump(mode="json", exclude={"input_hash"}))
    if dataset.matrix_hash != expected_matrix or dataset.input_hash != expected_input:
        issues.append("Dataset hash mismatch")
    if plan.input_hash != dataset.input_hash or plan.matrix_hash != dataset.matrix_hash:
        issues.append("Plan input/matrix hash mismatch")
    stops = {s.id: s for s in dataset.stops}
    vehicles = {v.id: v for v in dataset.vehicles}
    indices = {s: i for i, s in enumerate(dataset.location_ids)}
    visited = []
    used = set()
    distance_total = cost_total = 0
    for route in plan.routes:
        if route.vehicle_id not in vehicles or route.vehicle_id in used:
            issues.append(f"Unknown or duplicate vehicle {route.vehicle_id}")
            continue
        used.add(route.vehicle_id)
        v = vehicles[route.vehicle_id]
        if any(s not in stops for s in route.stop_ids):
            issues.append(f"Unknown stop on {v.id}")
            continue
        visited.extend(route.stop_ids)
        load = sum(stops[s].demand for s in route.stop_ids)
        if load > v.capacity:
            issues.append(f"Capacity exceeded on {v.id}: {load}>{v.capacity}")
        if route.initial_load != load:
            issues.append(f"Initial cargo differs on {v.id}")
        if route.departure_s != v.shift_start_s:
            issues.append(f"Departure differs from fixed shift start on {v.id}")
        now, previous = v.shift_start_s, 0
        distance = travel = service = waiting = 0
        expected_visits = []
        for sid in route.stop_ids:
            stop, node = stops[sid], indices[sid]
            t, d = dataset.duration_s[previous][node], dataset.distance_m[previous][node]
            if t is None or d is None:
                issues.append(f"Unreachable arc {dataset.location_ids[previous]} -> {sid}")
                previous = node
                continue
            arrival = now + t
            start = max(arrival, stop.earliest_s)
            if start > stop.latest_s:
                issues.append(f"Window violation at {sid}: {start}>{stop.latest_s}")
            now = start + stop.service_s
            load -= stop.demand
            expected_visits.append(
                dict(
                    stop_id=sid,
                    arrival_s=arrival,
                    service_start_s=start,
                    departure_s=now,
                    load_after=load,
                )
            )
            distance += d
            travel += t
            waiting += start - arrival
            service += stop.service_s
            previous = node
        t, d = dataset.duration_s[previous][0], dataset.distance_m[previous][0]
        if t is None or d is None:
            issues.append(f"Unreachable depot return on {v.id}")
        else:
            distance += d
            travel += t
            now += t
        if now > v.shift_end_s:
            issues.append(f"Shift return violation on {v.id}")
        if [x.model_dump() for x in route.visits] != expected_visits:
            issues.append(f"Visit times/cargo mismatch on {v.id}")
        duty = now - v.shift_start_s
        cost = (
            v.activation_cents + distance * v.distance_cents_per_m + duty * v.time_cents_per_s
            if route.stop_ids
            else 0
        )
        for field, expected in {
            "distance_m": distance,
            "travel_s": travel,
            "service_s": service,
            "waiting_s": waiting,
            "duty_s": duty,
            "return_s": now,
            "operating_cost_cents": cost,
        }.items():
            if getattr(route, field) != expected:
                issues.append(f"{field} mismatch on {v.id}")
        distance_total += distance
        cost_total += cost
    counts = Counter(visited)
    for sid, count in counts.items():
        if count != 1:
            issues.append(f"Duplicate stop {sid}")
    missing = set(stops) - set(visited)
    if set(plan.unserved_ids) != missing or len(plan.unserved_ids) != len(missing):
        issues.append("Unserved stop declaration mismatch")
    for sid in sorted(missing):
        if stops[sid].mandatory:
            issues.append(f"Mandatory stop unserved: {sid}")
    penalties = sum(stops[s].penalty_cents for s in missing if not stops[s].mandatory)
    if (plan.distance_m, plan.operating_cost_cents, plan.penalty_cents, plan.objective_cents) != (
        distance_total,
        cost_total,
        penalties,
        cost_total + penalties,
    ):
        issues.append("Plan totals/objective mismatch")
    valid = not issues
    return Certificate(
        scope=plan.scope,
        valid=valid,
        issues=issues,
        input_hash=dataset.input_hash,
        matrix_hash=dataset.matrix_hash,
        plan_hash=content_hash(plan),
        served=len(set(visited)),
        total=len(stops),
        mandatory_served=sum(s.mandatory and s.id in counts for s in dataset.stops),
        mandatory_total=sum(s.mandatory for s in dataset.stops),
        recomputed_distance_m=distance_total,
        recomputed_operating_cost_cents=cost_total,
        recomputed_objective_cents=cost_total + penalties,
        feasible_status=("feasible_with_unserved" if missing else "feasible")
        if valid
        else "invalid",
    )


def select_plan(dataset, baseline, candidate):
    a = validate_plan(dataset, baseline)
    b = validate_plan(dataset, candidate) if candidate is not None else None
    if (
        b
        and b.valid
        and (not a.valid or b.recomputed_objective_cents <= a.recomputed_objective_cents)
    ):
        return (
            candidate,
            "Candidate independently valid; comparable objective no worse than valid baseline.",
        )
    if a.valid:
        return baseline, "Baseline retained: candidate absent, invalid, or objective regressed."
    return baseline, "Diagnostic only: neither baseline nor candidate independently validates."
