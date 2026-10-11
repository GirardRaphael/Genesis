"""Temporary-database checks for durable intake and atomic broker claims."""

from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timedelta, timezone
import io
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import insert, select, update

from genesis.broker_api import register_broker
from genesis.broker_runtime import BrokerRuntime
from genesis.db import LostLease, Store, orders, reservations
from genesis.dispatch import _ready_values, _trips, register_dispatch
from genesis.orders import CSV_FIELDS, preview_csv, register_orders
from test_broker_runtime import _matrix, _route


@pytest.fixture
def api(store):
    app = FastAPI()
    app.state.store = store
    app.state.reload_local_env = False
    register_dispatch(app)
    register_orders(app)
    register_broker(app)
    return TestClient(app)


def source(reference="ORD-1"):
    return {
        "reference": reference, "customer": "Atelier, Montréal", "service_date": "2026-10-11",
        "pickup": {"label": "Pickup", "coordinates": [-73.56, 45.50]},
        "dropoff": {"label": "Dropoff", "coordinates": [-73.55, 45.50]},
        "parcels": 4, "deadline_minutes": 120,
    }


def save(api, *items):
    response = api.post("/api/v1/orders/batch", json={"items": items or [source()]})
    assert response.status_code == 201, response.text
    return response.json()["items"]


def plan(order, **changes):
    delivery = {key: order[key] for key in ("id", "pickup", "dropoff", "parcels", "deadline_minutes")}
    return {
        "deliveries": [delivery], "order_ids": [order["id"]], "depot": order["pickup"],
        "vehicle_ids": ["van1"], "mode": "live", "explanation_policy": "none", **changes,
    }


def post_plan(api, request, key):
    return api.post("/api/v1/dispatch/plans", json=request, headers={"Idempotency-Key": key})


def csv_text(rows=None, header=CSV_FIELDS):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(header)
    writer.writerows(rows if rows is not None else [[
        "ORD-1", "Atelier, Montréal", "2026-10-11", "Pickup", "-73.56", "45.50",
        "Dropoff", "-73.55", "45.50", "4", "120",
    ]])
    return output.getvalue()


def test_batch_atomic_casefolded_idempotency_and_restart(api, store):
    saved = save(api)[0]
    replay = save(api, source(" ord-1 "))[0]
    assert replay == saved
    response = api.post("/api/v1/orders/batch", json={"items": [source("new"), {**source(), "parcels": 5}]})
    assert response.status_code == 409
    assert api.get("/api/v1/orders").json()["total"] == 1
    restarted = Store(str(store.engine.url))
    with restarted.engine.connect() as conn:
        persisted = conn.execute(select(orders)).mappings().one()
    assert persisted["input"] == source()
    assert persisted["id"] == saved["id"]
    assert api.get("/api/v1/orders", params={"q": "ORD-"}).json()["total"] == 1
    assert api.get("/api/v1/orders", params={"q": "Atelier"}).json()["total"] == 1
    assert api.get("/api/v1/orders", params={"q": "%"}).json()["total"] == 0


def test_csv_preview_is_strict_nonmutating_and_roundtrips(api):
    response = api.post("/api/v1/orders/import/preview", json={"csv": "\ufeff" + csv_text()})
    preview = response.json()
    assert preview == {"items": [source()], "errors": []}
    assert api.get("/api/v1/orders").json()["total"] == 0
    assert save(api, *preview["items"])[0]["customer"] == "Atelier, Montréal"
    formula = csv_text().replace("ORD-1", "=1+1")
    assert preview_csv(formula)["items"][0]["reference"] == "=1+1"


@pytest.mark.parametrize("value", [
    "", csv_text(rows=[]), csv_text(header=CSV_FIELDS[:-1]),
    csv_text(header=CSV_FIELDS + ("unknown",)),
    csv_text(header=CSV_FIELDS[:-1] + ("reference",)),
    csv_text(rows=[["too", "short"]]),
    csv_text().replace("2026-10-11", "2026-02-30"),
    csv_text().replace("-73.56", "NaN"),
    csv_text().replace("-73.56", "0"),
    csv_text().replace("Pickup", '"broken'),
    csv_text() + csv_text().splitlines()[1] + "\r\n",
    "x" * 16385,
])
def test_csv_rejects_bad_headers_rows_bounds_duplicates(value):
    assert preview_csv(value)["errors"]


