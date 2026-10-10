"""Offline schematic paths and an explicit cached OSRM response reader."""

import json
from pathlib import Path
from pydantic import BaseModel, Field


class CachedOSRM(BaseModel):
    source: str
    profile: str = "driving"
    road_version: str
    distances: list[list[float | None]]
    durations: list[list[float | None]]
    attribution: str = "© OpenStreetMap contributors; ODbL"
    geometry: list[tuple[float, float]] = Field(default_factory=list)


def read_osrm_cache(path: Path, *, source: str, road_version: str) -> CachedOSRM:
    """Read a caller-owned local table cache; never contact a public endpoint."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("code") != "Ok":
        raise ValueError("OSRM cache is not a successful response")
    result = CachedOSRM(
        source=source,
        road_version=road_version,
        distances=raw["distances"],
        durations=raw["durations"],
    )
    n = len(result.distances)
    if (
        not n
        or len(result.durations) != n
        or any(len(r) != n for m in (result.distances, result.durations) for r in m)
    ):
        raise ValueError("OSRM cache must contain matching square tables")
    if any(
        v is not None and v < 0 for m in (result.distances, result.durations) for r in m for v in r
    ):
        raise ValueError("OSRM cache has negative matrix values")
    return result


def schematic_geometry(points):
    result = []
    for point in points:
        if result:
            corner = (point[0], result[-1][1])
            if corner != result[-1]:
                result.append(corner)
        if not result or point != result[-1]:
            result.append(point)
    return result
