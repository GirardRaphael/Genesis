"""Timestamped municipal worksite permits; never a measured traffic-speed feed."""

import csv
from datetime import datetime, timezone, timedelta
import io
import math
import threading
import time

from fastapi import APIRouter
import httpx

SOURCE = "https://donnees.montreal.ca/dataset/667342f7-f667-4c3c-9837-65e81312cd8d/resource/cc41b532-f12d-40fb-9f55-eb58c9a2b12b/download/entraves-travaux-en-cours.csv"
DATASET = "https://donnees.montreal.ca/dataset/entraves-et-travaux-en-cours"
router = APIRouter(prefix="/api/v1/dispatch")
_lock = threading.Lock()
_cache = None
_expires = 0


def parse_worksites(content, at):
    items = []
    updated = None
    rows = csv.DictReader(io.StringIO(content))
    if not {"id", "longitude", "latitude", "duration_start_date", "duration_end_date"} <= set(
        rows.fieldnames or []
    ):
        raise ValueError("Municipal feed schema unavailable")
    for row in rows:
        try:
            lon, lat = float(row["longitude"]), float(row["latitude"])
            start = datetime.fromisoformat(row["duration_start_date"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(row["duration_end_date"].replace("Z", "+00:00"))
            if not start.tzinfo or not end.tzinfo:
                continue
            if not (
                math.isfinite(lon)
                and math.isfinite(lat)
                and -74.05 <= lon <= -73.42
                and 45.38 <= lat <= 45.74
            ):
                continue
            if row.get("load_date"):
                loaded = datetime.fromisoformat(row["load_date"].replace("Z", "+00:00"))
                if loaded.tzinfo and (updated is None or loaded > updated):
                    updated = loaded
            if not start <= at <= end:
                continue
            items.append(
                {
                    "id": row["id"],
                    "label": row.get("occupancy_name", "")[:300],
                    "borough": row.get("boroughid", "")[:100],
                    "coordinates": [lon, lat],
                    "starts_at": start.isoformat(),
                    "ends_at": end.isoformat(),
                    "reason": row.get("reason_category", "")[:300],
                }
            )
        except (ValueError, KeyError, TypeError):
            continue
    return items[:2000], updated.isoformat() if updated else None


@router.get("/traffic")
def worksites():
    global _cache, _expires
    with _lock:
        if time.monotonic() < _expires and _cache is not None:
            return _cache
        try:
            # One cached request per 15 minutes; no automatic route recalculation.
            with httpx.Client(
                timeout=10,
                follow_redirects=True,
                max_redirects=3,
                headers={
                    "User-Agent": "GenesisObservatory/0.1 (https://github.com/GirardRaphael/Genesis)"
                },
            ) as client:
                with client.stream("GET", SOURCE) as response:
                    response.raise_for_status()
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > 2_000_000:
                            raise ValueError("Feed exceeds configured limit")
                        chunks.append(chunk)
            fetched = datetime.now(timezone.utc)
            items, updated = parse_worksites(b"".join(chunks).decode("utf-8-sig"), fetched)
            _cache = {
                "items": items,
                "total": len(items),
                "source_url": SOURCE,
                "fetched_at": fetched.isoformat(),
                "source_updated_at": updated,
                "available": True,
                "stale": updated is None
                or not timedelta(hours=-1)
                <= fetched - datetime.fromisoformat(updated)
                <= timedelta(hours=36),
                "limits": "Declared worksite permit periods; daily source, not measured live traffic speeds, exact active work hours, or automatic route avoidance",
            }
            _expires = time.monotonic() + 900
        except (httpx.HTTPError, ValueError, UnicodeError):
            _cache = {
                **(
                    _cache
                    or {
                        "items": [],
                        "total": 0,
                        "source_url": SOURCE,
                        "fetched_at": None,
                        "source_updated_at": None,
                        "limits": "Municipal worksite permits unavailable; no live traffic-speed data",
                    }
                ),
                "available": False,
                "stale": True,
            }
            _expires = time.monotonic() + 60
        return _cache
