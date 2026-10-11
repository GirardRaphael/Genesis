"""Recovery rehearsal uses synthetic temporary databases, never operator state."""

from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
import json
import sqlite3

import pytest
from sqlalchemy import insert

from genesis.backup import RecoveryError, backup_database, main, restore_database
from genesis.db import PROJECT_ID, Store, artifacts, orders, reservations
from genesis.dispatch import _metadata, _trips
from genesis.fleet_config import bind_fleet


@pytest.fixture
def database(store):
    _metadata.create_all(store.engine)
    bind_fleet(store.engine)
    run = store.create_run({"mode": "fixture", "scenario_id": "S01"}, "recovery")
    with store.transaction() as conn:
        conn.execute(insert(orders).values(
            id="synthetic-order", project_id=PROJECT_ID, reference_key="fixture",
            input={"reference": "Fixture", "parcels": 2}, input_hash="fixture-hash",
            status="planned", plan_id=run["id"], version=2,
            created_at=run["created_at"], updated_at=run["created_at"],
        ))
        conn.execute(insert(artifacts).values(
            id="synthetic-plan", project_id=PROJECT_ID, run_id=run["id"],
            kind="accepted_plan", content_hash="fixture-plan-hash",
            content={"routes": [{"vehicle_id": "van1", "order_id": "synthetic-order"}]},
            created_at=run["created_at"],
        ))
        conn.execute(insert(reservations), [
            {"attempt_id": "settled", "run_id": run["id"], "amount": "0.3",
             "settled": "0.1234567", "status": "settled"},
            {"attempt_id": "uncertain", "run_id": run["id"], "amount": "0.7",
             "settled": None, "status": "held"},
        ])
        conn.execute(insert(_trips).values(
            id="synthetic-trip", name="Fixture", vehicle_id="van1", status="ready",
            request_json='{"order_id":"synthetic-order"}', route_json='{"distance_m":42}',
            request_hash="fixture-trip-hash", idempotency_key="fixture-trip",
            created_at=run["created_at"],
        ))
    return store, run


def contents(path):
    with closing(sqlite3.connect(path)) as connection:
        return list(connection.iterdump())


@pytest.mark.parametrize("has_roster", [False, True])
def test_legacy_and_configured_fleet_snapshots_preserve_exact_tables(database, tmp_path, has_roster):
    store, _ = database
    source = store.engine.url.database
    with closing(sqlite3.connect(source)) as connection:
        if not has_roster:
            connection.execute("DROP TABLE dispatch_fleet_config")
        connection.commit()
    expected = contents(source)
    bundle = tmp_path / "fleet-backup"
    restored = tmp_path / "fleet-restored.sqlite"
    backup_database(source, bundle)
    restore_database(bundle, restored)
    assert contents(restored) == expected


def test_online_wal_snapshot_restore_preserves_projection_and_ledger(database, tmp_path):
    store, run = database
    source = store.engine.url.database
    bundle, restored = tmp_path / "backup", tmp_path / "restored.sqlite"
    with closing(sqlite3.connect(source)) as writer:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("UPDATE reservations SET amount='0.8' WHERE attempt_id='uncertain'")
        writer.commit()
        original = contents(source)
        # An uncommitted concurrent change must never enter the recovery snapshot.
        writer.execute("UPDATE reservations SET amount='9' WHERE attempt_id='uncertain'")
        manifest = backup_database(source, bundle)
        writer.rollback()
        assert contents(source) == original
        assert manifest["scope"] == "application_database_only"
        assert not (bundle / "database.sqlite3-wal").exists()
        assert restore_database(bundle, restored)["integrity_check"] == "ok"
        assert contents(restored) == original
    recovered = Store(f"sqlite:///{restored}")
    try:
        assert recovered.get_run(run["id"]) == store.get_run(run["id"])
        assert recovered.history(run["id"]) == store.history(run["id"])
        assert contents(restored) == original
    finally:
        recovered.engine.dispose()


def test_refuses_existing_destinations_without_modifying_them(database, tmp_path):
    store, _ = database
    source = store.engine.url.database
    bundle = tmp_path / "backup"
    backup_database(source, bundle)
    before = contents(source)
    with pytest.raises(FileExistsError):
        backup_database(source, bundle)
    with pytest.raises(FileExistsError):
        restore_database(bundle, source)
    assert contents(source) == before
    empty = tmp_path / "empty.sqlite"
    empty.touch()
    with pytest.raises(FileExistsError):
        restore_database(bundle, empty)
    assert empty.read_bytes() == b""


