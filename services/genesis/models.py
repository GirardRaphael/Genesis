"""Canonical synthetic logistics records. All times are seconds after 08:00 local."""

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def content_hash(value) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json")
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


class Record(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True,
        allow_inf_nan=False,
        json_schema_serialization_defaults_required=True,
    )


class Stop(Record):
    id: str
    label: str
    coordinates: tuple[float, float]
    demand: int = Field(ge=0, le=10000)
    service_s: int = Field(ge=0, le=86400)
    earliest_s: int = Field(ge=0, le=86400)
    latest_s: int = Field(ge=0, le=86400)
    mandatory: bool = True
    penalty_cents: int = Field(default=0, ge=0, le=100000000)

    @model_validator(mode="after")
    def window(self):
        lon, lat = self.coordinates
        if not (-74 <= lon <= -73 and 45 <= lat <= 46):
            raise ValueError(
                "coordinates must be longitude/latitude within the Montréal demo region"
            )
        if self.latest_s < self.earliest_s:
            raise ValueError("window end precedes start")
        if not self.mandatory and self.penalty_cents <= 0:
            raise ValueError("optional stop requires an explicit positive penalty")
        return self


class Depot(Record):
    id: str = "depot"
    label: str = "Dépôt synthétique"
    coordinates: tuple[float, float]

    @model_validator(mode="after")
    def location(self):
        lon, lat = self.coordinates
        if not (-74 <= lon <= -73 and 45 <= lat <= 46):
            raise ValueError("depot coordinates outside the Montréal demo region")
        return self


class Vehicle(Record):
    id: str
    capacity: int = Field(ge=1, le=10000)
    shift_start_s: int = Field(default=0, ge=0, le=86400)
    shift_end_s: int = Field(default=28800, ge=1, le=86400)
    activation_cents: int = Field(default=1800, ge=0, le=10000000)
    distance_cents_per_m: int = Field(default=1, ge=0, le=100)
    time_cents_per_s: int = Field(default=1, ge=0, le=100)

    @model_validator(mode="after")
    def shift(self):
        if self.shift_end_s <= self.shift_start_s:
            raise ValueError("invalid shift")
        return self


class Dataset(Record):
    id: str
    scenario_id: str
    seed: int
    depot: Depot
    stops: list[Stop]
    vehicles: list[Vehicle]
    location_ids: list[str]
    distance_m: list[list[int | None]]
    duration_s: list[list[int | None]]
    input_hash: str = ""
    matrix_hash: str = ""
    region: str = "Montréal — grille synthétique"
    timezone: str = "America/Toronto"
    service_day_origin: str = "2026-10-10T08:00:00-04:00"
    crs: str = "EPSG:4326"
    generator_version: str = "synthetic-grid-v1"
    road_source: str = "synthetic schematic grid; not road verified"
    permission: str = "Original synthetic fixture, project MIT license"
    rate_version: str = "synthetic-CAD-v1; includes synthetic fuel/maintenance; not market rates"
    forecast: str = "Frozen synthetic planning matrix; future evaluation events are private."

    @model_validator(mode="after")
    def matrices(self):
        ids = [self.depot.id] + [s.id for s in self.stops]
        if len(ids) != len(set(ids)) or self.location_ids != ids:
            raise ValueError("locations must uniquely match depot followed by stops")
        if len({v.id for v in self.vehicles}) != len(self.vehicles) or not self.vehicles:
            raise ValueError("vehicles must have unique IDs and be nonempty")
        n = len(ids)
        if n > 101 or len(self.vehicles) > 10:
            raise ValueError("bounded demo permits at most 100 stops and 10 vehicles")
        for matrix in (self.distance_m, self.duration_s):
            if len(matrix) != n or any(len(row) != n for row in matrix):
                raise ValueError("matrix dimensions disagree with locations")
            if any(v is not None and (v < 0 or v > 10000000) for row in matrix for v in row):
                raise ValueError("matrix values out of range")
            if any(matrix[i][i] != 0 for i in range(n)):
                raise ValueError("matrix diagonal must be zero")
        if any(
            (self.distance_m[i][j] is None) != (self.duration_s[i][j] is None)
            for i in range(n)
            for j in range(n)
        ):
            raise ValueError("distance/time reachability disagrees")
        return self


class Visit(Record):
    stop_id: str
    arrival_s: int
    service_start_s: int
    departure_s: int
    load_after: int


class Route(Record):
    vehicle_id: str
    stop_ids: list[str]
    visits: list[Visit]
    departure_s: int
    return_s: int
    initial_load: int
    distance_m: int
    travel_s: int
    service_s: int
    waiting_s: int
    duty_s: int
    operating_cost_cents: int
    geometry: list[tuple[float, float]]
    geometry_source: str = "schematic synthetic grid — not road verified"


class Plan(Record):
    id: str
    input_hash: str
    matrix_hash: str
    policy: str
    routes: list[Route]
    unserved_ids: list[str]
    distance_m: int = 0
    operating_cost_cents: int = 0
    penalty_cents: int = 0
    objective_cents: int = 0
    solver_status: str
    solver_runtime_ms: float = 0
    solver_version: str | None = None
    search_limit_s: float | None = None
    diagnostics: list[str] = Field(default_factory=list)
    scope: Literal["initial_full_plan", "residual_suffix"] = "initial_full_plan"
    parent_plan_id: str | None = None


class Certificate(Record):
    scope: str = "initial_full_plan"
    valid: bool
    issues: list[str]
    input_hash: str
    matrix_hash: str
    plan_hash: str
    served: int
    total: int
    mandatory_served: int
    mandatory_total: int
    recomputed_distance_m: int
    recomputed_operating_cost_cents: int
    recomputed_objective_cents: int
    feasible_status: str
