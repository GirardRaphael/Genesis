"""Bounded pickup/delivery fleet search with an independent route certificate."""

from collections import Counter
from itertools import islice, permutations
import math

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from .models import content_hash


def _integer(value, name, low=0):
    if isinstance(value, bool) or not isinstance(value, int) or value < low:
        raise ValueError(f"{name} must be an integer >= {low}")
    return value


def _problem(problem):
    if not isinstance(problem, dict):
        raise ValueError("problem must be an object")
    if problem.get("input_hash") != content_hash(
        {k: v for k, v in problem.items() if k != "input_hash"}
    ):
        raise ValueError("problem input_hash mismatch")
    nodes, vehicles, deliveries = (problem.get(k) for k in ("nodes", "vehicles", "deliveries"))
    if (
        not isinstance(nodes, list)
        or not isinstance(vehicles, list)
        or not isinstance(deliveries, list)
    ):
        raise ValueError("nodes, vehicles and deliveries must be lists")
    if not 1 <= len(deliveries) <= 10 or not 1 <= len(vehicles) <= 10 or len(nodes) < 3:
        raise ValueError("fleet or delivery count outside supported bounds")
    if problem.get("objective", "cost") not in {"cost", "fastest", "balanced"}:
        raise ValueError("unknown objective")
    for key, default in (
        ("service_seconds", 120),
        ("balance_value_cents_per_minute", 50),
        ("max_duration_s", 28800),
    ):
        _integer(problem.get(key, default), key, 0 if key != "max_duration_s" else 1)
    for key in ("durations", "distances"):
        matrix = problem.get(key)
        if (
            not isinstance(matrix, list)
            or len(matrix) != len(nodes)
            or any(not isinstance(row, list) or len(row) != len(nodes) for row in matrix)
        ):
            raise ValueError(f"{key} must be a square node matrix")
        for row in matrix:
            for value in row:
                if value is not None:
                    _integer(value, key)
    for node in nodes:
        if not isinstance(node, dict) or node.get("kind") not in {"start", "pickup", "dropoff"}:
            raise ValueError("unknown node kind")
        coordinates = node.get("coordinates")
        if (
            not isinstance(coordinates, list)
            or len(coordinates) != 2
            or any(not isinstance(x, (int, float)) or not math.isfinite(x) for x in coordinates)
        ):
            raise ValueError("invalid coordinates")
    vehicle_ids, starts = set(), set()
    for vehicle in vehicles:
        vid = vehicle.get("id")
        if not isinstance(vid, str) or not vid or vid in vehicle_ids:
            raise ValueError("duplicate/invalid vehicle id")
        vehicle_ids.add(vid)
        start = _integer(vehicle.get("start_index"), "start_index")
        if start >= len(nodes) or nodes[start]["kind"] != "start":
            raise ValueError("vehicle start_index is not a start node")
        starts.add(start)
        for key in ("capacity", "fixed_cost_cents", "cost_per_km_cents", "driver_hour_cents"):
            _integer(vehicle.get(key), key, 1 if key == "capacity" else 0)
    used, delivery_ids = set(), set()
    for delivery in deliveries:
        did = delivery.get("id")
        if not isinstance(did, str) or not did or did in delivery_ids:
            raise ValueError("duplicate/invalid delivery id")
        delivery_ids.add(did)
        _integer(delivery.get("parcels"), "parcels", 1)
        if delivery["parcels"] > 40:
            raise ValueError("individual delivery exceeds 40 parcels")
        _integer(delivery.get("deadline_s", 7200), "deadline_s")
        for key, kind in (("pickup_index", "pickup"), ("dropoff_index", "dropoff")):
            index = _integer(delivery.get(key), key)
            if (
                index >= len(nodes)
                or index in used
                or nodes[index]["kind"] != kind
                or nodes[index].get("delivery_id") != did
            ):
                raise ValueError("delivery node mismatch or duplicate")
            used.add(index)
    if used | starts != set(range(len(nodes))) or used & starts:
        raise ValueError("unreferenced or overlapping nodes")
    return nodes, vehicles, deliveries


