from concurrent.futures import ThreadPoolExecutor
import json
import os
import smtplib
from uuid import uuid4

import pytest
from sqlalchemy import delete, insert, select, update

from genesis.db import (
    BudgetExceeded,
    LostLease,
    Store,
    budget_alerts,
    budgets,
    reservations,
)
from genesis.notifications import drain_budget_alerts, notification_status, smtp_configuration


@pytest.fixture
def store(tmp_path, monkeypatch):
    for key in list(os.environ):
        if key.startswith("GENESIS_SMTP_") or key == "GENESIS_BUDGET_ALERT_TO":
            monkeypatch.delenv(key)
    monkeypatch.setenv("GENESIS_GLOBAL_BUDGET_CAD", "100")
    monkeypatch.setenv("GENESIS_CAD_PER_USD", "2")
    return Store(f"sqlite:///{tmp_path / 'alerts.sqlite'}")


def run(store, budget="100"):
    return store.create_run(dict(mode="live", scenario_id="S01", budget_usd=budget), str(uuid4()))[
        "id"
    ]


def trigger(store):
    identifier = run(store)
    store.reserve(identifier, str(uuid4()), "50")
    return identifier


@pytest.fixture
def smtp(monkeypatch):
    monkeypatch.setenv("GENESIS_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("GENESIS_SMTP_FROM", "sender@example.test")
    monkeypatch.setenv("GENESIS_BUDGET_ALERT_TO", "recipient@example.test")
    monkeypatch.setenv("GENESIS_SMTP_USER", "private-login")
    monkeypatch.setenv("GENESIS_SMTP_PASSWORD", "private-password")

    class FakeSMTP:
        instances = []
        failure = None
        quit_failure = False
        data_hook = None

        def __init__(self, host, port, **kwargs):
            self.commands = []
            self.payload = None
            self.instances.append(self)
            assert kwargs["timeout"] == 10
            if self.failure == "connect":
                raise OSError("private-password recipient@example.test")

        def ehlo(self):
            self.commands.append("ehlo")
            return 250, b"ok"

        def starttls(self, **kwargs):
            self.commands.append("starttls")
            assert kwargs["context"].check_hostname
            if self.failure == "tls":
                raise smtplib.SMTPNotSupportedError("raw private smtp error")

        def login(self, user, password):
            self.commands.append("login")
            assert self.commands.index("starttls") < self.commands.index("login")
            if self.failure == "auth":
                raise smtplib.SMTPAuthenticationError(535, b"private credential error")

        def mail(self, sender):
            self.commands.append("mail")
            return 550 if self.failure == "sender" else 250, b"private sender"

        def rcpt(self, recipient):
            self.commands.append("rcpt")
            return 550 if self.failure == "recipient" else 250, b"private recipient"

        def data(self, payload):
            self.commands.append("data")
            self.payload = payload
            if self.data_hook:
                self.data_hook()
            if self.failure == "data":
                raise smtplib.SMTPServerDisconnected("private ambiguous result")
            if self.failure == "rejected":
                raise smtplib.SMTPDataError(550, b"private rejection")
            if self.failure == "crash":
                raise KeyboardInterrupt
            return 250, b"accepted"

        def quit(self):
            self.commands.append("quit")
            if self.quit_failure:
                raise OSError("QUIT lost after accepted DATA")

        def close(self):
            self.commands.append("close")

    monkeypatch.setattr("genesis.notifications.smtplib.SMTP", FakeSMTP)
    monkeypatch.setattr("genesis.notifications.smtplib.SMTP_SSL", FakeSMTP)
    return FakeSMTP


def test_exact_held_trigger_is_durable_and_not_repeated_after_release(store):
    identifier = run(store)
    store.reserve(identifier, "first", "49")
    assert notification_status(store)["event"] is None
    store.reserve(identifier, "last", "1")
    event = notification_status(store)["event"]
    assert event["reason"] == "budget_reached"
    assert event["snapshot"]["known_cost_usd"] == "0"
    assert event["snapshot"]["held_usd"] == "50"
    assert event["snapshot"]["budget_limit_cad"] == "100"
    assert event["snapshot"]["remaining_budget_cad"] == "0"
    store.settle(identifier, "first", "0")
    restarted = Store(str(store.engine.url))
    assert notification_status(restarted)["event"]["id"] == event["id"]
    assert notification_status(restarted)["guard"]["remaining_budget_cad"] == "98"


def test_global_prospective_denial_commits_truthful_snapshot(store):
    identifier = run(store)
    store.reserve(identifier, "first", "49")
    with pytest.raises(BudgetExceeded):
        store.reserve(identifier, "denied", "2")
    event = notification_status(Store(str(store.engine.url)))["event"]
    assert event["reason"] == "global_dispatch_blocked"
    assert event["snapshot"]["remaining_budget_cad"] == "2"
    assert event["snapshot"]["blocked_amount_usd"] == "2"
    assert len(store.held(identifier)) == 1


def test_per_run_denial_and_arbitrary_run_failure_do_not_alert(store):
    identifier = run(store, "1")
    with pytest.raises(BudgetExceeded):
        store.reserve(identifier, "too-large", "2")
    row = store.claim("test")
    store.finish(
        identifier,
        "budget_exceeded",
        {"error": {"code": "BillingUncertain"}},
        ("test", row["generation"]),
    )
    drain_budget_alerts(store)
    assert notification_status(store)["event"] is None


def test_freeze_persists_trigger_and_overrun_without_cap_exhaustion(store):
    identifier = run(store)
    store.reserve(identifier, "attempt", "0.10")
    with pytest.raises(BudgetExceeded):
        store.settle(identifier, "attempt", "0.20")
    event = notification_status(Store(str(store.engine.url)))["event"]
    assert event["reason"] == "project_frozen"
    assert event["snapshot"]["known_cost_usd"] == "0.20"
    assert event["snapshot"]["frozen"]
    assert "freeze_reason" not in event["snapshot"]


def test_concurrent_denial_deduplicates_logical_alert(store):
    identifiers = [run(store) for _ in range(6)]

    def reserve(identifier):
        try:
            store.reserve(identifier, str(uuid4()), "30")
        except BudgetExceeded:
            pass

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(reserve, identifiers))
    with store.engine.connect() as conn:
        assert len(conn.execute(select(budget_alerts)).all()) == 1
    assert notification_status(store)["guard"]["held_usd"] == "30"


