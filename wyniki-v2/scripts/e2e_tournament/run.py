#!/usr/bin/env python3
"""E2E tournament orchestrator — spins up Docker, runs Playwright modules, tears down.

Usage:
    python scripts/e2e_tournament/run.py up
    python scripts/e2e_tournament/run.py down
    python scripts/e2e_tournament/run.py health
    python scripts/e2e_tournament/run.py office [--module 01_bootstrap]
    python scripts/e2e_tournament/run.py full
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
COMPOSE_FILE = PROJECT_ROOT / "docker-compose.e2e.yml"
ENV_FILE = PROJECT_ROOT / ".env.e2e"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
E2E_SCRIPTS_DIR = FRONTEND_DIR / "scripts" / "e2e-tournament"
BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:18087")
HEALTH_TIMEOUT_SECONDS = 60


def _compose_cmd(*args: str) -> list[str]:
    env_args = ["--env-file", str(ENV_FILE)] if ENV_FILE.exists() else []
    return ["docker", "compose", "-f", str(COMPOSE_FILE)] + env_args + list(args)


def _run(cmd: list[str], *, check: bool = True, **kwargs) -> subprocess.CompletedProcess:
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run(cmd, check=check, **kwargs)


def cmd_up() -> bool:
    """Build and start the E2E container, wait for /health."""
    print("[up] Building and starting E2E container...")
    _run(_compose_cmd("up", "-d", "--build"))
    print(f"[up] Waiting for {BASE_URL}/health (timeout {HEALTH_TIMEOUT_SECONDS}s)...")
    deadline = time.time() + HEALTH_TIMEOUT_SECONDS
    while time.time() < deadline:
        try:
            import urllib.request
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
    """Stop and remove the E2E container."""
    print("[down] Stopping E2E container...")
    _run(_compose_cmd("down", "-v"), check=False)
    print("[down] Done.")


def cmd_health() -> bool:
    """Check /health endpoint."""
    try:
        import urllib.request
        with urllib.request.urlopen(f"{BASE_URL}/health", timeout=5) as resp:
            data = resp.read().decode()
            print(f"[health] {resp.status}: {data}")
            return resp.status == 200
    except Exception as e:
        print(f"[health] FAILED: {e}", file=sys.stderr)
        return False


def cmd_office(module_filter: str | None = None) -> bool:
    """Run Playwright office modules (Node)."""
    run_script = E2E_SCRIPTS_DIR / "run.mjs"
    if not run_script.exists():
        print(f"[office] ERROR: {run_script} not found.", file=sys.stderr)
        return False

    cmd = ["node", str(run_script)]
    if module_filter:
        cmd += ["--module", module_filter]

    env = {**os.environ, "E2E_BASE_URL": BASE_URL}
    result = _run(cmd, check=False, cwd=str(FRONTEND_DIR), env=env)
    return result.returncode == 0


def cmd_full() -> bool:
    """Full cycle: up → office modules → cleanup marker → timing."""
    t0 = time.time()
    results: dict[str, bool] = {}

    if not cmd_up():
        print("[full] ABORT: container failed to start.")
        return False
    results["up"] = True

    results["office"] = cmd_office()

    # Android wave is optional (needs AVDs + adb). Code path: android-tennis-referee/scripts/run_parallel_courts.ps1
    print("[full] Android: SKIP in this orchestrator (run scripts/run_parallel_courts.ps1 separately when AVDs are up)")
    results["android"] = True

    elapsed = time.time() - t0
    print(f"\n{'='*50}")
    print(f"[full] Results:")
    for step, ok in results.items():
        status = "PASS" if ok else "FAIL"
        print(f"  {step}: {status}")
    print(f"  Total time: {elapsed:.1f}s")
    print(f"{'='*50}")

    cmd_down()
    return all(results.values())


def main():
    parser = argparse.ArgumentParser(description="E2E tournament orchestrator")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("up", help="Start E2E container")
    sub.add_parser("down", help="Stop E2E container")
    sub.add_parser("health", help="Check health endpoint")
    office_parser = sub.add_parser("office", help="Run office Playwright modules")
    office_parser.add_argument("--module", help="Run a specific module (e.g. 01_bootstrap)")
    sub.add_parser("full", help="Full cycle: up + office + cleanup + timing")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "up":
        sys.exit(0 if cmd_up() else 1)
    elif args.command == "down":
        cmd_down()
    elif args.command == "health":
        sys.exit(0 if cmd_health() else 1)
    elif args.command == "office":
        sys.exit(0 if cmd_office(getattr(args, "module", None)) else 1)
    elif args.command == "full":
        sys.exit(0 if cmd_full() else 1)


if __name__ == "__main__":
    main()