def _arc(problem, a, b):
    duration, distance = problem["durations"][a][b], problem["distances"][a][b]
    return (duration, distance) if duration is not None and distance is not None else None


def _ceil_div(a, b):
    return (a + b - 1) // b


def _score(problem, cost, makespan):
    mode = problem.get("objective", "cost")
    if mode == "balanced":
        return cost + _ceil_div(makespan * problem.get("balance_value_cents_per_minute", 50), 60)
    if mode == "fastest":
        # Greater than a conservative bound on any feasible fleet cost.
        max_arc = max(x or 0 for row in problem["distances"] for x in row)
        max_time = max(x or 0 for row in problem["durations"] for x in row)
        bound = sum(v["fixed_cost_cents"] for v in problem["vehicles"])
        bound += (2 * len(problem["deliveries"]) + len(problem["vehicles"])) * max(
            _ceil_div(max_arc * v["cost_per_km_cents"], 1000)
            + _ceil_div(
                (max_time + problem.get("service_seconds", 120)) * v["driver_hour_cents"], 3600
            )
            for v in problem["vehicles"]
        )
        return makespan * (bound + 1) + cost
    return cost


def _materialize(problem, orders, status):
    by_vehicle = {v["id"]: v for v in problem["vehicles"]}
    by_pickup = {d["pickup_index"]: d for d in problem["deliveries"]}
    by_drop = {d["dropoff_index"]: d for d in problem["deliveries"]}
    service = problem.get("service_seconds", 120)
    routes, assignments = [], []
    for vid, order in orders.items():
        if not order:
            continue
        vehicle = by_vehicle[vid]
        previous, elapsed, distance, cost, load, peak = (
            vehicle["start_index"],
            0,
            0,
            vehicle["fixed_cost_cents"],
            0,
            0,
        )
        for index in order:
            arc = _arc(problem, previous, index)
            if arc is None:
                raise ValueError("unreachable route arc")
            travel, meters = arc
            elapsed += travel + (service if previous != vehicle["start_index"] else 0)
            distance += meters
            cost += _ceil_div(meters * vehicle["cost_per_km_cents"], 1000)
            cost += _ceil_div(
                (travel + (service if previous != vehicle["start_index"] else 0))
                * vehicle["driver_hour_cents"],
                3600,
            )
            if index in by_pickup:
                load += by_pickup[index]["parcels"]
                assignments.append({"delivery_id": by_pickup[index]["id"], "vehicle_id": vid})
            elif index in by_drop:
                load -= by_drop[index]["parcels"]
            peak = max(peak, load)
            previous = index
        elapsed += service
        cost += _ceil_div(service * vehicle["driver_hour_cents"], 3600)
        routes.append(
            {
                "vehicle_id": vid,
                "node_order": list(order),
                "duration_seconds": elapsed,
                "distance_meters": distance,
                "load_peak": peak,
                "operating_cost_cents": cost,
            }
        )
    fleet_cost = sum(r["operating_cost_cents"] for r in routes)
    makespan = max((r["duration_seconds"] for r in routes), default=0)
    solution = {
        "vehicle_routes": routes,
        "assignments": assignments,
        "fleet_cost_cents": fleet_cost,
        "makespan_seconds": makespan,
        "objective_value": _score(problem, fleet_cost, makespan),
        "solver_status": status,
        "input_hash": problem["input_hash"],
    }
    solution["solution_hash"] = content_hash(solution)
    return solution