def test_csv_ten_row_cap():
    rows = list(csv.reader(io.StringIO(csv_text())))[1:]
    text = csv_text(rows=[ [f"REF-{i}", *rows[0][1:]] for i in range(11)])
    assert "at most 10" in preview_csv(text)["errors"][0]["message"]


def test_cancellation_optimistic_and_idempotent(api):
    order = save(api)[0]
    url = f"/api/v1/orders/{order['id']}/cancel"
    assert api.post(url, json={"version": 2}).status_code == 409
    response = api.post(url, json={"version": 1})
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert api.post(url, json={"version": 1}).json() == response.json()
    assert save(api)[0] == response.json()
    assert post_plan(api, plan(order), "cancelled").status_code == 409


def test_none_bypasses_provider_and_claims_immutable_sources(api, store, monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("Provider validation is forbidden for deterministic plans")
    monkeypatch.setattr("genesis.broker_api.live_configuration", forbidden)
    monkeypatch.setenv("GENESIS_PROVIDER", "not-a-provider")
    order = save(api)[0]
    request = plan(order)
    changed = plan(order)
    changed["deliveries"][0]["parcels"] = 5
    assert post_plan(api, changed, "tamper").status_code == 409
    assert not store.list_runs()
    assert api.get("/api/v1/orders").json()["items"][0] == order
    created = post_plan(api, request, "claim")
    assert created.status_code == 202
    run = store.get_run(created.json()["id"])
    assert run["request"]["budget_usd"] is None
    assert "model_policy" not in run["request"]
    persisted = api.get("/api/v1/orders").json()["items"][0]
    assert persisted["status"] == "planning" and persisted["plan_id"] == run["id"]
    assert all(persisted[key] == value for key, value in source().items())
    assert post_plan(api, request, "claim").json()["id"] == run["id"]
    assert post_plan(api, request, "competing").status_code == 409
    assert api.post(f"/api/v1/orders/{order['id']}/cancel", json={"version": persisted["version"]}).status_code == 409


@pytest.mark.parametrize("kind", ["ids_only", "extra_delivery", "wrong_id", "duplicate_ids"])
def test_tracked_selection_must_exactly_match_deliveries(api, kind):
    order = save(api)[0]
    request = plan(order)
    if kind == "ids_only":
        request["order_ids"] = ["00000000-0000-0000-0000-000000000099"]
    elif kind == "extra_delivery":
        request["deliveries"].append({**request["deliveries"][0], "id": "untracked"})
    elif kind == "wrong_id":
        request["deliveries"][0]["id"] = "wrong"
    else:
        request["order_ids"] *= 2
    assert post_plan(api, request, kind).status_code in {409, 422}


def test_concurrent_claim_and_same_key_replay(api, store):
    order = save(api)[0]
    request = plan(order)
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda key: post_plan(api, request, key), ["one", "two"]))
    assert sorted(response.status_code for response in responses) == [202, 409]
    assert len(store.list_runs()) == 1
    store.cancel(store.list_runs()[0]["id"])
    with ThreadPoolExecutor(2) as pool:
        replay = list(pool.map(lambda _: post_plan(api, request, "same"), range(2)))
    assert [response.status_code for response in replay] == [202, 202]
    assert replay[0].json()["id"] == replay[1].json()["id"]
    assert len(store.list_runs()) == 2


def test_failed_admission_rolls_back_claim_with_run(api, store, monkeypatch):
    order = save(api)[0]
    request = plan(order)
    request.update(workflow_kind="broker", scenario_id="BROKER")
    monkeypatch.setattr(store, "_event", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("simulated persistence failure")))
    with pytest.raises(RuntimeError):
        store.create_run(request, "rollback")
    assert not store.list_runs()
    assert api.get("/api/v1/orders").json()["items"][0] == order


