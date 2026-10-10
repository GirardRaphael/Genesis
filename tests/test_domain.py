import pytest

from services.genesis.models import Dataset, content_hash
from services.genesis.scenarios import build_scenario, rehash
from services.genesis.solver import (
    baseline_plan,
    optimize_plan,
    validate_plan,
    select_plan,
    _plan,
    _route,
)
from services.genesis.simulation import (
    simulate_plan,
    revealed_events,
    validate_reload,
    _reload_dataset,
)
from services.genesis.metrics import cad, paired_change


def tiny():
    return build_scenario("tiny", 17)


def test_tiny_solver_roundtrip_and_baseline():
    d = tiny()
    assert len(d.stops) == 6
    assert Dataset.model_validate_json(d.model_dump_json()) == d
    for p in [baseline_plan(d), optimize_plan(d, 0.1)]:
        c = validate_plan(d, p)
        assert c.valid, c.issues
        assert c.served == 6
        assert p.solver_status != "optimal"


@pytest.mark.parametrize("scenario", ["S01", "S02", "S03", "S04", "S05"])
def test_scenarios_bounded_and_reproducible(scenario):
    d = build_scenario(scenario, 17)
    assert d == build_scenario(scenario, 17)
    assert len(d.stops) == 28 and len(d.vehicles) == 4
    assert "not road verified" in d.road_source
    assert "sim_time_s" not in d.model_dump_json()
    p = baseline_plan(d)
    assert validate_plan(d, p).valid == (scenario != "S03")


def test_capacity_is_independent_of_forged_totals():
    d = tiny()
    p = _plan(d, [_route(d, d.vehicles[0], [s.id for s in d.stops])], "test", "test")
    p.routes[0].initial_load = 1
    issues = validate_plan(d, p).issues
    assert any("Capacity" in x for x in issues)
    assert any("cargo" in x for x in issues)


def test_tampered_totals_times_and_duplicate_rejected():
    d = tiny()
    p = baseline_plan(d)
    p.distance_m = 0
    p.routes[0].visits[0].service_start_s += 1
    assert any("totals" in x for x in validate_plan(d, p).issues)
    assert any("Visit times" in x for x in validate_plan(d, p).issues)
    p = _plan(d, [_route(d, d.vehicles[0], [d.stops[0].id, d.stops[0].id])], "test", "test")
    assert any("Duplicate" in x for x in validate_plan(d, p).issues)


def test_service_start_window_wait_and_return_shift():
    d = tiny()
    d.stops[0].earliest_s = 1000
    d.stops[0].latest_s = 1000
    rehash(d)
    r = _route(d, d.vehicles[0], [d.stops[0].id])
    assert r.visits[0].service_start_s == 1000
    assert r.visits[0].departure_s > 1000
    assert r.waiting_s > 0
    p = baseline_plan(d)
    assert validate_plan(d, p).valid
    d.vehicles[0].shift_end_s = 1000
    rehash(d)
    p.input_hash = d.input_hash
    assert any("Shift return" in x for x in validate_plan(d, p).issues)


def test_directional_distance_and_return_are_accounted():
    d = tiny()
    r = _route(d, d.vehicles[0], [d.stops[0].id])
    assert d.distance_m[0][1] != d.distance_m[1][0]
    assert r.distance_m == d.distance_m[0][1] + d.distance_m[1][0]
    assert r.operating_cost_cents == 1800 + r.distance_m + r.duty_s
    assert cad(12345) == "123.45"
    assert paired_change(0, 5)["percent"] is None


def test_unreachable_and_input_tampering():
    d = tiny()
    p = baseline_plan(d)
    sid = p.routes[0].stop_ids[0]
    idx = d.location_ids.index(sid)
    d.duration_s[0][idx] = None
    d.distance_m[0][idx] = None
    issues = validate_plan(d, p).issues
    assert "Dataset hash mismatch" in issues
    assert any("Unreachable" in x for x in issues)


def test_optional_omission_penalty_not_operating_money():
    d = tiny()
    d.stops[-1].penalty_cents = 100
    d.stops[-1].mandatory = False
    rehash(d)
    ids = [s.id for s in d.stops[:-1]]
    p = _plan(
        d, [_route(d, d.vehicles[0], ids[:3]), _route(d, d.vehicles[1], ids[3:])], "test", "test"
    )
    assert validate_plan(d, p).valid
    assert p.objective_cents == p.operating_cost_cents + 100


def test_no_candidate_is_not_infeasibility_proof():
    d = build_scenario("S03", 17)
    p = optimize_plan(d, 0.1)
    assert p.solver_status == "no_candidate"
    assert not validate_plan(d, p).valid
    assert "not an infeasibility proof" in p.diagnostics[0]


def test_admission_preserves_valid_baseline_and_coverage():
    d = tiny()
    b = baseline_plan(d)
    worse = b.model_copy(deep=True)
    worse.objective_cents += 1
    selected, reason = select_plan(d, b, worse)
    assert selected is b and "retained" in reason
    missing = _plan(d, [], "test", "no_candidate")
    assert select_plan(d, b, missing)[0] is b


def test_valid_but_more_expensive_candidate_rejected():
    from itertools import permutations

    d = tiny()
    baseline = baseline_plan(d)
    for ids in permutations([s.id for s in d.stops]):
        candidate = _plan(
            d,
            [_route(d, d.vehicles[0], list(ids[:3])), _route(d, d.vehicles[1], list(ids[3:]))],
            "test",
            "feasible_candidate",
        )
        if (
            candidate.objective_cents > baseline.objective_cents
            and validate_plan(d, candidate).valid
        ):
            assert select_plan(d, baseline, candidate)[0] is baseline
            break
    else:
        pytest.fail("Test requires a valid more expensive candidate")


