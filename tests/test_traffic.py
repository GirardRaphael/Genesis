from datetime import datetime, timezone
import pytest
import httpx
from genesis import traffic

from genesis.traffic import parse_worksites


def test_worksite_periods_coordinates_and_updated_timestamp():
    rows = "id,longitude,latitude,duration_start_date,duration_end_date,load_date,occupancy_name\n"
    rows += "active,-73.6,45.5,2026-10-01T00:00:00Z,2026-10-30T00:00:00Z,2026-10-10T00:00:00Z,Declared worksite\n"
    rows += (
        "expired,-73.6,45.5,2026-09-01T00:00:00Z,2026-09-30T00:00:00Z,2026-10-10T00:00:00Z,Old\n"
    )
    rows += "bad,NaN,45.5,2026-10-01T00:00:00Z,2026-10-30T00:00:00Z,,Invalid\n"
    items, updated = parse_worksites(rows, datetime(2026, 10, 10, tzinfo=timezone.utc))
    assert [item["id"] for item in items] == ["active"]
    assert items[0]["coordinates"] == [-73.6, 45.5]
    assert updated == "2026-10-10T00:00:00+00:00"


def test_invalid_feed_is_not_a_successful_empty_traffic_result():
    with pytest.raises(ValueError, match="schema"):
        parse_worksites("<html>unavailable</html>", datetime.now(timezone.utc))


def test_official_redirect_is_followed_cached_and_failure_retains_stale_data(monkeypatch):
    original_client = httpx.Client
    calls = []
    today = datetime.now(timezone.utc).isoformat()
    csv = "id,longitude,latitude,duration_start_date,duration_end_date,load_date\n"
    csv += f"worksite,-73.6,45.5,2000-01-01T00:00:00Z,2100-01-01T00:00:00Z,{today}\n"

    def transport(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(302, headers={"Location": "https://example.test/city.csv"})
        return httpx.Response(200, text=csv)

    monkeypatch.setattr(traffic, "_cache", None)
    monkeypatch.setattr(traffic, "_expires", 0)
    monkeypatch.setattr(
        traffic.httpx,
        "Client",
        lambda **kwargs: original_client(transport=httpx.MockTransport(transport), **kwargs),
    )
    result = traffic.worksites()
    assert result["available"] and not result["stale"] and result["total"] == 1
    assert len(calls) == 2 and traffic.worksites() == result and len(calls) == 2
    monkeypatch.setattr(traffic, "_expires", 0)

    def unavailable(request):
        raise httpx.ConnectError("unavailable", request=request)

    monkeypatch.setattr(
        traffic.httpx,
        "Client",
        lambda **kwargs: original_client(transport=httpx.MockTransport(unavailable), **kwargs),
    )
    failed = traffic.worksites()
    assert not failed["available"] and failed["stale"]
    assert failed["items"] == result["items"] and failed["fetched_at"] == result["fetched_at"]
