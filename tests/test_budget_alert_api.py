"""Read-only alert API and real loopback SMTP protocol checks; no external mail."""

from email import policy
from email.parser import BytesParser
import queue
import socketserver
import threading
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from genesis.api import create_app
from genesis.db import budget_alerts
from genesis.notifications import drain_budget_alerts, notification_status


def clear_mail(monkeypatch):
    for name in ("HOST", "PORT", "SECURITY", "USER", "PASSWORD", "FROM", "ALLOW_LOCAL_FIXTURE"):
        monkeypatch.delenv("GENESIS_SMTP_" + name, raising=False)
    monkeypatch.delenv("GENESIS_BUDGET_ALERT_TO", raising=False)


def reach_limit(store):
    run = store.create_run({"scenario_id": "S01", "policy": "baseline_only", "seed": 17,
                            "mode": "live", "budget_usd": "50"}, str(uuid4()))
    store.reserve(run["id"], str(uuid4()), "50")


def test_alert_status_is_read_only_global_and_has_no_private_config(store, monkeypatch):
    clear_mail(monkeypatch)
    reach_limit(store)
    client = TestClient(create_app(store))
    response = client.get("/api/v1/budget-alerts?scenario_id=S05&status=failed")
    assert response.status_code == 200
    data = response.json()
    assert data["configuration_error"] == "not_configured"
    assert data["event"]["delivery_state"] == "configuration_needed"
    assert data["event"]["reason"] == "budget_reached"
    assert data["event"]["snapshot"]["budget_limit_cad"] == "100"
    assert data["event"]["snapshot"]["known_cost_usd"] == "0"
    assert data["event"]["snapshot"]["held_usd"] == "50"
    assert "freeze_reason" not in data["guard"]
    assert client.get("/api/v1/budget-alerts").json() == data
    with store.engine.connect() as connection:
        row = connection.execute(select(budget_alerts)).mappings().one()
        assert row["delivery_state"] == "pending" and row["attempt_count"] == 0

    monkeypatch.setenv("GENESIS_SMTP_HOST", "smtp.mail.test")
    monkeypatch.setenv("GENESIS_SMTP_FROM", "sender@mail.test")
    monkeypatch.setenv("GENESIS_BUDGET_ALERT_TO", "recipient@mail.test")
    monkeypatch.setenv("GENESIS_SMTP_USER", "private-account")
    monkeypatch.setenv("GENESIS_SMTP_PASSWORD", "private-password")
    configured = client.get("/api/v1/budget-alerts")
    assert configured.json()["configured"]
    for secret in ("smtp.mail.test", "sender@mail.test", "recipient@mail.test",
                   "private-account", "private-password"):
        assert secret not in configured.text


def test_alert_endpoint_inherits_loopback_boundary(store):
    client = TestClient(create_app(store))
    assert client.get("/api/v1/budget-alerts", headers={"Origin": "https://outside.test"}).status_code == 403
    assert client.get("/api/v1/budget-alerts", headers={"Host": "outside.test"}).status_code == 403


class CaptureSMTP(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(5)
        self.wfile.write(b"220 fixture SMTP\r\n")
        while True:
            line = self.rfile.readline(4096)
            if not line:
                return
            command = line.split(b" ", 1)[0].strip().upper()
            if command == b"EHLO":
                self.wfile.write(b"250-fixture\r\n250 8BITMIME\r\n")
            elif command in (b"MAIL", b"RCPT"):
                self.wfile.write(b"250 accepted\r\n")
            elif command == b"DATA":
                self.wfile.write(b"354 end with dot\r\n")
                data = bytearray()
                while True:
                    part = self.rfile.readline(4096)
                    if not part:
                        return
                    if part == b".\r\n":
                        break
                    if part.startswith(b".."):
                        part = part[1:]
                    data.extend(part)
                    if len(data) > 32_000:
                        raise AssertionError("Unexpected message size")
                self.server.messages.put(bytes(data))
                self.wfile.write(b"250 queued\r\n")
            elif command == b"QUIT":
                self.wfile.write(b"221 bye\r\n")
                return
            else:
                self.wfile.write(b"502 unsupported\r\n")


def test_budget_alert_crosses_real_smtp_wire_once_and_survives_restart(store, monkeypatch):
    clear_mail(monkeypatch)
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), CaptureSMTP) as server:
        server.daemon_threads = True
        server.messages = queue.Queue()
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            monkeypatch.setenv("GENESIS_SMTP_HOST", "127.0.0.1")
            monkeypatch.setenv("GENESIS_SMTP_PORT", str(server.server_address[1]))
            monkeypatch.setenv("GENESIS_SMTP_SECURITY", "plain")
            monkeypatch.setenv("GENESIS_SMTP_ALLOW_LOCAL_FIXTURE", "1")
            monkeypatch.setenv("GENESIS_SMTP_FROM", "sender@genesis.test")
            monkeypatch.setenv("GENESIS_BUDGET_ALERT_TO", "alerts@genesis.test")
            reach_limit(store)
            assert drain_budget_alerts(store) == 1
            parsed = BytesParser(policy=policy.default).parsebytes(server.messages.get(timeout=2))
            assert parsed["To"] == "alerts@genesis.test"
            assert parsed["Subject"] == "Genesis: shared API budget alert"
            assert "C$100" in parsed.get_body().get_content()
            assert "US$50" in parsed.get_body().get_content()
            assert "not invoices" in parsed.get_body().get_content()
            before = store.budget_state()
            from genesis.db import Store

            restarted = Store(str(store.engine.url))
            try:
                assert drain_budget_alerts(restarted) == 0
                assert notification_status(restarted)["event"]["delivery_state"] == "sent"
                assert notification_status(restarted)["event"]["attempt_count"] == 1
                assert restarted.budget_state() == before
                assert server.messages.empty()
            finally:
                restarted.engine.dispose()
        finally:
            server.shutdown()
            thread.join(timeout=2)