def test_new_order_real_reload_and_paired_schedule():
    d = build_scenario("S05", 17)
    p = baseline_plan(d)
    left = simulate_plan(d, p, "S05", 17)
    right = simulate_plan(d, p, "S05", 17, True)
    assert left["manifest_hash"] == right["manifest_hash"]
    assert left["metrics"]["served"] == 28 and left["metrics"]["total"] == 29
    assert right["metrics"]["served"] == 29
    assert right["replan_count"] == 1 and right["replan_certificate"]["valid"]
    assert right["replan_certificate"]["scope"] == "residual_suffix"
    assert right["replan_certificate"]["plan_hash"] == content_hash(right["replan_plan"])
    assert right["metrics"]["distance_km"] == (p.distance_m + 1285) / 1000
    loading = next(e for e in right["events"] if e["kind"] == "depot_loading")
    departure = next(e for e in right["events"] if e["id"] == "reload-departure")
    assert departure["sim_time_s"] == loading["sim_time_s"] + 120
    assert loading["vehicle_id"] not in {r.vehicle_id for r in p.routes}


def test_replan_never_erases_earlier_lateness():
    d = build_scenario("S05", 17)
    p = baseline_plan(d)
    sid = p.routes[0].stop_ids[0]
    next(s for s in d.stops if s.id == sid).latest_s = 1
    rehash(d)
    p.input_hash = d.input_hash
    result = simulate_plan(d, p, "S05", 17, True)
    assert result["replan_certificate"]["valid"]
    assert result["replan_certificate"]["prior_violations"]
    assert result["metrics"]["late_minutes"] > 0
    assert result["metrics"]["outcome"] == "service_diagnostic"


def test_outage_freezes_cargo_without_phantom_transfer():
    d = build_scenario("S04", 17)
    p = baseline_plan(d)
    result = simulate_plan(d, p, "S04", 17, True)
    outage = next(e for e in result["events"] if e["kind"] == "outage_applied")
    assert outage["load"] > 0
    assert set(outage["onboard_unserved"]) <= set(result["metrics"]["unserved_ids"])
    assert not result["replan_applied"]
    assert not any(
        e["kind"] == "depot_return" and e["vehicle_id"] == "van-1" for e in result["events"]
    )


def test_outage_during_final_service_stops_depot_return():
    d = build_scenario("S04", 17)
    stop = d.stops[0]
    stop.earliest_s = 2000
    stop.latest_s = 5000
    rehash(d)
    p = _plan(d, [_route(d, d.vehicles[0], [stop.id])], "test", "test")
    result = simulate_plan(d, p, "S04", 17)
    assert result["metrics"]["routes"][0]["stranded"]
    assert result["metrics"]["routes"][0]["remaining_load"] == 0
    assert not any(e["kind"] == "depot_return" for e in result["events"])
    assert any(v["kind"] == "vehicle_unavailable" for v in result["metrics"]["violations"])


def test_paired_policies_share_exogenous_schedule_but_evolve_differently():
    d = build_scenario("S04", 17)
    a = baseline_plan(d)
    b = _plan(
        d,
        [
            _route(
                d,
                d.vehicles[3]
                if r.vehicle_id == "van-1"
                else next(v for v in d.vehicles if v.id == r.vehicle_id),
                r.stop_ids,
            )
            for r in a.routes
        ],
        "test",
        "test",
    )
    assert validate_plan(d, b).valid
    left, right = [simulate_plan(d, p, "S04", 17) for p in (a, b)]
    assert left["manifest_hash"] == right["manifest_hash"]
    assert left["metrics"]["served"] < right["metrics"]["served"]
    assert [e for e in left["events"] if e.get("exogenous")] == [
        e for e in right["events"] if e.get("exogenous")
    ]


def test_future_events_denied_and_mismatched_pair_rejected():
    assert revealed_events("S05", 17, 0) == []
    events = revealed_events("S05", 17, 100000)
    assert len(events) == 1
    assert revealed_events("S05", 17, events[0]["sim_time_s"] - 1) == []
    d = build_scenario("S05", 17)
    with pytest.raises(ValueError):
        simulate_plan(d, baseline_plan(d), "S05", 18)


def test_residual_cannot_be_used_as_initial_certificate():
    d = tiny()
    p = baseline_plan(d)
    p.scope = "residual_suffix"
    assert not validate_plan(d, p).valid


def test_reload_rejects_stale_state_and_cargo_transfer():
    d = build_scenario("S05", 17)
    p = baseline_plan(d)
    from services.genesis.models import Stop

    stop = Stop(
        id="new-order-01",
        label="New",
        coordinates=(-73.571, 45.508),
        demand=3,
        service_s=150,
        earliest_s=1000,
        latest_s=5000,
    )
    v = d.vehicles[0]
    rd = _reload_dataset(d, v, stop, 1120)
    rp = _plan(rd, [_route(rd, rd.vehicles[0], [stop.id])], "reload", "test")
    state = {
        "sim_time_s": 1000,
        "plan_hash": content_hash(p),
        "idle_depot_vehicle_ids": [v.id],
        "revealed_order": stop.model_dump(mode="json"),
    }
    check = validate_reload(d, p, state, "stale", rd, rp)
    assert not check["valid"]
    assert any("Stale" in x for x in check["issues"])
    assert any("Cargo" in x for x in check["issues"])
