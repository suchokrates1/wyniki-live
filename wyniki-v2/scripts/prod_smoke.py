#!/usr/bin/env python3
"""Basic production smoke checks for Wyniki Live."""
from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request


def fetch_json(url: str) -> tuple[int, dict]:
    request = urllib.request.Request(url, headers={"User-Agent": "wyniki-smoke/1.0"})
    context = ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=30, context=context) as response:
        payload = response.read().decode("utf-8")
        return response.status, json.loads(payload)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://score.vestmedia.pl")
    args = parser.parse_args()

    checks = [
        ("health", "/health", lambda data: data.get("status") == "healthy"),
        ("snapshot", "/api/snapshot", lambda data: isinstance(data.get("courts"), dict) or isinstance(data.get("courts"), list)),
        ("active_tournaments", "/api/tournaments/active", lambda data: isinstance(data, list)),
        ("active_players", "/api/players/active", lambda data: isinstance(data, list)),
    ]

    failed = []
    for name, path, predicate in checks:
        url = f"{args.base_url.rstrip('/')}{path}"
        try:
            status, payload = fetch_json(url)
            ok = status == 200 and predicate(payload)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            failed.append(f"{name}: {exc}")
            continue
        if not ok:
            failed.append(f"{name}: unexpected response")

    if failed:
        for item in failed:
            print(item, file=sys.stderr)
        return 1

    print(f"Smoke OK for {args.base_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())