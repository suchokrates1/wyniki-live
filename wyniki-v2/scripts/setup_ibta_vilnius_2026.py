#!/usr/bin/env python3
"""Create the IBTA World Blind Tennis Championships 2026 tournament on a live DB.

Loads the roster JSON (names, ISO country, visual class, birth dates), upserts
global_players, adds tournament entries, confirms singles categories, and
activates this tournament. Does not create courts, groups, or doubles.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
from pathlib import Path
from typing import Any

from werkzeug.security import generate_password_hash

for candidate in (Path("/app"), Path(__file__).resolve().parents[1]):
    if (candidate / "wyniki").is_dir():
        sys.path.insert(0, str(candidate))
        break

from wyniki import database

TOURNAMENT_NAME = "IBTA World Blind Tennis Championships 2026"
START_DATE = "2026-08-25"
END_DATE = "2026-08-29"
CITY = "Vilnius"
COUNTRY = "LT"

TOURNAMENT_CATEGORIES: list[dict[str, Any]] = [
    {"preset_key": "B1M", "label": "B1 Men", "hint_bands": ["B1"]},
    {"preset_key": "B1K", "label": "B1 Women", "hint_bands": ["B1"]},
    {"preset_key": "B2M", "label": "B2 Men", "hint_bands": ["B2"]},
    {"preset_key": "B2K", "label": "B2 Women", "hint_bands": ["B2"]},
    {"preset_key": "B3M", "label": "B3 Men", "hint_bands": ["B3"]},
    {"preset_key": "B3K", "label": "B3 Women", "hint_bands": ["B3"]},
    {"preset_key": "B4M", "label": "B4 Men", "hint_bands": ["B4"]},
    {"preset_key": "B4K", "label": "B4 Women", "hint_bands": ["B4"]},
]


def _roster_path(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    here = Path(__file__).resolve().parent
    return here / "ibta_vilnius_2026_players.json"


def _load_roster(path: Path) -> list[dict[str, Any]]:
    players = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(players, list) or not players:
        raise RuntimeError(f"Empty roster: {path}")
    return players


def _find_existing_tournament() -> dict[str, Any] | None:
    for tournament in database.fetch_tournaments():
        if tournament.get("name") == TOURNAMENT_NAME:
            return tournament
    return None


def _upsert_global_player(cursor, player: dict[str, Any]) -> tuple[int, str]:
    first_name = player["first_name"]
    last_name = player["last_name"]
    cursor.execute(
        """
        SELECT id, first_name, last_name, gender, country, category, birth_date
        FROM global_players
        WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
          AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
        LIMIT 1
        """,
        (first_name, last_name),
    )
    row = cursor.fetchone()
    if row:
        global_id = int(row["id"])
        action = "matched"
        cursor.execute(
            """
            UPDATE global_players
            SET gender = CASE WHEN COALESCE(TRIM(gender), '') = '' THEN ? ELSE gender END,
                country = CASE WHEN COALESCE(TRIM(country), '') = '' THEN ? ELSE country END,
                category = ?,
                birth_date = ?
            WHERE id = ?
            """,
            (
                player["gender"],
                player["country"],
                player["category"],
                player["birth_date"],
                global_id,
            ),
        )
        return global_id, action

    cursor.execute(
        """
        INSERT INTO global_players (first_name, last_name, gender, birth_date, country, category)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            first_name,
            last_name,
            player["gender"],
            player["birth_date"],
            player["country"],
            player["category"],
        ),
    )
    return int(cursor.lastrowid), "created"


def _add_tournament_player(cursor, tournament_id: int, player: dict[str, Any], global_id: int) -> str:
    cursor.execute(
        "SELECT id FROM players WHERE tournament_id = ? AND global_player_id = ?",
        (tournament_id, global_id),
    )
    if cursor.fetchone():
        return "exists"

    full_name = f"{player['first_name']} {player['last_name']}".strip()
    cursor.execute(
        """
        INSERT INTO players (
            tournament_id, name, first_name, last_name, category, country, gender, global_player_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            tournament_id,
            full_name,
            player["first_name"],
            player["last_name"],
            player["category"],
            player["country"],
            player["gender"],
            global_id,
        ),
    )
    return "added"


def _deactivate_other_public_tournaments(tournament_id: int) -> list[dict[str, Any]]:
    deactivated: list[dict[str, Any]] = []
    for tournament in database.fetch_tournaments():
        if int(tournament.get("id") or 0) == tournament_id:
            continue
        if int(tournament.get("active") or 0) != 1:
            continue
        if int(tournament.get("is_simulation") or 0) == 1:
            continue
        database.set_tournament_active_state(int(tournament["id"]), False)
        deactivated.append({"id": tournament["id"], "name": tournament["name"]})
    return deactivated


def setup_tournament(args: argparse.Namespace) -> int:
    database.init_db()
    roster = _load_roster(_roster_path(args.roster))

    existing = _find_existing_tournament()
    if existing and not args.replace:
        print(f"Tournament already exists: id={existing['id']} name={TOURNAMENT_NAME}")
        print("Use --replace to delete and recreate.")
        return 1

    if existing and args.replace:
        database.delete_tournament(existing["id"])

    office_password = args.office_password or os.getenv("VILNIUS_OFFICE_PASSWORD") or "vilnius2026"
    access_key = args.access_key or os.getenv("VILNIUS_ACCESS_KEY") or secrets.token_urlsafe(12)

    tournament_id = database.insert_tournament(
        TOURNAMENT_NAME,
        START_DATE,
        END_DATE,
        active=False,
        city=CITY,
        country=COUNTRY,
        report_email=args.report_email,
        is_public=True,
        stats_enabled=True,
        is_simulation=False,
        access_key=access_key,
        office_password_hash=generate_password_hash(office_password),
    )
    if not tournament_id:
        raise RuntimeError("Failed to create tournament")

    categories = database.confirm_tournament_categories(tournament_id, TOURNAMENT_CATEGORIES)
    if len(categories) != 8:
        raise RuntimeError(f"Expected 8 categories, got {len(categories)}")

    created = matched = added = skipped = 0
    with database.db_conn() as conn:
        cursor = conn.cursor()
        for player in roster:
            global_id, global_action = _upsert_global_player(cursor, player)
            if global_action == "created":
                created += 1
            else:
                matched += 1
            player_action = _add_tournament_player(cursor, tournament_id, player, global_id)
            if player_action == "added":
                added += 1
            else:
                skipped += 1
        conn.commit()

    deactivated = _deactivate_other_public_tournaments(tournament_id)
    if not database.set_tournament_active_state(tournament_id, True):
        raise RuntimeError("Failed to activate tournament")

    tournament_players = database.fetch_players(tournament_id)
    print(f"tournament_id={tournament_id}")
    print(f"name={TOURNAMENT_NAME}")
    print(f"dates={START_DATE}..{END_DATE}")
    print(f"city={CITY} country={COUNTRY}")
    print(f"categories={len(categories)}")
    print(f"roster={len(roster)} tournament_players={len(tournament_players)}")
    print(f"global_created={created} global_matched={matched} entries_added={added} entries_existing={skipped}")
    print(f"deactivated={deactivated}")
    print(f"access_key={access_key}")
    print(f"office_password={office_password}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roster", help="Path to ibta_vilnius_2026_players.json")
    parser.add_argument("--office-password", default="")
    parser.add_argument("--access-key", default="")
    parser.add_argument("--report-email", default="")
    parser.add_argument("--replace", action="store_true")
    return setup_tournament(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
