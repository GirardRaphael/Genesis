# Local database backup and recovery rehearsal

## Task record and scope

U18 recovery slice supports R05/R14/R15/R18 and U02/U05/U07/U11/U17, the DATA-CONTRACT retention/recovery requirement and the transport checklist's production-recovery gate. Owned files: `services/genesis/backup.py`, `tests/test_backup.py`, and this document. Dependencies: the current SQLite schema in `genesis.db`, optional `dispatch_trips` schema, Python SQLite online backup, and the installed SQLAlchemy runtime. No dependency, application schema, HTTP endpoint or running-service change.

Acceptance: create a consistent online snapshot; verify integrity, current schema and backup format; restore exclusively to a new file; preserve orders, plan artifacts, dispatch trips, events, budgets, settled charges and uncertain held reservations; reject corruption, incompatible versions, existing destinations and incomplete snapshots; rehearse only on synthetic temporary fixtures. The lead owns shared README, contract, decision and action-log updates and independent review.

Excluded: switching the operator application to a restored DB, recovering a worker, changing money records, PostgreSQL backup/restore, remote storage/encryption, scheduled retention/deletion, external calls and provider/email execution. The running operator API, web server, worker and database were not accessed or restarted by this task.

## Commands

Run from the repository root with the installed virtual environment. Supply explicit filesystem paths, not database URLs. Parent directories must already exist. Choose a private backup folder outside synced/public directories; snapshots contain the same private operational data as the source database. The commands do not read `.env` or use `GENESIS_DATABASE_URL`.

```powershell
$env:PYTHONPATH = Join-Path $PWD 'services'
# Example paths only: confirm the actual application database path yourself.
# The source may remain online; the destination directory must not exist.
.\.venv\Scripts\python.exe -m genesis.backup backup C:\private\genesis.db C:\private\backups\snapshot-20261011 --timeout-seconds 30

# Keep this backup bundle offline. The destination database must not exist.
# This command does not launch the application or a worker.
.\.venv\Scripts\python.exe -m genesis.backup restore C:\private\backups\snapshot-20261011 C:\private\rehearsal\restored.sqlite --timeout-seconds 30
```

Python entrypoints are `backup_database(source_path, new_backup_directory, timeout_seconds=30)` and `restore_database(backup_directory, new_database_path, timeout_seconds=30)`. Both return metadata only. The CLI emits JSON on success and exits 1 with a generic diagnostic on failure; no record contents or raw database errors are printed. Timeouts must be greater than zero and at most 300 seconds; busy-copy retry and SQLite validation work are bounded by the deadline. Filesystem I/O can still depend on OS/storage responsiveness.

The bundle contains `database.sqlite3` and a small `manifest.json`. Manifest format 1 records a `genesis-u17-v1` compatibility label, UTC creation time, SQLite runtime version, database size/SHA256, schema SHA256 and `application_database_only` scope. This label is a recovery-tool compatibility contract, not a claim that the application has adopted a migration framework. Current application `user_version` and `application_id` are both zero; other values are rejected. Current core tables, column types/nullability/primary keys and unique keys must match the installed application declarations. `dispatch_trips` and `dispatch_fleet_config` are optional for legacy U17 snapshots and are fully schema-validated when present. Unknown tables, triggers or views are rejected. Additive application changes require a reviewed recovery compatibility update.

SQLite's online backup copies a consistent committed state including WAL-backed transactions; copying just the live `.db` file would not provide that guarantee. The copy becomes a standalone rollback-journal database. It passes SQLite integrity/foreign-key checks and current-schema checks before a manifest is written. An interrupted or rejected backup can leave a new incomplete directory for diagnosis; without a valid manifest it cannot restore. Keep incomplete bundles separate and remove them manually only after inspecting the exact path.

Restore verifies manifest version, size and SHA256 before opening the snapshot, rejects SQLite sidecars/symlinked snapshot files, then repeats integrity/schema checks on the restored copy. It refuses existing destination files, even empty files, and existing destination sidecars. Exclusive file creation also prevents two restores from overwriting one another. A normal validation failure removes only the newly created destination; interruption by process termination may leave a partial destination that must be inspected and removed before choosing a new path. Use trusted private directories: these tools do not defend against another local process maliciously replacing files during execution. Checksums detect accidental changes; they do not authenticate a bundle against someone who can rewrite both files. Protect and independently retain the manifest where that threat matters.

## Recovery boundary: do not resume from this snapshot alone

Orders, accepted-plan artifacts, trips, event/outbox rows and the complete application cost ledger are in the application database. The restored fixture proves their preservation, including unresolved reservations; it does not release held funds or retry uncertain calls.

LangGraph uses a separate `data/checkpoints.sqlite` by default. It is **not included** in this bundle, and two separate online database backups would not establish a cross-database transaction boundary. Configuration/secrets, external traces and filesystem artifacts are also outside this scope. Queued work, pending exports and budget emails remain pending in a restored DB. Do not start a worker against a rehearsal copy or point existing services at it: that could replay external work. Full recovery needs a separately reviewed quiesced application/checkpoint procedure, reconciliation of uncertain provider/SMTP outcomes, and independent worker/fencing fault tests. Revisit this boundary before any restored-database cutover or unattended backup requirement.

## Verification and action record — 2026-10-11

Actor: Codex recovery subagent; actual model identity was not exposed to this subagent, and no model evaluation is claimed. Applied the installed Ponytail skill. Read the operating contract, README, PLAN, REQUIREMENTS, DATA-CONTRACT, LOGISTICS-SPEC, MODEL-POLICY, relevant source/tests, launch/check scripts, Compose definition, example environment and transport checklist. No private environment values were read.

Implemented the three owned files using `apply_patch`. Rehearsal uses temporary SQLite fixtures only: a committed WAL update and an uncommitted concurrent write, saved synthetic order/plan/trip data, full dump comparison before/after restore, restored Store run/history projection, settled and held reservations, legacy snapshots without optional dispatch schema, configured schema validation, incompatible/corrupt schema, manifest tampering, incomplete backups, overwrite refusal, bounded busy-lock failure, orphan destination sidecars and simultaneous restore attempts. The focused recovery suite passed 20 tests; Ruff passed. No paid APIs, SMTP, operator ledger or live application data were used.

Read-only PostgreSQL feasibility checks: `Get-Command docker, psql, pg_isready, postgres`, `Get-Service com.docker.service`, local port 5432 listener inspection and `docker version --format '{{json .Server}}'`. Docker CLI is installed; `com.docker.service` was stopped and the Docker Desktop Linux-engine named pipe was unavailable. PostgreSQL commands were not found on PATH; no listener on port 5432 was detected. No Docker daemon was started, no image pulled, and no container/database installed or created. Thus PostgreSQL transaction, lease, concurrency and recovery behavior remains **unverified**, and the production-recovery checklist remains open.

When a daemon is separately available, propose an isolated PostgreSQL instance with its own generated temporary credentials, loopback ephemeral port and disposable storage; ensure no operator DSN/configuration is reused. Run application transaction/claim/budget/order-conflict and restore tests there before any production claim. This is a next-action proposal, not executed evidence.
