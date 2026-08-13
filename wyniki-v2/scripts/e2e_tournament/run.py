#!/usr/bin/env python3
"""E2E tournament orchestrator — Docker e2e + Playwright office + optional Android wave.

Usage:
    python scripts/e2e_tournament/run.py up
    python scripts/e2e_tournament/run.py down
    python scripts/e2e_tournament/run.py health
    python scripts/e2e_tournament/run.py office [--module 01_bootstrap]
    python scripts/e2e_tournament/run.py android
    python scripts/e2e_tournament/run.py full
    python scripts/e2e_tournament/run.py full --skip-android
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
import shutil

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
COMPOSE_FILE = PROJECT_ROOT / "docker-compose.e2e.yml"
ENV_FILE = PROJECT_ROOT / ".env.e2e"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
E2E_SCRIPTS_DIR = FRONTEND_DIR / "scripts" / "e2e-tournament"
BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:18087")
HEALTH_TIMEOUT_SECONDS = 60

# Sibling Android repo (Windows default layout).
_DEFAULT_ANDROID_ROOT = Path(r"C:\Users\sucho\Vest Tennis\android-tennis-referee")
ANDROID_ROOT = Path(os.environ.get("E2E_ANDROID_ROOT", str(_DEFAULT_ANDROID_ROOT)))
ANDROID_SCRIPT = ANDROID_ROOT / "scripts" / "run_parallel_courts.ps1"


def _compose_cmd(*args: str) -> list[str]:
    env_args = ["--env-file", str(ENV_FILE)] if ENV_FILE.exists() else []
    return ["docker", "compose", "-f", str(COMPOSE_FILE)] + env_args + list(args)


def _run(cmd: list[str], *, check: bool = True, **kwargs) -> subprocess.CompletedProcess:
    print(f"  $ {' '.join(str(c) for c in cmd)}")
    return subprocess.run(cmd, check=check, **kwargs)


def _http_json(url: str, timeout: float = 8.0) -> dict | list | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


def cmd_up() -> bool:
    """Build and start the E2E container, wait for /health."""
    if not ENV_FILE.exists():
        example = PROJECT_ROOT / ".env.e2e.example"
        if example.exists():
            ENV_FILE.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
            ENV_FILE.chmod(0o600)
            print(f"[up] Created {ENV_FILE} from example (chmod 600).")
    # When BASE_URL points at a remote host, skip local docker compose.
    if "localhost" not in BASE_URL and "127.0.0.1" not in BASE_URL:
        print(f"[up] Using remote E2E_BASE_URL={BASE_URL} (skip local docker compose)")
        return cmd_health()

    print("[up] Building and starting E2E container...")
    _run(_compose_cmd("up", "-d", "--build"))
    print(f"[up] Waiting for {BASE_URL}/health (timeout {HEALTH_TIMEOUT_SECONDS}s)...")
    deadline = time.time() + HEALTH_TIMEOUT_SECONDS
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/health", timeout=3) as resp:
                if resp.status == 200:
                    print("[up] Container healthy.")
                    return True
        except Exception:
            pass
        time.sleep(2)
    print("[up] ERROR: Container did not become healthy within timeout.", file=sys.stderr)
    return False


def cmd_down():
    """Stop and remove the E2E container (local compose only)."""
    if "localhost" not in BASE_URL and "127.0.0.1" not in BASE_URL:
        print(f"[down] Remote BASE_URL — skip compose down (purge via office/android cleanup).")
        return
    print("[down] Stopping E2E container...")
    _run(_compose_cmd("down", "-v"), check=False)
    print("[down] Done.")


def cmd_health() -> bool:
    """Check /health endpoint."""
    try:
        with urllib.request.urlopen(f"{BASE_URL}/health", timeout=5) as resp:
            data = resp.read().decode()
            print(f"[health] {resp.status}: {data}")
            return resp.status == 200
    except Exception as e:
        print(f"[health] FAILED: {e}", file=sys.stderr)
        return False


def _office_docker_cmd(module_filter: str | None = None) -> list[str]:
    """Playwright via official image — Dell has no host Node."""
    image = os.environ.get("E2E_PLAYWRIGHT_IMAGE", "mcr.microsoft.com/playwright:v1.56.1-jammy")
    module_arg = f" --module {module_filter}" if module_filter else ""
    inner = (
        "npm install --no-audit --no-fund"
        " && npx playwright install chromium"
        f" && node scripts/e2e-tournament/run.mjs{module_arg}"
    )
    return [
        "docker", "run", "--rm", "--network", "host", "--shm-size=1g",
        "-v", f"{FRONTEND_DIR}:/app",
        "-v", "wyniki-e2e-ms-playwright:/ms-playwright",
        "-w", "/app",
        "-e", f"E2E_BASE_URL={BASE_URL}",
        "-e", f"E2E_ADMIN_PASSWORD={os.environ.get('E2E_ADMIN_PASSWORD') or os.environ.get('ADMIN_PASSWORD') or 'e2e-admin'}",
        "-e", "npm_config_update_notifier=false",
        "-e", "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
        image,
        "bash", "-lc", inner,
    ]


def cmd_office(module_filter: str | None = None) -> bool:
    """Run Playwright office modules (host Node, or Docker on Dell)."""
    run_script = E2E_SCRIPTS_DIR / "run.mjs"
    if not run_script.exists():
        print(f"[office] ERROR: {run_script} not found.", file=sys.stderr)
        return False

    env = {**os.environ, "E2E_BASE_URL": BASE_URL}
    if shutil.which("node"):
        cmd = ["node", str(run_script)]
        if module_filter:
            cmd += ["--module", module_filter]
        result = _run(cmd, check=False, cwd=str(FRONTEND_DIR), env=env)
        return result.returncode == 0

    print("[office] node not on PATH — running Playwright in Docker (host network).")
    result = _run(_office_docker_cmd(module_filter), check=False, cwd=str(FRONTEND_DIR), env=env)
    return result.returncode == 0


def _admin_token() -> str | None:
    password = os.environ.get("E2E_ADMIN_PASSWORD") or os.environ.get("ADMIN_PASSWORD") or "e2e-admin"
    try:
        req = urllib.request.Request(
            f"{BASE_URL}/admin/api/auth",
            data=json.dumps({"password": password}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            token = data.get("token") or data.get("access_token")
            return str(token) if token else None
    except Exception as exc:
        print(f"[public] admin auth failed: {exc}", file=sys.stderr)
        return None


def _http_json_auth(url: str, token: str, timeout: float = 10.0) -> dict | list | None:
    try:
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


def cmd_public_assert(*, e2e_marker: str | None = None) -> bool:
    """Assert public APIs look alive after office/android work."""
    print("[public] Asserting /health + /api/snapshot ...")
    health = _http_json(f"{BASE_URL}/health")
    if not isinstance(health, dict) or health.get("status") != "healthy":
        print(f"[public] FAIL health: {health}", file=sys.stderr)
        return False

    snapshot = _http_json(f"{BASE_URL}/api/snapshot")
    if snapshot is None:
        # Some deployments nest under /api/v1 — try common aliases.
        for path in ("/api/live/snapshot", "/api/courts"):
            snapshot = _http_json(f"{BASE_URL}{path}")
            if snapshot is not None:
                break
    if snapshot is None:
        print("[public] FAIL: could not fetch snapshot/courts", file=sys.stderr)
        return False

    if e2e_marker:
        token = _admin_token()
        if not token:
            print("[public] FAIL: could not obtain admin token for E2E artifacts assert", file=sys.stderr)
            return False
        encoded = urllib.parse.quote(e2e_marker)
        artifacts = _http_json_auth(f"{BASE_URL}/admin/api/e2e/artifacts?marker={encoded}", token)
        if not isinstance(artifacts, dict):
            print(f"[public] FAIL: artifacts missing for marker={e2e_marker}", file=sys.stderr)
            return False
        matches = artifacts.get("matches") or []
        finished = [
            m for m in matches
            if isinstance(m, dict) and str(m.get("status") or "").lower() == "finished"
        ]
        if not finished:
            print(
                f"[public] FAIL: no finished matches for marker={e2e_marker} "
                f"(matches={len(matches)})",
                file=sys.stderr,
            )
            return False
        # Snapshot / active tournaments should still mention the marker while fixture lives.
        blob = json.dumps(snapshot) + json.dumps(_http_json(f"{BASE_URL}/api/tournaments/active") or {})
        if e2e_marker.split("-parallel")[0][:12] not in blob and e2e_marker not in blob:
            # Soft: artifacts are authoritative; warn if public surfaces lag.
            print(f"[public] WARN: marker not in snapshot/active text (artifacts OK: {len(finished)} finished)")
        else:
            print(f"[public] E2E marker visible; finished matches={len(finished)}")
        # Cleanup shared Android fixture after assert.
        try:
            req = urllib.request.Request(
                f"{BASE_URL}/admin/api/e2e/cleanup",
                data=json.dumps({"marker": e2e_marker}).encode(),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
                method="POST",
            )
            urllib.request.urlopen(req, timeout=30).read()
            print(f"[public] cleaned marker={e2e_marker}")
        except Exception as exc:
            print(f"[public] WARN: cleanup failed: {exc}", file=sys.stderr)

    print("[public] OK")
    return True


def _adb_has_device() -> bool:
    try:
        result = subprocess.run(["adb", "devices"], capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return False
    for line in result.stdout.splitlines():
        if line.strip().endswith("\tdevice") or "\tdevice" in line:
            return True
    return False


def cmd_android(max_courts: int = 4, *, skip_cleanup: bool = False, marker_out: Path | None = None) -> bool:
    """Run Android multi-court wave via PowerShell orchestrator."""
    if not ANDROID_SCRIPT.exists():
        print(f"[android] ERROR: script not found: {ANDROID_SCRIPT}", file=sys.stderr)
        return False
    if not _adb_has_device():
        print("[android] ERROR: no adb device in 'device' state.", file=sys.stderr)
        return False

    # Emulator on the same LAN reaches Dell :18087; 10.0.2.2 is only for a local AVD.
    device_base = os.environ.get("E2E_ANDROID_BASE_URL", BASE_URL)
    if "localhost" in device_base or "127.0.0.1" in device_base:
        device_base = os.environ.get("E2E_ANDROID_LOOPBACK_URL", "http://10.0.2.2:18087")

    host_base = BASE_URL
    cmd = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(ANDROID_SCRIPT),
        "-BaseUrl",
        device_base,
        "-HostBaseUrl",
        host_base,
        "-MaxCourts",
        str(max_courts),
    ]
    if skip_cleanup:
        cmd.append("-SkipCleanup")
    if marker_out is not None:
        cmd += ["-MarkerOutFile", str(marker_out)]
    env = {**os.environ, "E2E_BASE_URL": host_base}
    result = _run(cmd, check=False, cwd=str(ANDROID_ROOT), env=env)
    return result.returncode == 0


def cmd_full(*, skip_android: bool = False, max_courts: int = 4) -> bool:
    """Full cycle: up → office → android (if devices) → public assert → timing."""
    t0 = time.time()
    results: dict[str, bool] = {}
    e2e_marker: str | None = None
    marker_file = Path(tempfile.gettempdir()) / "wyniki-e2e-android-marker.txt"

    if not cmd_up():
        print("[full] ABORT: container/health failed.")
        return False
    results["up"] = True

    results["office"] = cmd_office()

    if skip_android:
        print("[full] Android: SKIP (--skip-android)")
        results["android"] = True
    elif not _adb_has_device():
        print("[full] Android: SKIP (no adb device) — set devices and re-run `android` / `full`")
        results["android"] = False
    else:
        if marker_file.exists():
            marker_file.unlink(missing_ok=True)
        results["android"] = cmd_android(
            max_courts=max_courts,
            skip_cleanup=True,
            marker_out=marker_file,
        )
        if marker_file.exists():
            e2e_marker = marker_file.read_text(encoding="utf-8").strip() or None

    results["public"] = cmd_public_assert(e2e_marker=e2e_marker if results.get("android") else None)

    elapsed = time.time() - t0
    print(f"\n{'='*50}")
    print("[full] Results:")
    for step, ok in results.items():
        print(f"  {step}: {'PASS' if ok else 'FAIL'}")
    print(f"  Total time: {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"{'='*50}")

    # Keep remote e2e container up; only tear down local compose.
    cmd_down()
    return all(results.values())


def main():
    parser = argparse.ArgumentParser(description="E2E tournament orchestrator")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("up", help="Start E2E container / check remote health")
    sub.add_parser("down", help="Stop E2E container")
    sub.add_parser("health", help="Check health endpoint")
    office_parser = sub.add_parser("office", help="Run office Playwright modules")
    office_parser.add_argument("--module", help="Run a specific module (e.g. 01_bootstrap)")
    android_parser = sub.add_parser("android", help="Run Android multi-court wave")
    android_parser.add_argument("--max-courts", type=int, default=4)
    full_parser = sub.add_parser("full", help="Full cycle: up + office + android + public")
    full_parser.add_argument("--skip-android", action="store_true")
    full_parser.add_argument("--max-courts", type=int, default=4)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "up":
        sys.exit(0 if cmd_up() else 1)
    if args.command == "down":
        cmd_down()
    elif args.command == "health":
        sys.exit(0 if cmd_health() else 1)
    elif args.command == "office":
        sys.exit(0 if cmd_office(getattr(args, "module", None)) else 1)
    elif args.command == "android":
        sys.exit(0 if cmd_android(max_courts=getattr(args, "max_courts", 4)) else 1)
    elif args.command == "full":
        sys.exit(
            0
            if cmd_full(
                skip_android=bool(getattr(args, "skip_android", False)),
                max_courts=int(getattr(args, "max_courts", 4)),
            )
            else 1
        )


if __name__ == "__main__":
    main()
