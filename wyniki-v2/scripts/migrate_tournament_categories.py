#!/usr/bin/env python3
"""Migrate legacy tournaments to tournament_categories (infer from bracket groups)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from wyniki import database


def migrate_tournament(tournament_id: int, *, dry_run: bool = False) -> int:
    database.init_db()
    tournament = database.fetch_tournament(tournament_id)
    if not tournament:
        print(f"Tournament {tournament_id} not found", file=sys.stderr)
        return 1

    existing = database.fetch_tournament_categories(tournament_id)
    if existing:
        print(f"Tournament {tournament_id} ({tournament['name']}): already has {len(existing)} categories")
        for cat in existing:
            print(f"  - [{cat['id']}] {cat['label']}")
        return 0

    groups = database.fetch_bracket_groups(tournament_id)
    print(f"Tournament {tournament_id} ({tournament['name']}): {len(groups)} groups, no categories yet")
    for group in groups:
        print(f"  - group id={group['id']} name={group['name']!r} category_id={group.get('tournament_category_id')}")

    if dry_run:
        print("Dry run — no changes written.")
        return 0

    categories = database.migrate_tournament_categories_from_legacy(tournament_id)
    print(f"Migrated {len(categories)} categories:")
    for cat in categories:
        print(f"  - [{cat['id']}] {cat['label']}")

    groups_after = database.fetch_bracket_groups(tournament_id)
    for group in groups_after:
        print(f"  linked group id={group['id']} -> category_id={group.get('tournament_category_id')}")
    return 0


def migrate_all(*, dry_run: bool = False) -> int:
    database.init_db()
    tournaments = database.fetch_tournaments()
    exit_code = 0
    for tournament in tournaments:
        tid = int(tournament["id"])
        existing = database.fetch_tournament_categories(tid)
        if existing:
            continue
        groups = database.fetch_bracket_groups(tid)
        if not groups and not database.get_mixed_categories(tid):
            continue
        print(f"\n--- Tournament {tid}: {tournament['name']} ---")
        code = migrate_tournament(tid, dry_run=dry_run)
        exit_code = max(exit_code, code)
    return exit_code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate legacy mixed/group names to tournament_categories.")
    parser.add_argument("tournament_id", nargs="?", type=int, help="Single tournament id (default: all eligible)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen without writing")
    parser.add_argument("--all", action="store_true", help="Migrate all tournaments missing categories")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.tournament_id is not None:
        raise SystemExit(migrate_tournament(args.tournament_id, dry_run=args.dry_run))
    if args.all or args.tournament_id is None:
        raise SystemExit(migrate_all(dry_run=args.dry_run))
    print("Provide tournament_id or --all", file=sys.stderr)
    raise SystemExit(2)
