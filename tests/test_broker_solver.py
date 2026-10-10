"""Hand-checkable fleet choices and independent certificate failure cases."""

from copy import deepcopy

from genesis.broker_solver import compare_strategies, solve_problem, validate_solution
from genesis.models import content_hash


def problem(*, objective="cost", parcels=5, capacity=10, service=0, deadline=7200):
    nodes = [
        {"coordinates": [-73.5, 45.5], "kind": "start"},
        {"coordinates": [-73.5, 45.5], "kind": "start"},
    ]
    deliveries = []
    for i, did in enumerate(("a", "b")):
        nodes.extend(
            [
                {"coordinates": [-73.5, 45.5], "kind": "pickup", "delivery_id": did},
                {"coordinates": [-73.5, 45.5], "kind": "dropoff", "delivery_id": did},
            ]
        )
        deliveries.append(
            {
                "id": did,
                "pickup_index": 2 + 2 * i,
                "dropoff_index": 3 + 2 * i,
                "parcels": parcels,
                "deadline_s": deadline,
            }
        )
    size = len(nodes)
    result = {
        "nodes": nodes,
        "vehicles": [
            {
                "id": f"v{i + 1}",
                "start_index": i,
                "capacity": capacity,
                "fixed_cost_cents": 1000,
                "cost_per_km_cents": 100,
                "driver_hour_cents": 0,
            }
            for i in range(2)
        ],
        "deliveries": deliveries,
        "durations": [[0 if i == j else 100 for j in range(size)] for i in range(size)],
        "distances": [[0 if i == j else 1000 for j in range(size)] for i in range(size)],
        "service_seconds": service,
        "objective": objective,
    }
    result["input_hash"] = content_hash(result)
    return result


def rehash(value):
    value["input_hash"] = content_hash({k: v for k, v in value.items() if k != "input_hash"})
    return value


def test_shared_truck_wins_cost_and_exact_arc_charges():
    p = problem()
    result = compare_strategies(p)
    assert result["certificate"]["valid"]
    assert result["selected_strategy"] in {"hybrid", "one_truck:v1", "one_truck:v2"}
    assert result["selected"]["fleet_cost_cents"] == 1400
    assert result["selected"]["makespan_seconds"] == 400
    separated = next(c for c in result["candidates"] if c["strategy"] == "separated")
    assert separated["certificate"]["valid"]
    assert separated["solution"]["fleet_cost_cents"] == 2400


def test_fastest_and_deadlines_can_require_separate_vehicles():
    fastest = compare_strategies(problem(objective="fastest"))
    assert len(fastest["selected"]["vehicle_routes"]) == 2
    assert fastest["selected"]["makespan_seconds"] == 200
    tight = compare_strategies(problem(deadline=200))
    assert len(tight["selected"]["vehicle_routes"]) == 2
    assert all(
        c["status"] == "unavailable"
        for c in tight["candidates"]
        if c["strategy"].startswith("one_truck")
    )


def test_capacity_requires_delivery_interleaving_on_one_truck():
    p = problem(capacity=5)
    result = compare_strategies(p)
    one = next(c for c in result["candidates"] if c["strategy"] == "one_truck:v1")
    assert one["certificate"]["valid"]
    assert one["solution"]["vehicle_routes"][0]["load_peak"] == 5
    order = one["solution"]["vehicle_routes"][0]["node_order"]
    assert order in ([2, 3, 4, 5], [4, 5, 2, 3])
    tampered = deepcopy(one["solution"])
    tampered["vehicle_routes"][0]["node_order"] = [2, 4, 3, 5]
    tampered["solution_hash"] = content_hash(
        {k: v for k, v in tampered.items() if k != "solution_hash"}
    )
    assert any("capacity" in issue for issue in validate_solution(p, tampered)["issues"])


def test_unreachable_arcs_and_tampered_or_duplicate_plans_are_rejected():
    p = problem()
    solution = solve_problem(p, 0.2)
    assert validate_solution(p, solution)["valid"]
    wrong = deepcopy(solution)
    wrong["fleet_cost_cents"] += 1
    wrong["solution_hash"] = content_hash({k: v for k, v in wrong.items() if k != "solution_hash"})
    assert "fleet totals/objective mismatch" in validate_solution(p, wrong)["issues"]
    false_claim = deepcopy(solution)
    false_claim["solver_status"] = "optimal"
    false_claim["solution_hash"] = content_hash(
        {k: v for k, v in false_claim.items() if k != "solution_hash"}
    )
    assert "unsupported solver status" in validate_solution(p, false_claim)["issues"]
    duplicate = deepcopy(solution)
    duplicate["vehicle_routes"][0]["node_order"].append(
        duplicate["vehicle_routes"][0]["node_order"][0]
    )
    duplicate["solution_hash"] = content_hash(
        {k: v for k, v in duplicate.items() if k != "solution_hash"}
    )
    assert any("visited 2 times" in issue for issue in validate_solution(p, duplicate)["issues"])
    unreachable = problem()
    for row in unreachable["durations"]:
        row[3] = None
    for row in unreachable["distances"]:
        row[3] = None
    rehash(unreachable)
    assert compare_strategies(unreachable)["selected"] is None


