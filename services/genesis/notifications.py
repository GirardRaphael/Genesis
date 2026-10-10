"""Durable, optional budget email. SMTP cannot guarantee exactly-once delivery."""

from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.policy import SMTP
import os
import re
import smtplib
import ssl
from uuid import uuid4

from sqlalchemy import select, update

from .db import PROJECT_ID, budget_alerts, now

MAX_ATTEMPTS = 3
SOCKET_TIMEOUT = 10
LEASE_SECONDS = 120


def smtp_configuration():
    """Return private transport settings separately from public, typed configuration errors."""
    keys = ("HOST", "FROM")
    values = {key.lower(): os.getenv(f"GENESIS_SMTP_{key}", "") for key in keys}
    values["to"] = os.getenv("GENESIS_BUDGET_ALERT_TO", "")
    if not all(values.values()):
        return None, "not_configured"
    values.update(
        security=os.getenv("GENESIS_SMTP_SECURITY", "starttls"),
        user=os.getenv("GENESIS_SMTP_USER", ""),
        password=os.getenv("GENESIS_SMTP_PASSWORD", ""),
    )
    # Deliberately accept only a single ASCII addr-spec, never display names or address lists.
    address = r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?"
    if (
        any("\r" in value or "\n" in value or "\x00" in value for value in values.values())
        or any(
            len(values[key]) > 254 or not re.fullmatch(address, values[key])
            for key in ("from", "to")
        )
        or not re.fullmatch(r"[A-Za-z0-9.:-]+", values["host"])
        or bool(values["user"]) != bool(values["password"])
    ):
        return None, "invalid_configuration"
    for key in ("from", "to"):
        local, domain = values[key].rsplit("@", 1)
        if (
            len(local) > 64
            or local.startswith(".")
            or local.endswith(".")
            or ".." in local
            or any(
                not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
                for label in domain.split(".")
            )
        ):
            return None, "invalid_configuration"
    security = values["security"]
    if security not in {"starttls", "smtps", "plain"}:
        return None, "invalid_configuration"
    if security == "plain" and not (
        os.getenv("GENESIS_SMTP_ALLOW_LOCAL_FIXTURE") == "1"
        and values["host"] in {"127.0.0.1", "::1"}
        and not values["user"]
        and not values["password"]
    ):
        return None, "invalid_configuration"
    try:
        values["port"] = int(
            os.getenv("GENESIS_SMTP_PORT", "465" if security == "smtps" else "587")
        )
        if not 1 <= values["port"] <= 65535:
            raise ValueError
    except ValueError:
        return None, "invalid_configuration"
    return values, None


def notification_status(store):
    config, config_error = smtp_configuration()
    with store.engine.connect() as conn:
        row = (
            conn.execute(select(budget_alerts).where(budget_alerts.c.project_id == PROJECT_ID))
            .mappings()
            .first()
        )
        guard = store._budget_state(conn)
    guard.pop("freeze_reason")
    event = None
    if row:
        event = {
            key: row[key]
            for key in (
                "id",
                "reason",
                "snapshot",
                "delivery_state",
                "attempt_count",
                "next_retry_at",
                "error_code",
                "created_at",
                "updated_at",
                "sent_at",
            )
        }
        if not config and event["delivery_state"] in {
            "pending",
            "configuration_needed",
            "retry_wait",
        }:
            event["delivery_state"] = "configuration_needed"
    return {
        "configured": config is not None,
        "configuration_error": config_error,
        "guard": guard,
        "event": event,
    }


def _message(config, row):
    snapshot = row["snapshot"]
    reason = {
        "budget_reached": "The shared project budget has been reached by known costs and held reservations.",
        "global_dispatch_blocked": "The global project budget blocked a further request; remaining funds were insufficient for that request.",
        "project_frozen": "Project dispatch is frozen because a known charge exceeded its reservation.",
    }[row["reason"]]
    message = EmailMessage(policy=SMTP)
    message["From"] = config["from"]
    message["To"] = config["to"]
    message["Subject"] = "Genesis: shared API budget alert"
    message["Message-ID"] = f"<{row['id']}@genesis.local>"
    message.set_content(
        f"{reason}\n\n"
        f"Effective shared limit: C${snapshot['budget_limit_cad']}\n"
        f"Known estimated API charges: US${snapshot['known_cost_usd']}\n"
        f"Held reservations (may include uncertain charges): US${snapshot['held_usd']}\n"
        f"Remaining budget at trigger: C${snapshot['remaining_budget_cad']}\n"
        f"Conservative CAD per USD valuation: {snapshot['cad_per_usd_policy']}\n"
        f"Blocked reservation: {snapshot['blocked_amount_usd'] or 'not applicable'} USD\n"
        "Amounts are estimates and conservative spending valuations, not invoices or market FX.\n"
        "This is one alert for the persistent project budget. Review Genesis before further live requests.\n"
        f"Alert recorded at {row['created_at']}\n"
    )
    return message.as_bytes()