@pytest.mark.parametrize("frozen", [False, True])
def test_legacy_exhaustion_or_freeze_backfills_once_on_restart(store, frozen):
    identifier = run(store)
    with store.transaction() as conn:
        if frozen:
            conn.execute(update(budgets).values(frozen=True, freeze_reason="private legacy string"))
        else:
            conn.execute(
                insert(reservations).values(
                    attempt_id="legacy",
                    run_id=identifier,
                    amount="50",
                    settled="50",
                    status="settled",
                )
            )
    restarted = Store(str(store.engine.url))
    event = notification_status(restarted)["event"]
    assert event["reason"] == ("project_frozen" if frozen else "budget_reached")
    assert notification_status(Store(str(store.engine.url)))["event"]["id"] == event["id"]


def test_lowered_cap_periodic_detection_and_stored_cushion(store, monkeypatch):
    identifier = run(store)
    store.reserve(identifier, "held", "10")
    monkeypatch.setenv("GENESIS_GLOBAL_BUDGET_CAD", "20")
    drain_budget_alerts(store)
    assert notification_status(store)["event"]["snapshot"]["budget_limit_cad"] == "20"
    with store.transaction() as conn:
        conn.execute(delete(budget_alerts))
        conn.execute(update(budgets).values(cad_per_usd="4"))
    monkeypatch.setenv("GENESIS_GLOBAL_BUDGET_CAD", "100")
    with pytest.raises(BudgetExceeded):
        store.reserve(identifier, "blocked", "20")
    assert notification_status(store)["event"]["snapshot"]["budget_limit_usd"] == "25"


