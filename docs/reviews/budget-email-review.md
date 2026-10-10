# Independent U13 budget-email review

Status: **approved for the scoped local prototype; external email activation remains unconfigured and unverified**. Date: 2026-10-10. Reviewed base: `3737e6cf0f5412834a97a35578ce5a4d016a2b36`. Content SHA256: `fd9c4b1f082d82d3517b870240de345dd149ea773dba3e623d82e7a303047b27` over the 23 normalized-LF source, contract, test and evidence files in [budget-email-manifest.json](budget-email-manifest.json).

Reviewer: independent `budget_email_verifier` Codex context, separate from implementation owners; assigned `gpt-6-astra` / high according to the lead's explicit spawn configuration, with model identity not independently exposed in this context. This reviewer made no external SMTP connection, paid provider call, operator-database mutation, commit or push.

## Task record

- Requirement/work IDs: U13 budget-limit notification, U07 persistent all-request ledger, U02 documentation, U05 independent review, R18 confidentiality.
- Owned files: this review and `docs/reviews/budget-email-manifest.json`. The lead owns ACTION-LOG, contracts, integrated evidence and publication. The reviewer did not change implementation or approve its own code.
- Dependencies read: AGENTS.md; the Ponytail skill; README; PLAN; REQUIREMENTS; DATA-CONTRACT; BUDGET; LOGISTICS-SPEC; MODEL-POLICY; BACKLOG; BUDGET-EMAIL; ADR D31; source, tests and assigned U13 handoff.
- Acceptance: one durable project notification across restarts; atomic budget transition and trigger snapshot; exclusion of run-local failures; separate known costs/held reservations; truthful prospective-denial and freeze reasons; validated SMTP configuration and verified TLS; redacted public status; committed send intent with fenced completion; bounded known pre-DATA retries; ambiguous DATA/crash recovery without automatic resend; accepted DATA survives QUIT failure; reads do not send; SMTP delay does not hold the budget transaction or prevent cost display.
- Exclusions: external email delivery/provider login, paid model calls, production/PostgreSQL operation, commercial deployment approval, operator-budget changes and publication. Recipient and SMTP configuration remain operator inputs.

## Findings and corrections

1. **Minor diagnostic wording.** The initial UI directed users to worker transport logs even though the implementation intentionally suppresses raw SMTP exceptions. The UI owner changed this to recorded state and the mail service/inbox, and renders only a six-value allowlist of fixed safe error codes. Private or unexpected strings remain suppressed. Final source and screenshots confirm the correction.
2. **Minor stale-completion reporting.** A separate disposable-database check expired a sending lease while the original sender remained active. The durable state correctly became uncertain and prevented duplicate delivery, but the original drain could report one successful send even when its completion update was fenced out. The owner now requires the final update's rowcount to equal one before returning success. The new regression proves no overwrite, false success count or subsequent resend. The independent post-fix suite passed.
3. **Documentation gate.** ADR D31 was added before approval to record the database queue, separate SMTP worker, standard-library/TLS choice, bounded pre-DATA retries and explicit absence of ambiguous resend/reset. The final decision and operating contract match the implementation.

No unresolved blocking finding remains in the reviewed local scope.

## Independent evidence

