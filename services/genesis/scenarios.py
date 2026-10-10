"""Public planning inputs contain no future disruption schedules."""

import random
from .models import Dataset, Depot, Stop, Vehicle, content_hash

SCENARIOS = [
    {
        "id": "S01",
        "label": "Journée nominale",
        "description": "28 livraisons synthétiques, quatre fourgons.",
    },
    {
        "id": "S02",
        "label": "Congestion concentrée",
        "description": "Prévision statique et congestion simulée, distinctes.",
    },
    {
        "id": "S03",
        "label": "Fenêtres incompatibles",
        "description": "Une livraison obligatoire impossible dans sa fenêtre.",
    },
    {
        "id": "S04",
        "label": "Véhicule indisponible",
        "description": "Incident simulé à une limite sûre de service; cargaison immobilisée.",
    },
    {
        "id": "S05",
        "label": "Nouvelle commande",
        "description": "Commande révélée pendant la journée; chargement au dépôt requis.",
    },
]
ALIASES = {
    "nominal": "S01",
    "congestion": "S02",
    "tight_windows": "S03",
    "vehicle_unavailable": "S04",
    "new_order": "S05",
}


def rehash(dataset: Dataset) -> Dataset:
    dataset.matrix_hash = content_hash(
        {
            "ids": dataset.location_ids,
            "distance": dataset.distance_m,
            "duration": dataset.duration_s,
        }
    )
    body = dataset.model_dump(mode="json", exclude={"input_hash"})
    dataset.input_hash = content_hash(body)
    return dataset


def build_scenario(scenario_id: str, seed: int = 17) -> Dataset:
    scenario_id = ALIASES.get(scenario_id, scenario_id)
    if scenario_id not in {s["id"] for s in SCENARIOS} and scenario_id != "tiny":
        raise ValueError("Unknown scenario")
    rng = random.Random(seed)
    n = 6 if scenario_id == "tiny" else 28
    depot = Depot(coordinates=(-73.575, 45.505))
    grid = [(0, 0)] + [(1 + i % 7, 1 + i // 7) for i in range(n)]
    stops = []
    for i, (x, y) in enumerate(grid[1:], 1):
        stops.append(
            Stop(
                id=f"stop-{i:02d}",
                label=f"Livraison {i:02d}",
                coordinates=(depot.coordinates[0] + x * 0.004, depot.coordinates[1] + y * 0.003),
                demand=(2 + i % 2) if n == 6 else rng.randint(2, 4),
                service_s=120 + 30 * (i % 3),
                earliest_s=0,
                latest_s=18000,
            )
        )
    if scenario_id == "S03":
        stops[-1].latest_s = 1
    distances, durations = [], []
    for i, (x1, y1) in enumerate(grid):
        dr, tr = [], []
        for j, (x2, y2) in enumerate(grid):
            distance = 0 if i == j else (abs(x2 - x1) + abs(y2 - y1)) * 310 + (45 if x2 < x1 else 0)
            duration = (distance + 5) // 6
            if scenario_id == "S02" and x2 >= 5 and i != j:
                duration = (duration * 3 + 1) // 2
            dr.append(distance)
            tr.append(duration)
        distances.append(dr)
        durations.append(tr)
    return rehash(
        Dataset(
            id=f"{scenario_id}-seed-{seed}",
            scenario_id=scenario_id,
            seed=seed,
            depot=depot,
            stops=stops,
            vehicles=[
                Vehicle(id=f"van-{i + 1}", capacity=9 if n == 6 else 40)
                for i in range(2 if n == 6 else 4)
            ],
            location_ids=[depot.id] + [s.id for s in stops],
            distance_m=distances,
            duration_s=durations,
        )
    )