@pytest.mark.parametrize("change", ["checksum", "schema_version", "format_version", "wal"])
def test_rejects_modified_or_nonoffline_bundle(database, tmp_path, change):
    store, _ = database
    bundle, restored = tmp_path / "backup", tmp_path / "restored.sqlite"
    backup_database(store.engine.url.database, bundle)
    if change == "checksum":
        with (bundle / "database.sqlite3").open("ab") as stream:
            stream.write(b"corrupt")
    elif change == "wal":
        (bundle / "database.sqlite3-wal").touch()
    else:
        path = bundle / "manifest.json"
        manifest = json.loads(path.read_text())
        manifest[change] = "unsupported"
        path.write_text(json.dumps(manifest))
    with pytest.raises(RecoveryError):
        restore_database(bundle, restored)
    assert not restored.exists()


@pytest.mark.parametrize("change", [
    "missing_table", "missing_constraint", "partial_unique", "hidden_column", "version", "corrupt",
])
def test_rejects_incompatible_source_without_complete_manifest(database, tmp_path, change):
    store, _ = database
    source = store.engine.url.database
    store.engine.dispose()
    if change == "corrupt":
        from pathlib import Path
        Path(source).write_bytes(b"not a database")
    else:
        with closing(sqlite3.connect(source)) as conn:
            if change == "missing_table":
                conn.execute("DROP TABLE broker_orders")
            elif change == "missing_constraint":
                conn.execute("ALTER TABLE broker_orders RENAME TO discarded")
                conn.execute("CREATE TABLE broker_orders AS SELECT * FROM discarded")
                conn.execute("DROP TABLE discarded")
            elif change == "partial_unique":
                conn.execute("CREATE UNIQUE INDEX partial_key ON reservations(run_id) "
                             "WHERE status='held'")
            elif change == "hidden_column":
                conn.execute("ALTER TABLE reservations ADD COLUMN extra TEXT "
                             "GENERATED ALWAYS AS (amount) VIRTUAL")
            else:
                conn.execute("PRAGMA user_version=99")
            conn.commit()
    bundle = tmp_path / "backup"
    with pytest.raises((RecoveryError, sqlite3.Error)):
        backup_database(source, bundle)
    assert not (bundle / "manifest.json").exists()


def test_core_store_without_dispatch_is_supported(store, tmp_path):
    bundle = tmp_path / "backup"
    backup_database(store.engine.url.database, bundle)
    restore_database(bundle, tmp_path / "restored.sqlite")


def test_restore_failure_removes_only_its_new_destination(database, tmp_path):
    store, _ = database
    source = store.engine.url.database
    bundle, restored = tmp_path / "backup", tmp_path / "restored.sqlite"
    backup_database(source, bundle)
    before = contents(source)
    manifest_path = bundle / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["schema_sha256"] = "wrong"
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(RecoveryError, match="Restored schema"):
        restore_database(bundle, restored)
    assert not restored.exists()
    assert contents(source) == before
    assert (bundle / "database.sqlite3").exists()


def test_destination_sidecars_are_preserved(database, tmp_path):
    store, _ = database
    bundle, restored = tmp_path / "backup", tmp_path / "restored.sqlite"
    backup_database(store.engine.url.database, bundle)
    sidecar = tmp_path / "restored.sqlite-wal"
    sidecar.write_bytes(b"existing")
    with pytest.raises(RecoveryError, match="sidecar"):
        restore_database(bundle, restored)
    assert sidecar.read_bytes() == b"existing"
    assert not restored.exists()


def test_concurrent_restore_has_only_one_winner(database, tmp_path):
    store, _ = database
    bundle, restored = tmp_path / "backup", tmp_path / "restored.sqlite"
    backup_database(store.engine.url.database, bundle)

    def attempt():
        try:
            restore_database(bundle, restored)
            return "restored"
        except FileExistsError:
            return "refused"

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: attempt(), range(2))) == ["refused", "restored"]
    assert contents(restored) == contents(store.engine.url.database)


def test_cli_is_explicit_bounded_and_reports_no_row_data(database, tmp_path, capsys):
    store, _ = database
    bundle = tmp_path / "backup"
    main(["backup", store.engine.url.database, str(bundle)])
    assert json.loads(capsys.readouterr().out)["format_version"] == 1
    main(["restore", str(bundle), str(tmp_path / "restored.sqlite")])
    assert json.loads(capsys.readouterr().out)["integrity_check"] == "ok"
    with pytest.raises(SystemExit) as failure:
        main(["backup", "missing.sqlite", str(tmp_path / "invalid")])
    assert failure.value.code == 1
    for timeout in (0, -1, 301, float("nan")):
        with pytest.raises(RecoveryError):
            backup_database(store.engine.url.database, tmp_path / "invalid", timeout)


def test_busy_source_times_out_without_complete_bundle(database, tmp_path):
    store, _ = database
    source = store.engine.url.database
    bundle = tmp_path / "backup"
    with closing(sqlite3.connect(source)) as writer:
        writer.execute("BEGIN EXCLUSIVE")
        with pytest.raises((RecoveryError, sqlite3.Error)):
            backup_database(source, bundle, timeout_seconds=0.05)
        writer.rollback()
    assert not (bundle / "manifest.json").exists()