def validate_solution(problem, solution):
    """Recompute coverage, physics and every cent without using reported route totals."""
    nodes, vehicles, deliveries = _problem(problem)
    issues = []
    if not isinstance(solution, dict):
        return {
            "valid": False,
            "issues": ["solution is not an object"],
            "input_hash": problem["input_hash"],
        }
    if solution.get("input_hash") != problem["input_hash"]:
        issues.append("input hash mismatch")
    if solution.get("solver_status") != "feasible_candidate":
        issues.append("unsupported solver status")
    expected_hash = content_hash({k: v for k, v in solution.items() if k != "solution_hash"})
    if solution.get("solution_hash") != expected_hash:
        issues.append("solution hash mismatch")
    routes = solution.get("vehicle_routes")
    if not isinstance(routes, list):
        routes, issues = [], issues + ["vehicle_routes missing"]
    by_vehicle = {v["id"]: v for v in vehicles}
    pickup = {d["pickup_index"]: d for d in deliveries}
    dropoff = {d["dropoff_index"]: d for d in deliveries}
    expected_assignments, visited, used_vehicles = [], [], set()
    total_cost, makespan, service = 0, 0, problem.get("service_seconds", 120)
    for route in routes:
        if not isinstance(route, dict):
            issues.append("route is not an object")
            continue
        vid, order = route.get("vehicle_id"), route.get("node_order")
        if (
            vid not in by_vehicle
            or vid in used_vehicles
            or not isinstance(order, list)
            or not order
        ):
            issues.append("unknown/duplicate vehicle or empty route")
            continue
        used_vehicles.add(vid)
        vehicle = by_vehicle[vid]
        previous, elapsed, distance, cost, load, peak = (
            vehicle["start_index"],
            0,
            0,
            vehicle["fixed_cost_cents"],
            0,
            0,
        )
        picked = set()
        for index in order:
            if (
                isinstance(index, bool)
                or not isinstance(index, int)
                or index not in pickup
                and index not in dropoff
            ):
                issues.append(f"non-delivery node in {vid}")
                continue
            visited.append(index)
            arc = _arc(problem, previous, index)
            if arc is None:
                issues.append(f"unreachable arc {previous}->{index}")
                continue
            travel, meters = arc
            from_service = service if previous != vehicle["start_index"] else 0
            elapsed += travel + from_service
            distance += meters
            cost += _ceil_div(meters * vehicle["cost_per_km_cents"], 1000)
            cost += _ceil_div((travel + from_service) * vehicle["driver_hour_cents"], 3600)
            if index in pickup:
                delivery = pickup[index]
                load += delivery["parcels"]
                picked.add(delivery["id"])
                expected_assignments.append({"delivery_id": delivery["id"], "vehicle_id": vid})
            else:
                delivery = dropoff[index]
                if delivery["id"] not in picked:
                    issues.append(f"pickup precedence/vehicle violation: {delivery['id']}")
                if elapsed + service > delivery.get("deadline_s", 7200):
                    issues.append(f"deadline violation: {delivery['id']}")
                load -= delivery["parcels"]
            if load < 0 or load > vehicle["capacity"]:
                issues.append(f"capacity violation on {vid}")
            peak = max(peak, load)
            previous = index
        elapsed += service
        cost += _ceil_div(service * vehicle["driver_hour_cents"], 3600)
        if load != 0:
            issues.append(f"cargo remains on {vid}")
        if elapsed > problem.get("max_duration_s", 28800):
            issues.append(f"maximum duration exceeded on {vid}")
        for key, expected in (
            ("duration_seconds", elapsed),
            ("distance_meters", distance),
            ("load_peak", peak),
            ("operating_cost_cents", cost),
        ):
            if route.get(key) != expected:
                issues.append(f"{key} mismatch on {vid}")
        makespan = max(makespan, elapsed)
        total_cost += cost
    counts = Counter(visited)
    for index in sorted(set(pickup) | set(dropoff)):
        if counts[index] != 1:
            issues.append(f"delivery node {index} visited {counts[index]} times")
    if (
        not isinstance(solution.get("assignments"), list)
        or Counter(
            (x.get("delivery_id"), x.get("vehicle_id"))
            for x in solution["assignments"]
            if isinstance(x, dict)
        )
        != Counter((x["delivery_id"], x["vehicle_id"]) for x in expected_assignments)
        or len(solution["assignments"]) != len(expected_assignments)
    ):
        issues.append("assignments mismatch")
    if (
        solution.get("fleet_cost_cents") != total_cost
        or solution.get("makespan_seconds") != makespan
        or solution.get("objective_value") != _score(problem, total_cost, makespan)
    ):
        issues.append("fleet totals/objective mismatch")
    return {
        "valid": not issues,
        "issues": issues,
        "input_hash": problem["input_hash"],
        "solution_hash": expected_hash,
        "recomputed_fleet_cost_cents": total_cost,
        "recomputed_makespan_seconds": makespan,
        "recomputed_objective_value": _score(problem, total_cost, makespan),
        "served_deliveries": sum(
            counts[d["pickup_index"]] == counts[d["dropoff_index"]] == 1 for d in deliveries
        ),
    }