def test_fenced_old_worker_cannot_create_alert(store):
    identifier = run(store)
    store.claim("old", lease_seconds=-1)
    store.claim("new")
    with pytest.raises(LostLease):
        store.reserve(identifier, "stale", "50", ("old", 1))
    assert notification_status(store)["event"] is None


def test_unconfigured_retains_event_without_attempts(store):
    trigger(store)
    assert drain_budget_alerts(store) == 0
    status = notification_status(store)
    assert not status["configured"]
    assert status["event"]["delivery_state"] == "configuration_needed"
    assert status["event"]["attempt_count"] == 0


def test_smtp_success_redaction_and_no_transaction_during_send(store, smtp):
    trigger(store)

    def check_transaction(_self):
        # A separate write transaction must work while SMTP DATA is in progress.
        with store.transaction() as conn:
            row = conn.execute(select(budget_alerts)).mappings().one()
            assert row["delivery_state"] == "sending"

    smtp.data_hook = check_transaction
    assert drain_budget_alerts(store) == 1
    status = notification_status(Store(str(store.engine.url)))
    assert status["event"]["delivery_state"] == "sent"
    assert status["event"]["attempt_count"] == 1
    assert status["event"]["sent_at"]
    assert drain_budget_alerts(store) == 0
    assert len(smtp.instances) == 1
    safe = json.dumps(status)
    for private in (
        "recipient@example.test",
        "sender@example.test",
        "private-login",
        "private-password",
        "smtp.example.test",
    ):
        assert private not in safe
    assert b"Held reservations" in smtp.instances[0].payload


def test_quit_failure_after_acceptance_stays_sent(store, smtp):
    trigger(store)
    smtp.quit_failure = True
    assert drain_budget_alerts(store) == 1
    assert notification_status(store)["event"]["delivery_state"] == "sent"


@pytest.mark.parametrize("failure", ["connect", "tls", "auth", "sender", "recipient"])
def test_known_pre_data_failure_retries_with_limit_and_safe_errors(store, smtp, failure):
    trigger(store)
    smtp.failure = failure
    for attempt in range(1, 4):
        assert drain_budget_alerts(store) == 0
        event = notification_status(store)["event"]
        assert event["attempt_count"] == attempt
        assert event["delivery_state"] == ("retry_wait" if attempt < 3 else "failed")
        assert event["error_code"] == "smtp_pre_data_failure"
        if attempt < 3:
            assert event["next_retry_at"] > event["updated_at"]
            drain_budget_alerts(store)
            assert notification_status(store)["event"]["attempt_count"] == attempt
            with store.transaction() as conn:
                conn.execute(update(budget_alerts).values(next_retry_at="2000-01-01"))
    assert "private" not in json.dumps(notification_status(store))
    drain_budget_alerts(store)
    assert len(smtp.instances) == 3


@pytest.mark.parametrize("failure,state", [("data", "uncertain"), ("rejected", "failed")])
def test_post_data_failure_never_automatically_retries(store, smtp, failure, state):
    trigger(store)
    smtp.failure = failure
    drain_budget_alerts(store)
    assert notification_status(store)["event"]["delivery_state"] == state
    drain_budget_alerts(Store(str(store.engine.url)))
    assert len(smtp.instances) == 1


def test_crash_during_send_recovers_to_uncertain_without_redelivery(store, smtp):
    trigger(store)
    smtp.failure = "crash"
    with pytest.raises(KeyboardInterrupt):
        drain_budget_alerts(store)
    restarted = Store(str(store.engine.url))
    assert notification_status(restarted)["event"]["delivery_state"] == "sending"
    drain_budget_alerts(restarted)
    assert len(smtp.instances) == 1
    with store.transaction() as conn:
        conn.execute(update(budget_alerts).values(lease_until="2000-01-01"))
    drain_budget_alerts(restarted)
    assert notification_status(restarted)["event"]["delivery_state"] == "uncertain"
    assert notification_status(restarted)["event"]["error_code"] == "delivery_lease_expired"
    assert len(smtp.instances) == 1