def test_zero_arc_still_requires_pickup_before_dropoff_and_final_service_charged():
    p = problem(service=120)
    p["durations"] = [[0] * 6 for _ in range(6)]
    p["distances"] = [[0] * 6 for _ in range(6)]
    for vehicle in p["vehicles"]:
        vehicle["driver_hour_cents"] = 3600
    rehash(p)
    result = compare_strategies(p)
    assert result["certificate"]["valid"]
    for route in result["selected"]["vehicle_routes"]:
        order = route["node_order"]
        assert order.index(2) < order.index(3) if 2 in order else True
        assert order.index(4) < order.index(5) if 4 in order else True
        assert route["duration_seconds"] == 120 * len(order)
        assert route["operating_cost_cents"] == 1000 + 120 * len(order)
    bad = deepcopy(result["selected"])
    bad["vehicle_routes"][0]["node_order"] = list(reversed(bad["vehicle_routes"][0]["node_order"]))
    bad["solution_hash"] = content_hash({k: v for k, v in bad.items() if k != "solution_hash"})
    assert any("precedence" in issue for issue in validate_solution(p, bad)["issues"])


def test_certificate_binds_source_snapshot_and_separated_reports_unavailable():
    p = problem()
    solution = solve_problem(p, 0.2)
    missing_hash = deepcopy(solution)
    missing_hash.pop("solution_hash")
    assert not validate_solution(p, missing_hash)["valid"]
    changed = deepcopy(p)
    changed["distances"][0][2] += 1
    rehash(changed)
    assert not validate_solution(changed, solution)["valid"]
    p["deliveries"].append({"id": "c", "pickup_index": 6, "dropoff_index": 7, "parcels": 1})
    p["nodes"].extend(
        [
            {"coordinates": [-73.5, 45.5], "kind": "pickup", "delivery_id": "c"},
            {"coordinates": [-73.5, 45.5], "kind": "dropoff", "delivery_id": "c"},
        ]
    )
    for matrix in (p["durations"], p["distances"]):
        for row in matrix:
            row.extend([100, 100])
        matrix.extend([[100] * 8, [100] * 8])
    rehash(p)
    separated = next(c for c in compare_strategies(p)["candidates"] if c["strategy"] == "separated")
    assert separated["status"] == "unavailable"
    assert "at least as many" in separated["reason"]


def test_deadline_is_dropoff_service_completion_inclusive():
    p = problem(service=120, deadline=440)
    on_boundary = compare_strategies(p)
    assert on_boundary["certificate"]["valid"]
    assert len(on_boundary["selected"]["vehicle_routes"]) == 2
    for delivery in p["deliveries"]:
        delivery["deadline_s"] = 439
    rehash(p)
    assert compare_strategies(p)["selected"] is None


def test_balanced_search_matches_declared_per_minute_value():
    p = {
        "nodes": [
            {"coordinates": [-73.6, 45.5], "kind": kind, **({"delivery_id": did} if did else {})}
            for kind, did in [
                ("start", None),
                ("pickup", "a"),
                ("dropoff", "a"),
                ("pickup", "b"),
                ("dropoff", "b"),
            ]
        ],
        "vehicles": [
            {
                "id": "van1",
                "start_index": 0,
                "capacity": 10,
                "fixed_cost_cents": 0,
                "driver_hour_cents": 0,
                "cost_per_km_cents": 1000,
            }
        ],
        "deliveries": [
            {
                "id": did,
                "pickup_index": pick,
                "dropoff_index": drop,
                "parcels": 5,
                "deadline_s": 7200,
            }
            for did, pick, drop in [("a", 1, 2), ("b", 3, 4)]
        ],
        "durations": [[0 if i == j else 1000 for j in range(5)] for i in range(5)],
        "distances": [[0 if i == j else 1000 for j in range(5)] for i in range(5)],
        "service_seconds": 0,
        "objective": "balanced",
        "balance_value_cents_per_minute": 50,
        "max_duration_s": 28800,
    }
    for a, b, seconds, meters in [
        (0, 1, 70, 10),
        (1, 2, 10, 10),
        (2, 3, 70, 10),
        (3, 4, 10, 10),
        (0, 3, 40, 37),
        (4, 1, 40, 38),
    ]:
        p["durations"][a][b], p["distances"][a][b] = seconds, meters
    rehash(p)
    solution = solve_problem(p, 2)
    assert solution["vehicle_routes"][0]["node_order"] == [1, 2, 3, 4]
    assert solution["fleet_cost_cents"] == 40 and solution["makespan_seconds"] == 160
    assert solution["objective_value"] == 174 and validate_solution(p, solution)["valid"]