def _solve(problem, vehicles, time_limit_s):
    nodes, all_vehicles, deliveries = _problem(problem)
    if any(d.get("deadline_s", 7200) < problem.get("service_seconds", 120) for d in deliveries):
        return None
    dummy = len(nodes)
    manager = pywrapcp.RoutingIndexManager(
        len(nodes) + 1,
        len(all_vehicles),
        [v["start_index"] for v in all_vehicles],
        [dummy] * len(all_vehicles),
    )
    routing = pywrapcp.RoutingModel(manager)
    node_for_index = {i: manager.IndexToNode(i) for i in range(routing.Size() + len(all_vehicles))}
    service = problem.get("service_seconds", 120)
    demand = {d["pickup_index"]: d["parcels"] for d in deliveries}
    demand.update({d["dropoff_index"]: -d["parcels"] for d in deliveries})

    def leg(a, b):
        src, dst = node_for_index.get(a), node_for_index.get(b)
        if src is None or dst is None:
            return problem.get("max_duration_s", 28800) + 1
        return (0 if src == dummy or nodes[src]["kind"] == "start" else service) + (
            0 if dst == dummy else (problem["durations"][src][dst] or 0)
        )

    time_id = routing.RegisterTransitCallback(leg)
    routing.AddDimension(time_id, 0, problem.get("max_duration_s", 28800), True, "Time")
    timing = routing.GetDimensionOrDie("Time")
    capacity_id = routing.RegisterUnaryTransitCallback(
        lambda a: demand.get(node_for_index.get(a), 0)
    )
    routing.AddDimensionWithVehicleCapacity(
        capacity_id, 0, [v["capacity"] for v in all_vehicles], True, "Load"
    )
    order_id = routing.RegisterTransitCallback(lambda _a, _b: 1)
    routing.AddDimension(order_id, 0, 2 * len(deliveries) + 1, True, "Order")
    ordering = routing.GetDimensionOrDie("Order")
    for delivery in deliveries:
        pi, di = (
            manager.NodeToIndex(delivery["pickup_index"]),
            manager.NodeToIndex(delivery["dropoff_index"]),
        )
        eligible = [i for i, v in enumerate(all_vehicles) if v["id"] in {x["id"] for x in vehicles}]
        routing.VehicleVar(pi).SetValues(eligible)
        routing.VehicleVar(di).SetValues(eligible)
        routing.AddPickupAndDelivery(pi, di)
        routing.solver().Add(routing.VehicleVar(pi) == routing.VehicleVar(di))
        routing.solver().Add(ordering.CumulVar(pi) < ordering.CumulVar(di))
        timing.CumulVar(di).SetMax(max(0, delivery.get("deadline_s", 7200) - service))
    for index in range(routing.Size()):
        if routing.IsEnd(index):
            continue
        src = node_for_index[index]
        for target in range(routing.Size()):
            if routing.IsStart(target) or routing.IsEnd(target):
                continue
            dst = node_for_index[target]
            if _arc(problem, src, dst) is None:
                routing.NextVar(index).RemoveValue(target)
    mode = problem.get("objective", "cost")
    cost_scale = 60 if mode == "balanced" else 1
    for vi, vehicle in enumerate(all_vehicles):

        def arc_cost(a, b, v=vehicle):
            src, dst = node_for_index.get(a), node_for_index.get(b)
            if src is None or dst is None:
                return 10**12
            if src == dummy:
                return 0
            meters, travel = (
                (0, 0)
                if dst == dummy
                else (problem["distances"][src][dst] or 0, problem["durations"][src][dst] or 0)
            )
            from_service = 0 if nodes[src]["kind"] == "start" else service
            return cost_scale * (
                _ceil_div(meters * v["cost_per_km_cents"], 1000)
                + _ceil_div((travel + from_service) * v["driver_hour_cents"], 3600)
            )

        routing.SetArcCostEvaluatorOfVehicle(routing.RegisterTransitCallback(arc_cost), vi)
        routing.SetFixedCostOfVehicle(vehicle["fixed_cost_cents"] * cost_scale, vi)
    if mode == "balanced":
        timing.SetGlobalSpanCostCoefficient(problem.get("balance_value_cents_per_minute", 50))
    elif mode == "fastest":
        timing.SetGlobalSpanCostCoefficient(_score(problem, 0, 1))
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    )
    params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    params.time_limit.FromMilliseconds(max(1, int(time_limit_s * 1000)))
    found = routing.SolveWithParameters(params)
    if not found:
        return None
    orders = {}
    for vi, vehicle in enumerate(all_vehicles):
        index, order = routing.Start(vi), []
        while not routing.IsEnd(index):
            node = node_for_index[index]
            if node in demand:
                order.append(node)
            index = found.Value(routing.NextVar(index))
        if order:
            orders[vehicle["id"]] = order
    candidate = _materialize(problem, orders, "feasible_candidate")
    return candidate if validate_solution(problem, candidate)["valid"] else None


