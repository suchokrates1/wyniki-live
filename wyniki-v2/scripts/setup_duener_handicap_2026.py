#!/usr/bin/env python3
"""Create the 5th Dürener Handicap 2026 tournament with players and groups."""
from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path
from typing import Any

from werkzeug.security import generate_password_hash

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from wyniki import database

TOURNAMENT_NAME = "5th Dürener Handicap 2026"

DIVISIONS: list[dict[str, Any]] = [
    {
        "group_name": "B1 Men",
        "category": "B1",
        "gender": "M",
        "players": [
            ("Lars", "Stetten", "DE"),
            ("Carlos", "Arbos", "FR"),
            ("Naqi", "Rizvi", "GB"),
            ("Lucas", "Bartlewski", "DE"),
        ],
    },
    {
        "group_name": "B2 Mixed",
        "category": "B2",
        "gender": "",
        "players": [
            ("Dana", "Granowski", "DE"),
            ("Siomone", "Kaminski", "DE"),
            ("Axel", "Teichmann", "DE"),
            ("Yannik", "Neumann", "DE"),
            ("Marian", "Wywiórski", "PL"),
        ],
    },
    {
        "group_name": "B3/4 Mixed",
        "category": "B34",
        "gender": "",
        "players": [
            ("Christian", "Schäfer", "DE"),
            ("Rick", "Bouwens", "NL"),
            ("Daniela", "Wallace", "DE"),
        ],
    },
]


def _find_existing_tournament() -> dict[str, Any] | None:
    for tournament in database.fetch_tournaments():
        if tournament.get("name") == TOURNAMENT_NAME:
            return tournament
    return None


def _insert_players(tournament_id: int) -> dict[str, int]:
    player_ids: dict[str, int] = {}
    with database.db_conn() as conn:
        cursor = conn.cursor()
        for division in DIVISIONS:
            category = division["category"]
            gender = division["gender"]
            for first_name, last_name, country in division["players"]:
                full_name = f"{first_name} {last_name}".strip()
                cursor.execute(
                    """
                    INSERT INTO players (
                        tournament_id, name, first_name, last_name, category, country, gender, global_player_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
                    """,
                    (tournament_id, full_name, first_name, last_name, category, country, gender),
                )
                player_ids[division["group_name"], full_name] = cursor.lastrowid
        conn.commit()
    return player_ids


def _save_groups(tournament_id: int, player_ids: dict[tuple[str, str], int]) -> None:
    groups = []
    for division in DIVISIONS:
        group_name = division["group_name"]
        groups.append(
            {
                "name": group_name,
                "players": [
                    player_ids[(group_name, f"{first} {last}".strip())]
                    for first, last, _country in division["players"]
                ],
            }
        )
    if not database.save_bracket_groups(tournament_id, groups):
        raise RuntimeError("Failed to save bracket groups")


def setup_tournament(args: argparse.Namespace) -> int:
    database.init_db()

    existing = _find_existing_tournament()
    if existing and not args.replace:
        print(f"Tournament already exists: id={existing['id']} name={TOURNAMENT_NAME}")
        print("Use --replace to delete and recreate.")
        return 0
    if existing and args.replace:
        database.delete_tournament(existing["id"])

    office_password = args.office_password or os.getenv("DUEREN_OFFICE_PASSWORD") or "dueren2026"
    access_key = args.access_key or os.getenv("DUEREN_ACCESS_KEY") or secrets.token_urlsafe(12)

    tournament_id = database.insert_tournament(
        TOURNAMENT_NAME,
        args.start_date,
        args.end_date,
        active=not args.inactive,
        city="Düren",
        country="DE",
        report_email=args.report_email,
        is_public=True,
        stats_enabled=True,
        is_simulation=False,
        access_key=access_key,
        office_password_hash=generate_password_hash(office_password),
    )
    if not tournament_id:
        raise RuntimeError("Failed to create tournament")

    database.set_mixed_categories(tournament_id, ["B2", "B34"])
    player_ids = _insert_players(tournament_id)
    _save_groups(tournament_id, player_ids)
    database.seed_provisional_knockout_from_groups(tournament_id, schedule_day=args.playoff_day)
    if args.courts > 0:
        database.create_tournament_courts(tournament_id, args.courts)

    group_matches = sum(
        len(div["players"]) * (len(div["players"]) - 1) // 2
        for div in DIVISIONS
    )
    print(f"Created tournament: {TOURNAMENT_NAME}")
    print(f"id={tournament_id}")
    print(f"dates={args.start_date} .. {args.end_date}")
    print(f"players={len(player_ids)}")
    print(f"groups={len(DIVISIONS)}")
    print(f"group_matches={group_matches}")
    print(f"access_key={access_key}")
    print(f"office_password={office_password}")
    print(f"active={0 if args.inactive else 1}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Set up the Dürener Handicap 2026 tournament.")
    parser.add_argument("--replace", action="store_true", help="Delete and recreate if it already exists.")
    parser.add_argument("--inactive", action="store_true", help="Create tournament as inactive.")
    parser.add_argument("--start-date", default="2026-07-18")
    parser.add_argument("--end-date", default="2026-07-19")
    parser.add_argument("--playoff-day", default="2026-07-19", help="Default schedule day for knockout slots.")
    parser.add_argument("--report-email", default="")
    parser.add_argument("--access-key", default="")
    parser.add_argument("--office-password", default="")
    parser.add_argument("--courts", type=int, default=4)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(setup_tournament(parse_args()))