- Inspected the entire change from the reviewed base, including the additive table, budget admission/settlement changes, sender, worker, API, UI, exported endpoint, QA isolation, tests, setup and contracts. Shared budget locking serializes reservations, settlements and alert capture; project ID is the unique alert key. Global budget denials raise after committing the alert, and stale worker fences are checked before insertion. Invalid runtime budget settings cannot roll back known settlement or overrun freeze.
- Reviewed startup/periodic backfill and frozen trigger snapshots; three total known pre-DATA attempts; persisted claim/lease and terminal uncertain recovery; verified STARTTLS/SMTPS; literal-loopback-only credential-free fixture transport; address/header validation; and allowlisted public status. SMTP executes outside the database transaction. Current totals and alert status poll independently, with stale-state labeling and SMTP-acceptance versus inbox-receipt wording.
- Independent final `.venv/Scripts/python.exe -m pytest tests/test_notifications.py tests/test_budget_alert_api.py -q`: **48 passed** after the stale-completion fix. These include actual SMTP protocol traffic to a disposable literal-loopback capture server, one accepted message, no resend after restart, unchanged budget ledger, read-only/redacted API status and loopback host/origin enforcement. All other SMTP behavior uses controlled stubs; no external mail was sent.
- Independent `.venv/Scripts/python.exe -m pytest tests/test_runtime.py tests/test_overall_usage.py tests/test_anthropic_adapter.py -q`: **20 passed**. These existing budget/runtime/provider regressions ran before the final notification-only return-counter change, which the subsequent 48-case suite covers.
- The independent ad hoc lease-expiry check used a disposable SQLite database and stub transport. Its first shell invocation failed before execution because `services` was absent from the import path; the corrected invocation passed. The author subsequently retained this case as a regression test. Earlier independent notification-only run: **44 passed**, before that added case.
- Inspected the lead's desktop setup and mobile uncertain/stale screenshots: current global cost remains visible, the historical trigger snapshot is labeled, diagnostics contain safe codes, and no clipping was observed. Browser case source uses an isolated database; modeled delivery states are fixtures. The real API setup case, privacy/mobile Axe checks and stalled-status/cost-independence case are represented accurately in the evidence manifest.
- The lead's final integrated evidence in [budget-email-verification.json](../../experiments/budget-email-verification.json) reports **148 Python tests passed in 124.19 seconds**, **39 web tests**, Ruff and production build passed, and **3 isolated browser journeys passed in 11.4 seconds**. The existing three SWIG deprecation warnings and large-bundle warning remain. These integrated runs were reported by the lead, not rerun in full by this reviewer. The reviewer independently reproduced the 48 targeted notification/API/wire cases and 20 existing regressions above.

## Frozen-content verification

The manifest covers changed and nonignored untracked files relative to the reviewed base, excluding `docs/reviews/*`, `docs/ACTION-LOG.md` and `docs/IMPLEMENTATION-STATUS.md`. The exclusions are review/publication metadata; they cannot authorize an unreviewed source change. Private `.env`, local databases and ignored screenshots are not publication inputs. Each UTF-8 file normalizes CRLF and CR to LF; sorted `path + NUL + lowercase SHA256 + LF` records form the aggregate fingerprint.

Reproduce the frozen check from the repository root:

```python
from pathlib import Path
import hashlib, json, subprocess

m = json.loads(Path("docs/reviews/budget-email-manifest.json").read_text())
paths = set(subprocess.check_output(
    ["git", "diff", "--name-only", m["reviewed_base"]], text=True).splitlines())
paths |= set(subprocess.check_output(
    ["git", "ls-files", "--others", "--exclude-standard"], text=True).splitlines())
paths = sorted(p for p in paths if not p.startswith("docs/reviews/")
               and p not in {"docs/ACTION-LOG.md", "docs/IMPLEMENTATION-STATUS.md"})
assert paths == [e["path"] for e in m["files"]]
records = []
for entry in m["files"]:
    value = Path(entry["path"]).read_bytes().decode("utf-8")
    value = value.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")
    digest = hashlib.sha256(value).hexdigest()
    assert digest == entry["sha256_lf"], entry["path"]
    records.append(entry["path"] + "\0" + digest + "\n")
assert hashlib.sha256("".join(records).encode()).hexdigest() == m["content_sha256"]
```

A material change to a manifested file invalidates the affected approval and requires rechecking. This approval establishes reviewed local behavior, not actual SMTP authentication, inbox delivery, PostgreSQL readiness or commercial dispatch readiness. Configuration is still required; terminal failed/uncertain states intentionally have no resend/reset operation in this release.