def test_concurrent_drains_claim_only_once(store, smtp):
    trigger(store)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: drain_budget_alerts(store), range(4)))
    assert sum(results) == 1
    assert len(smtp.instances) == 1


@pytest.mark.parametrize(
    "key,value",
    [
        ("GENESIS_BUDGET_ALERT_TO", "one@example.test,two@example.test"),
        ("GENESIS_BUDGET_ALERT_TO", "one@example.test\r\nBcc:evil@example.test"),
        ("GENESIS_SMTP_FROM", "sender@example.test\nInjected: yes"),
        ("GENESIS_SMTP_HOST", "smtp.example.test\nprivate"),
        ("GENESIS_SMTP_PORT", "0"),
        ("GENESIS_SMTP_PORT", "invalid"),
        ("GENESIS_SMTP_SECURITY", "plain"),
        ("GENESIS_SMTP_SECURITY", "invalid"),
    ],
)
def test_invalid_configuration_never_sends(store, smtp, monkeypatch, key, value):
    monkeypatch.setenv(key, value)
    trigger(store)
    drain_budget_alerts(store)
    assert smtp_configuration() == (None, "invalid_configuration")
    assert not smtp.instances
    assert notification_status(store)["event"]["attempt_count"] == 0
    assert notification_status(store)["event"]["delivery_state"] == "configuration_needed"


def test_plain_transport_requires_explicit_literal_loopback_and_no_credentials(smtp, monkeypatch):
    monkeypatch.setenv("GENESIS_SMTP_SECURITY", "plain")
    monkeypatch.setenv("GENESIS_SMTP_ALLOW_LOCAL_FIXTURE", "1")
    monkeypatch.setenv("GENESIS_SMTP_HOST", "127.0.0.1")
    assert smtp_configuration()[0] is None
    monkeypatch.delenv("GENESIS_SMTP_USER")
    monkeypatch.delenv("GENESIS_SMTP_PASSWORD")
    assert smtp_configuration()[0] is not None
    monkeypatch.setenv("GENESIS_SMTP_HOST", "localhost")
    assert smtp_configuration()[0] is None
    monkeypatch.setenv("GENESIS_SMTP_HOST", "127.0.0.1")
    monkeypatch.delenv("GENESIS_SMTP_ALLOW_LOCAL_FIXTURE")
    assert smtp_configuration()[0] is None


def test_stored_cushion_and_lowered_cap_share_reservation_and_alert_limit(store, monkeypatch):
    with store.transaction() as conn:
        conn.execute(update(budgets).values(cad_per_usd="3"))
    monkeypatch.setenv("GENESIS_GLOBAL_BUDGET_CAD", "60")
    identifier = run(store)
    with pytest.raises(BudgetExceeded):
        store.reserve(identifier, "must-deny", "21")
    status = notification_status(store)
    assert status["guard"]["budget_limit_usd"] == "20"
    assert status["event"]["snapshot"]["budget_limit_cad"] == "60"
    assert status["event"]["snapshot"]["cad_per_usd_policy"] == "3"
    assert status["event"]["snapshot"]["remaining_budget_cad"] == "60"
    assert not store.held(identifier)


@pytest.mark.parametrize("key", ["GENESIS_CAD_PER_USD", "GENESIS_GLOBAL_BUDGET_CAD"])
@pytest.mark.parametrize("value", ["NaN", "Infinity", "-1", "0"])
def test_invalid_budget_configuration_fails_closed(store, monkeypatch, key, value):
    identifier = run(store)
    monkeypatch.setenv(key, value)
    with pytest.raises(ValueError, match="Invalid project budget configuration"):
        store.reserve(identifier, "invalid-config", "1")
    assert not store.held(identifier)