@pytest.mark.parametrize("status,kind", [("failed", None), ("succeeded", "accepted_diagnostic"), ("cancelled", None), ("timed_out", None), ("budget_exceeded", None)])
def test_terminal_release_fenced_and_retryable(api, store, status, kind):
    order = save(api)[0]
    request = plan(order)
    run_id = post_plan(api, request, "initial").json()["id"]
    claimed = store.claim("worker")
    fence = (claimed["owner"], claimed["generation"])
    with pytest.raises(LostLease):
        store.finish(run_id, status, {"final_kind": kind}, ("stale-worker", 0))
    assert api.get("/api/v1/orders").json()["items"][0]["status"] == "planning"
    store.finish(run_id, status, {"final_kind": kind}, fence)
    reopened = api.get("/api/v1/orders").json()["items"][0]
    assert reopened["status"] == "open" and reopened["plan_id"] is None
    retry = post_plan(api, request, "retry")
    assert retry.status_code == 202
    store.finish(run_id, status, {}, fence)
    assert api.get("/api/v1/orders").json()["items"][0]["plan_id"] == retry.json()["id"]
    assert post_plan(api, request, "initial").json()["id"] == run_id


def test_completed_simulation_keeps_order_planned_and_unbillable(api, store, monkeypatch):
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    def forbidden(*_args, **_kwargs):
        raise AssertionError("No model/billing calls allowed")
    monkeypatch.setattr("genesis.workflow.ModelAdapter.explain", forbidden)
    monkeypatch.setattr(store, "reserve", forbidden)
    order = save(api)[0]
    request = plan(order)
    run_id = post_plan(api, request, "planned").json()["id"]
    BrokerRuntime(store, store.claim("worker")).execute()
    run = store.get_run(run_id)
    assert run["status"] == "succeeded" and run["detail"]["final_kind"] == "accepted_plan"
    assert len(run["detail"]["agents"]) == 5
    assert run["detail"]["certificate"]["valid"]
    with store.engine.connect() as conn:
        trips = conn.execute(select(_trips)).mappings().all()
        assert all(trip["status"] == "ready" for trip in trips)
        assert not conn.execute(select(reservations)).all()
    with store.engine.begin() as conn:
        conn.execute(update(_trips).values(status="running", started_at=(datetime.now(timezone.utc) - timedelta(days=1)).isoformat()))
    assert all(trip["status"] == "completed" for trip in api.get("/api/v1/dispatch/trips").json()["items"])
    persisted = api.get("/api/v1/orders").json()["items"][0]
    assert persisted["status"] == "planned" and persisted["plan_id"] == run_id
    assert post_plan(api, request, "duplicate-dispatch").status_code == 409
    assert post_plan(api, request, "planned").json()["id"] == run_id


@pytest.mark.parametrize("status,kind", [("failed", None), ("succeeded", "accepted_diagnostic")])
def test_terminal_release_retires_materialized_trips_atomically(api, store, monkeypatch, status, kind):
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    order = save(api)[0]
    run_id = post_plan(api, plan(order), "materialized").json()["id"]
    claimed = store.claim("worker")
    real_finish = store.finish
    # Leave the certified ready trips at the pre-finalization crash boundary.
    monkeypatch.setattr(store, "finish", lambda *_args, **_kwargs: None)
    BrokerRuntime(store, claimed).execute()
    with store.engine.connect() as conn:
        assert conn.execute(select(_trips.c.status)).scalars().all() == ["ready"]
    real_finish(run_id, status, {"final_kind": kind}, (claimed["owner"], claimed["generation"]))
    with store.engine.connect() as conn:
        assert conn.execute(select(_trips.c.status)).scalars().all() == ["cancelled"]
        assert conn.execute(select(orders.c.status)).scalar_one() == "open"
    assert post_plan(api, plan(order), "after-release").status_code == 202


def ready_proposal(api, store):
    order = save(api)[0]
    request = plan(order)
    run_id = post_plan(api, request, "proposal").json()["id"]
    claim = store.claim("worker")
    trip_ids = []
    with store.transaction() as conn:
        for vehicle in ("van1", "van2"):
            # Isolate lifecycle rules from the separately verified solver/certificate integration.
            row = _ready_values({
                "name": "Lifecycle fixture", "vehicle_id": vehicle,
                "deliveries": request["deliveries"], "owner_run_id": run_id,
            }, _route([order["pickup"], order["pickup"], order["dropoff"]]), "fixture", f"broker:{run_id}:{vehicle}")
            conn.execute(insert(_trips).values(**row))
            trip_ids.append(row["id"])
    store.finish(run_id, "succeeded", {"final_kind": "accepted_plan", "created_trip_ids": trip_ids}, (claim["owner"], claim["generation"]))
    return order, request, run_id, trip_ids


