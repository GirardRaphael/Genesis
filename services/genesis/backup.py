"""Explicit-path SQLite snapshots and restore rehearsals; never opens application settings."""

from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import json
import math
from pathlib import Path
import sqlite3
import time

from sqlalchemy import create_engine

from .db import metadata, now
from .dispatch import _metadata as dispatch_metadata

FORMAT_VERSION = 1
SCHEMA_VERSION = "genesis-u17-v1"


class RecoveryError(ValueError):
    """A snapshot cannot safely be used with this application version."""


def _deadline(timeout_seconds):
    if not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 300:
        raise RecoveryError("Timeout must be greater than zero and at most 300 seconds")
    return time.monotonic() + timeout_seconds


def _check_time(deadline):
    if time.monotonic() >= deadline:
        raise RecoveryError("Recovery operation exceeded its time limit")


def _open_readonly(path, deadline):
    connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=0.1)
    connection.execute("PRAGMA trusted_schema=OFF")
    connection.set_progress_handler(lambda: int(time.monotonic() >= deadline), 1000)
    return connection


def _shape(connection):
    result = {}
    for (name,) in connection.execute(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ):
        quoted = '"' + name.replace('"', '""') + '"'
        columns = sorted(
            (row[1], row[2].upper(), row[3], row[5], row[6])
            for row in connection.execute(f"PRAGMA table_xinfo({quoted})")
        )
        unique = []
        for index in connection.execute(f"PRAGMA index_list({quoted})"):
            if index[2]:
                index_name = '"' + index[1].replace('"', '""') + '"'
                unique.append((tuple(
                    row[2] for row in connection.execute(f"PRAGMA index_info({index_name})")
                ), bool(index[4])))
        result[name] = (columns, sorted(unique))
    return result


def _validate(connection, deadline):
    _check_time(deadline)
    if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise RecoveryError("SQLite integrity check failed")
    if connection.execute("PRAGMA foreign_key_check").fetchone():
        raise RecoveryError("SQLite foreign-key check failed")
    if connection.execute("PRAGMA user_version").fetchone()[0] != 0:
        raise RecoveryError("Unsupported SQLite schema version")
    if connection.execute("PRAGMA application_id").fetchone()[0] != 0:
        raise RecoveryError("Unsupported SQLite application identifier")
    if connection.execute(
        "SELECT 1 FROM sqlite_schema WHERE type IN ('trigger', 'view') LIMIT 1"
    ).fetchone():
        raise RecoveryError("Unsupported SQLite schema objects")
    expected_engine = create_engine("sqlite:///:memory:")
    try:
        metadata.create_all(expected_engine)
        dispatch_metadata.create_all(expected_engine)
        with expected_engine.connect() as reference:
            expected = _shape(reference.connection.driver_connection)
    finally:
        expected_engine.dispose()
    actual = _shape(connection)
    # Pre-U19 stores have no roster table; validate its exact shape whenever present.
    for optional in ("dispatch_trips", "dispatch_fleet_config"):
        if optional not in actual:
            expected.pop(optional, None)
    if actual != expected:
        raise RecoveryError("Database schema does not match this application version")
    schema = connection.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name"
    ).fetchall()
    _check_time(deadline)
    return hashlib.sha256(json.dumps(schema).encode()).hexdigest()


def _hash(path, deadline):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            _check_time(deadline)
            checksum.update(block)
    return checksum.hexdigest()


def _copy(source, target, deadline):
    with closing(_open_readonly(source, deadline)) as origin:
        with closing(sqlite3.connect(target)) as destination:
            origin.backup(destination, pages=128, sleep=0.05,
                          progress=lambda *_: _check_time(deadline))
            # A standalone bundle must not depend on WAL files from its source.
            destination.execute("PRAGMA journal_mode=DELETE")
            destination.set_progress_handler(lambda: int(time.monotonic() >= deadline), 1000)
            return _validate(destination, deadline)


def backup_database(source_path, new_backup_directory, timeout_seconds=30):
    """Capture a consistent application DB while writers remain online, into a new bundle."""
    deadline = _deadline(timeout_seconds)
    source = Path(source_path).resolve(strict=True)
    bundle = Path(new_backup_directory).absolute()
    if not source.is_file():
        raise RecoveryError("Source must be an existing SQLite file")
    bundle.mkdir()  # Exclusive creation is also the concurrency/overwrite guard.
    database = bundle / "database.sqlite3"
    schema_hash = _copy(source, database, deadline)
    manifest = {
        "format_version": FORMAT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "created_at": now(),
        "sqlite_version": sqlite3.sqlite_version,
        "database_sha256": _hash(database, deadline),
        "schema_sha256": schema_hash,
        "size_bytes": database.stat().st_size,
        "scope": "application_database_only",
    }
    # The manifest is the completion marker; retain failed snapshots without one.
    with (bundle / "manifest.json").open("x", encoding="utf-8") as stream:
        json.dump(manifest, stream, indent=2)
    return manifest


def restore_database(backup_directory, new_database_path, timeout_seconds=30):
    """Verify a completed offline bundle and copy it to an exclusively created DB path."""
    deadline = _deadline(timeout_seconds)
    bundle = Path(backup_directory).resolve(strict=True)
    manifest_path = bundle / "manifest.json"
    if manifest_path.stat().st_size > 16_384:
        raise RecoveryError("Invalid backup manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or (
        manifest.get("format_version") != FORMAT_VERSION
        or manifest.get("schema_version") != SCHEMA_VERSION
        or manifest.get("scope") != "application_database_only"
    ):
        raise RecoveryError("Unsupported backup or schema version")
    source = bundle / "database.sqlite3"
    if source.is_symlink() or any(Path(str(source) + suffix).exists()
                                 for suffix in ("-wal", "-shm", "-journal")):
        raise RecoveryError("Backup must be an offline standalone database")
    if source.stat().st_size != manifest.get("size_bytes") or (
        _hash(source, deadline) != manifest.get("database_sha256")
    ):
        raise RecoveryError("Backup checksum or size does not match its manifest")
    target = Path(new_database_path).absolute()
    if any(Path(str(target) + suffix).exists() for suffix in ("-wal", "-shm", "-journal")):
        raise RecoveryError("Destination has existing SQLite sidecar files")
    # Never overwrite even an empty existing file, symlink, or concurrent restore.
    with target.open("xb"):
        pass
    try:
        schema_hash = _copy(source.resolve(strict=True), target, deadline)
        if schema_hash != manifest.get("schema_sha256"):
            raise RecoveryError("Restored schema does not match its manifest")
        # Detect accidental edits to the offline bundle during the operation.
        if _hash(source, deadline) != manifest["database_sha256"]:
            raise RecoveryError("Backup changed during restore")
        restored_hash = _hash(target, deadline)
    except BaseException:
        target.unlink()
        raise
    return {"format_version": FORMAT_VERSION, "schema_version": SCHEMA_VERSION,
            "database_sha256": restored_hash, "integrity_check": "ok",
            "scope": "application_database_only"}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("backup", "restore"))
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--timeout-seconds", type=float, default=30)
    args = parser.parse_args(argv)
    try:
        operation = backup_database if args.operation == "backup" else restore_database
        result = operation(args.source, args.destination, args.timeout_seconds)
    except (OSError, sqlite3.Error, ValueError):
        parser.exit(1, "Recovery failed: verify paths, schema, backup integrity and time limit.\n")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
