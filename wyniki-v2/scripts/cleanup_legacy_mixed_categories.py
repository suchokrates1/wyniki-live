#!/usr/bin/env python3
"""Remove deprecated mixed_categories:{id} app_settings after tournament_categories migration."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from wyniki import database


def cleanup_tournament(tournament_id: int, *, dry_run: bool = False) -> int:
    database.init_db()
    tournament = database.fetch_tournament(tournament_id)
    if not tournament:
        print(f"Tournament {tournament_id} not found", file=sys.stderr)
        return 1

    categories = database.fetch_tournament_categories(tournament_id)
    legacy = database.get_mixed_categories(tournament_id)
    if not legacy:
        print(f"Tournament {tournament_id} ({tournament['name']}): no legacy mixed_categories key")
        return 0
    if not categories:
        print(
            f"Tournament {tournament_id} ({tournament['name']}): legacy {legacy!r} kept — no tournament_categories yet",
            file=sys.stderr,
        )
        return 1

    print(f"Tournament {tournament_id} ({tournament['name']}): remove legacy {legacy!r} ({len(categories)} categories)")
    if dry_run:
        return 0
    if database.clear_legacy_mixed_categories(tournament_id):
        print("  deleted")
    else:
        print("  nothing deleted (key missing?)")
    return 0


def cleanup_all(*, dry_run: bool = False) -> int:
    database.init_db()
    exit_code = 0
    for tournament in database.fetch_tournaments():
        tid = int(tournament["id"])
        if not database.get_mixed_categories(tid):
            continue
        if not database.fetch_tournament_categories(tid):
            exit_code = max(exit_code, 1)
            continue
        code = cleanup_tournament(tid, dry_run=dry_run)
        exit_code = max(exit_code, code)
    return exit_code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Delete legacy mixed_categories app_settings keys.")
    parser.add_argument("tournament_id", nargs="?", type=int, help="Single tournament id")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--all", action="store_true", help="Clean all eligible tournaments")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.tournament_id is not None:
        raise SystemExit(cleanup_tournament(args.tournament_id, dry_run=args.dry_run))
    raise SystemExit(cleanup_all(dry_run=args.dry_run))