def test_rejecting_ready_trips_before_finalization_reopens_on_success(api, store, monkeypatch):
    monkeypatch.setattr("genesis.broker_runtime.road_matrix", _matrix)
    monkeypatch.setattr("genesis.dispatch._road_route", _route)
    order = save(api)[0]
    request = plan(order)
    run_id = post_plan(api, request, "early-rejection").json()["id"]
    real_finish = store.finish
    pending_finish = []
    monkeypatch.setattr(store, "finish", lambda *args: pending_finish.append(args))
    BrokerRuntime(store, store.claim("worker")).execute()
    assert len(pending_finish) == 1 and pending_finish[0][1] == "succeeded"
    assert store.get_run(run_id)["status"] == "running"
    trip_ids = pending_finish[0][2]["created_trip_ids"]
    assert trip_ids
    for trip_id in trip_ids:
        assert api.post(f"/api/v1/dispatch/trips/{trip_id}/cancel").status_code == 200
    assert api.get("/api/v1/orders").json()["items"][0]["status"] == "planning"
    real_finish(*pending_finish[0])
    reopened = api.get("/api/v1/orders").json()["items"][0]
    assert reopened["status"] == "open" and reopened["plan_id"] is None
    assert store.get_run(run_id)["request"]["order_ids"] == [order["id"]]
    assert post_plan(api, request, "early-rejection").json()["id"] == run_id
    assert post_plan(api, request, "retry-early-rejection").status_code == 202


def test_rejecting_all_unstarted_proposal_trips_reopens_orders(api, store):
    order, request, run_id, trip_ids = ready_proposal(api, store)
    assert api.post(f"/api/v1/dispatch/trips/{trip_ids[0]}/cancel").status_code == 200
    assert api.get("/api/v1/orders").json()["items"][0]["status"] == "planned"
    assert api.post(f"/api/v1/dispatch/trips/{trip_ids[1]}/cancel").status_code == 200
    reopened = api.get("/api/v1/orders").json()["items"][0]
    assert reopened["status"] == "open" and reopened["plan_id"] is None
    assert store.get_run(run_id)["request"]["order_ids"] == [order["id"]]
    assert post_plan(api, request, "proposal").json()["id"] == run_id
    retry = post_plan(api, request, "replan")
    assert retry.status_code == 202
    assert api.post(f"/api/v1/dispatch/trips/{trip_ids[0]}/cancel").status_code == 200
    assert api.get("/api/v1/orders").json()["items"][0]["plan_id"] == retry.json()["id"]


@pytest.mark.parametrize("uncertainty", ["started", "missing_trip"])
def test_proposal_rejection_cannot_release_started_or_unknown_work(api, store, uncertainty):
    _order, request, run_id, trip_ids = ready_proposal(api, store)
    if uncertainty == "started":
        with store.transaction() as conn:
            conn.execute(update(_trips).where(_trips.c.id == trip_ids[0]).values(
                status="cancelled", started_at=datetime.now(timezone.utc).isoformat(),
                cancelled_at=datetime.now(timezone.utc).isoformat(),
            ))
    else:
        store.update_detail(run_id, {"created_trip_ids": trip_ids + [str(uuid4())]})
    for trip_id in trip_ids:
        assert api.post(f"/api/v1/dispatch/trips/{trip_id}/cancel").status_code == 200
    assert api.get("/api/v1/orders").json()["items"][0]["status"] == "planned"
    assert post_plan(api, request, "cannot-duplicate").status_code == 409


def test_start_and_reject_race_never_reopens_started_order(api, store):
    _order, _request, _run_id, trip_ids = ready_proposal(api, store)
    api.post(f"/api/v1/dispatch/trips/{trip_ids[1]}/cancel")
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda action: api.post(f"/api/v1/dispatch/trips/{trip_ids[0]}/{action}"), ["start", "cancel"]))
    assert results[1].status_code == 200
    with store.engine.connect() as conn:
        trip = conn.execute(select(_trips).where(_trips.c.id == trip_ids[0])).mappings().one()
    order = api.get("/api/v1/orders").json()["items"][0]
    assert order["status"] == ("open" if trip["started_at"] is None else "planned")