def test_configuration_can_be_supplied_after_trigger(store, smtp, monkeypatch):
    monkeypatch.delenv("GENESIS_BUDGET_ALERT_TO")
    trigger(store)
    drain_budget_alerts(store)
    assert notification_status(store)["event"]["delivery_state"] == "configuration_needed"
    monkeypatch.setenv("GENESIS_BUDGET_ALERT_TO", "recipient@example.test")
    assert drain_budget_alerts(store) == 1
    assert notification_status(store)["event"]["attempt_count"] == 1


def test_smtps_uses_verified_tls_and_greets(store, smtp, monkeypatch):
    monkeypatch.setenv("GENESIS_SMTP_SECURITY", "smtps")
    monkeypatch.delenv("GENESIS_SMTP_USER")
    monkeypatch.delenv("GENESIS_SMTP_PASSWORD")
    observed = []

    def ssl_factory(host, port, **kwargs):
        observed.append((port, kwargs["context"].check_hostname))
        return smtp(host, port, **kwargs)

    monkeypatch.setattr("genesis.notifications.smtplib.SMTP_SSL", ssl_factory)
    trigger(store)
    assert drain_budget_alerts(store) == 1
    assert observed == [(465, True)]
    assert smtp.instances[0].commands[0] == "ehlo"
    assert "starttls" not in smtp.instances[0].commands


def test_crash_after_data_acceptance_before_status_commit_is_not_resent(store, smtp, monkeypatch):
    from genesis import notifications

    trigger(store)
    original = notifications._deliver

    def crash_after_delivery(config, row):
        assert original(config, row) == ("sent", None)
        raise KeyboardInterrupt

    monkeypatch.setattr(notifications, "_deliver", crash_after_delivery)
    with pytest.raises(KeyboardInterrupt):
        drain_budget_alerts(store)
    assert smtp.instances[0].commands[-2:] == ["quit", "close"]
    with store.transaction() as conn:
        conn.execute(update(budget_alerts).values(lease_until="2000-01-01"))
    drain_budget_alerts(Store(str(store.engine.url)))
    assert notification_status(store)["event"]["delivery_state"] == "uncertain"
    assert len(smtp.instances) == 1


@pytest.mark.parametrize("actual", ["0.5", "2"])
def test_invalid_runtime_budget_config_does_not_erase_known_settlement(store, monkeypatch, actual):
    identifier = run(store)
    store.reserve(identifier, "attempt", "1")
    monkeypatch.setenv("GENESIS_CAD_PER_USD", "NaN")
    if actual == "2":
        with pytest.raises(BudgetExceeded):
            store.settle(identifier, "attempt", actual)
    else:
        store.settle(identifier, "attempt", actual)
    with store.engine.connect() as conn:
        reservation = conn.execute(select(reservations)).mappings().one()
        assert reservation["settled"] == actual
        assert conn.execute(select(budgets.c.frozen)).scalar_one() == (actual == "2")
    monkeypatch.setenv("GENESIS_CAD_PER_USD", "2")
    drain_budget_alerts(store)
    if actual == "2":
        assert notification_status(store)["event"]["reason"] == "project_frozen"


def test_expired_claim_completion_cannot_report_sent_or_replace_uncertain(store, smtp):
    trigger(store)

    def expire_during_data(_self):
        with store.transaction() as conn:
            conn.execute(update(budget_alerts).values(lease_until="2000-01-01"))
        assert drain_budget_alerts(Store(str(store.engine.url))) == 0
        assert notification_status(store)["event"]["delivery_state"] == "uncertain"

    smtp.data_hook = expire_during_data
    assert drain_budget_alerts(store) == 0
    event = notification_status(store)["event"]
    assert event["delivery_state"] == "uncertain"
    assert event["error_code"] == "delivery_lease_expired"
    assert event["sent_at"] is None
    assert event["attempt_count"] == 1
    assert drain_budget_alerts(Store(str(store.engine.url))) == 0
    assert len(smtp.instances) == 1
