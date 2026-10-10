from decimal import Decimal


def cad(cents: int) -> str:
    return str((Decimal(cents) / Decimal(100)).quantize(Decimal("0.01")))


def paired_change(baseline, candidate):
    a, b = Decimal(str(baseline)), Decimal(str(candidate))
    return {"absolute": str(b - a), "percent": None if a == 0 else str((b - a) / a * 100)}


def compare_plans(dataset, baseline, candidate):
    from .solver import validate_plan

    a, b = validate_plan(dataset, baseline), validate_plan(dataset, candidate)
    comparable = a.valid and b.valid and set(baseline.unserved_ids) == set(candidate.unserved_ids)
    return {
        "comparable": comparable,
        "baseline_valid": a.valid,
        "candidate_valid": b.valid,
        "objective": paired_change(a.recomputed_objective_cents, b.recomputed_objective_cents)
        if comparable
        else None,
        "distance_m": paired_change(a.recomputed_distance_m, b.recomputed_distance_m)
        if comparable
        else None,
        "baseline_served": a.served,
        "candidate_served": b.served,
    }