def solve_problem(problem, time_limit_s=3):
    _problem(problem)
    if (
        not isinstance(time_limit_s, (int, float))
        or isinstance(time_limit_s, bool)
        or not 0 < time_limit_s <= 20
    ):
        raise ValueError("time_limit_s must be in (0, 20]")
    return _solve(problem, problem["vehicles"], time_limit_s) or {
        "solver_status": "no_candidate",
        "input_hash": problem["input_hash"],
        "diagnostic": "Bounded search returned no certified candidate; infeasibility is not proven.",
    }


def compare_strategies(problem):
    _problem(problem)
    candidates = []

    def add(name, solution, reason=None):
        certificate = (
            validate_solution(problem, solution)
            if solution and "vehicle_routes" in solution
            else None
        )
        candidates.append(
            {
                "strategy": name,
                "solution": solution,
                "certificate": certificate,
                "status": "feasible_candidate"
                if certificate and certificate["valid"]
                else "unavailable",
                "reason": reason
                if reason
                else (
                    None
                    if certificate and certificate["valid"]
                    else "No certified candidate within bounded search."
                ),
            }
        )

    add("hybrid", _solve(problem, problem["vehicles"], 3))
    for vehicle in problem["vehicles"]:
        add(f"one_truck:{vehicle['id']}", _solve(problem, [vehicle], 1))
    deliveries, vehicles = problem["deliveries"], problem["vehicles"]
    if len(deliveries) > len(vehicles):
        add(
            "separated",
            None,
            "One delivery per vehicle requires at least as many eligible vehicles as deliveries.",
        )
    else:
        best = None
        # Ten vans otherwise permit 10! assignments; this remains a bounded candidate search.
        for chosen in islice(permutations(vehicles, len(deliveries)), 1000):
            orders = {
                v["id"]: [d["pickup_index"], d["dropoff_index"]] for d, v in zip(deliveries, chosen)
            }
            try:
                candidate = _materialize(problem, orders, "feasible_candidate")
            except ValueError:
                continue
            if validate_solution(problem, candidate)["valid"] and (
                best is None or candidate["objective_value"] < best["objective_value"]
            ):
                best = candidate
        add("separated", best, "At most 1000 stable-order assignments evaluated; global optimality is not proven.")
    valid = [x for x in candidates if x["status"] == "feasible_candidate"]
    chosen = (
        min(valid, key=lambda x: (x["solution"]["objective_value"], x["strategy"]))
        if valid
        else None
    )
    return {
        "selected": chosen["solution"] if chosen else None,
        "selected_strategy": chosen["strategy"] if chosen else None,
        "candidates": candidates,
        "certificate": chosen["certificate"] if chosen else None,
        "status": "feasible_candidate" if chosen else "no_candidate",
    }