def _deliver(config, row):
    client = None
    data_started = False
    accepted = False
    try:
        context = ssl.create_default_context()
        if config["security"] == "smtps":
            client = smtplib.SMTP_SSL(
                config["host"], config["port"], timeout=SOCKET_TIMEOUT, context=context
            )
        else:
            client = smtplib.SMTP(config["host"], config["port"], timeout=SOCKET_TIMEOUT)
            client.ehlo()
            if config["security"] == "starttls":
                client.starttls(context=context)
                client.ehlo()
        if config["security"] == "smtps":
            client.ehlo()
        if config["user"]:
            client.login(config["user"], config["password"])
        code, _ = client.mail(config["from"])
        if code != 250:
            return "retry_wait", "smtp_pre_data_failure"
        code, _ = client.rcpt(config["to"])
        if code not in (250, 251):
            return "retry_wait", "smtp_pre_data_failure"
        payload = _message(config, row)
        # From this point a disconnect may conceal successful acceptance; never retry blindly.
        data_started = True
        code, _ = client.data(payload)
        if code != 250:
            return "failed", "smtp_data_rejected"
        accepted = True
        return "sent", None
    except smtplib.SMTPDataError:
        return (
            ("failed", "smtp_data_rejected")
            if data_started
            else ("retry_wait", "smtp_pre_data_failure")
        )
    except Exception:
        return (
            ("uncertain", "smtp_delivery_uncertain")
            if data_started
            else ("retry_wait", "smtp_pre_data_failure")
        )
    finally:
        if client is not None:
            try:
                # A QUIT failure after accepted DATA cannot undo the acceptance.
                if accepted:
                    client.quit()
            except Exception:
                pass
            finally:
                try:
                    client.close()
                except Exception:
                    pass


def drain_budget_alerts(store):
    """Claim durably, send outside the transaction, and fence completion by claim identity."""
    store.check_budget_alert()
    config, config_error = smtp_configuration()
    with store.transaction() as conn:
        row = (
            conn.execute(
                select(budget_alerts)
                .where(budget_alerts.c.project_id == PROJECT_ID)
                .with_for_update()
            )
            .mappings()
            .first()
        )
        if not row:
            return 0
        row = dict(row)
        timestamp = now()
        state = row["delivery_state"]
        if state == "sending":
            if row["lease_until"] <= timestamp:
                conn.execute(
                    update(budget_alerts)
                    .where(budget_alerts.c.id == row["id"])
                    .values(
                        delivery_state="uncertain",
                        error_code="delivery_lease_expired",
                        updated_at=timestamp,
                    )
                )
            return 0
        if state in {"sent", "failed", "uncertain"}:
            return 0
        if not config:
            if state != "configuration_needed" or row["error_code"] != config_error:
                conn.execute(
                    update(budget_alerts)
                    .where(budget_alerts.c.id == row["id"])
                    .values(
                        delivery_state="configuration_needed",
                        error_code=config_error,
                        updated_at=timestamp,
                    )
                )
            return 0
        if row["next_retry_at"] and row["next_retry_at"] > timestamp:
            return 0
        row["claim_id"] = str(uuid4())
        row["attempt_count"] += 1
        conn.execute(
            update(budget_alerts)
            .where(budget_alerts.c.id == row["id"])
            .values(
                delivery_state="sending",
                attempt_count=row["attempt_count"],
                claim_id=row["claim_id"],
                lease_until=(
                    datetime.now(timezone.utc) + timedelta(seconds=LEASE_SECONDS)
                ).isoformat(timespec="milliseconds"),
                updated_at=timestamp,
                error_code=None,
                next_retry_at=None,
            )
        )
    state, error = _deliver(config, row)
    next_retry = None
    if state == "retry_wait":
        if row["attempt_count"] >= MAX_ATTEMPTS:
            state = "failed"
        else:
            next_retry = (
                datetime.now(timezone.utc) + timedelta(seconds=30 * 2 ** (row["attempt_count"] - 1))
            ).isoformat(timespec="milliseconds")
    with store.transaction() as conn:
        completed = conn.execute(
            update(budget_alerts)
            .where(
                budget_alerts.c.id == row["id"],
                budget_alerts.c.claim_id == row["claim_id"],
                budget_alerts.c.delivery_state == "sending",
            )
            .values(
                delivery_state=state,
                error_code=error,
                next_retry_at=next_retry,
                updated_at=now(),
                sent_at=now() if state == "sent" else None,
                lease_until=None,
            )
        )
    return int(state == "sent" and completed.rowcount == 1)
