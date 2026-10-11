"""Start disposable API + web for MCP or browser specs; Ctrl+C cleans owned state."""

from contextlib import ExitStack
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8061"
WEB = "http://127.0.0.1:5174"


def require_free_port(port):
    with socket.socket() as probe:
        if os.name == "nt":
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        probe.bind(("127.0.0.1", port))


def stop_process(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def wait_ready(url, processes):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if any(process.poll() is not None for process in processes):
            raise RuntimeError("An isolated QA child exited before readiness; inspect its output")
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return response.read()
        except (URLError, TimeoutError):
            time.sleep(0.2)
    raise RuntimeError(f"Isolated QA readiness timed out: {url}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fleet-fixture", action="store_true",
                        help="Use the fixed public QA five-van roster")
    args = parser.parse_args()
    # Check both ports before spawning anything; an existing operator/fixture is never reused.
    for port in (8061, 5174):
        require_free_port(port)
    node = shutil.which("node")
    vite = ROOT / "apps/web/node_modules/vite/bin/vite.js"
    if not node or not vite.is_file():
        raise RuntimeError("Install the existing web dependencies and Node before isolated QA")
    with ExitStack() as stack:
        directory = stack.enter_context(tempfile.TemporaryDirectory(prefix="genesis-browser-qa-"))
        child_env = {
            key: value for key, value in os.environ.items()
            if not key.startswith(("GENESIS_", "LANGFUSE_"))
            and key not in {"ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OTEL_EXPORTER_OTLP_ENDPOINT"}
        }
        fixture_id = uuid4().hex
        child_env.update(PYTHON_DOTENV_DISABLED="1", GENESIS_QA_DIRECTORY=directory,
                         GENESIS_QA_INSTANCE=fixture_id,
                         GENESIS_QA_FLEET_FIXTURE="1" if args.fleet_fixture else "0")
        backend = subprocess.Popen([sys.executable, str(ROOT / "qa/route_memory_server.py")],
                                   cwd=ROOT, env=child_env)
        stack.callback(stop_process, backend)
        identity = json.loads(wait_ready(f"{API}/api/v1/qa/fixture", [backend]))
        if identity.get("synthetic") is not True or identity.get("fixture_id") != fixture_id:
            raise RuntimeError("The API did not identify itself as this owned synthetic fixture")
        frontend = subprocess.Popen([node, str(vite), "--config", str(ROOT / "qa/vite.config.ts")],
                                    cwd=ROOT / "apps/web", env=child_env)
        stack.callback(stop_process, frontend)
        wait_ready(WEB, [backend, frontend])
        proxied = json.loads(wait_ready(f"{WEB}/api/v1/qa/fixture", [backend, frontend]))
        if proxied.get("fixture_id") != identity["fixture_id"]:
            raise RuntimeError("The frontend proxy does not point to its owned isolated API")
        print(f"Isolated synthetic QA ready: {WEB}/?view=dispatch", flush=True)
        print(f"Fixture identity: {API}/api/v1/qa/fixture; Ctrl+C removes temporary state", flush=True)
        while all(process.poll() is None for process in (backend, frontend)):
            time.sleep(0.25)
        raise RuntimeError("An isolated QA server exited unexpectedly")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
