#!/usr/bin/env python3
"""Fix Düren 2026 player classifications (B1–B4 + gender, never B34) and link global_players."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from wyniki import database

TOURNAMENT_ID = 28

# Klasyfikacja zawodnika (z listy klienta) — niezależna od kategorii turniejowej B3/4 Mixed.
PLAYER_FIXES: list[dict] = [
    {"player_id": 497, "category": "B3", "gender": "M", "country": "DE"},
    {"player_id": 498, "category": "B3", "gender": "M", "country": "NL"},
    {"player_id": 499, "category": "B4", "gender": "K", "country": "DE"},
    # B2 Mixed — płeć na rekordzie zawodnika (turniej gra w kategorii „B2 Mixed”)
    {"player_id": 492, "category": "B2", "gender": "K", "country": "DE"},
    {"player_id": 493, "category": "B2", "gender": "K", "country": "DE"},
    {"player_id": 494, "category": "B2", "gender": "M", "country": "DE"},
    {"player_id": 495, "category": "B2", "gender": "M", "country": "DE"},
    {"player_id": 496, "category": "B2", "gender": "M", "country": "PL"},
    # B1 Men
    {"player_id": 488, "category": "B1", "gender": "M", "country": "DE"},
    {"player_id": 489, "category": "B1", "gender": "M", "country": "FR"},
    {"player_id": 490, "category": "B1", "gender": "M", "country": "GB"},
    {"player_id": 491, "category": "B1", "gender": "M", "country": "DE"},
]

GLOBAL_UPDATES: dict[int, dict] = {
    126: {"category": "B3", "gender": "M", "country": "DE"},
    127: {"category": "B4", "gender": "K", "country": "DE"},
    128: {"gender": "K"},
    11: {"gender": "K", "country": "DE"},
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tournament-id", type=int, default=TOURNAMENT_ID)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    tournament_id = args.tournament_id

    def _row(pid: int) -> dict:
        players = [p for p in database.fetch_players(tournament_id) if int(p["id"]) == pid]
        if not players:
            raise RuntimeError(f"Player {pid} not found in tournament {tournament_id}")
        return players[0]

    database.init_db()
    for fix in PLAYER_FIXES:
        player = _row(fix["player_id"])
        name = player.get("name") or f"{player.get('first_name')} {player.get('last_name')}".strip()
        first = player.get("first_name") or ""
        last = player.get("last_name") or ""
        category = fix["category"]
        gender = fix.get("gender") or ""
        country = fix.get("country") or player.get("country") or ""
        if args.dry_run:
            print(f"DRY player {fix['player_id']} {name}: {player.get('category')!r} -> {category!r}, gender={gender!r}")
            continue
        database.update_player(
            fix["player_id"], name, category, country,
            first_name=first, last_name=last, gender=gender, tournament_id=tournament_id,
        )
        row = _row(fix["player_id"])
        print(f"Fixed player {fix['player_id']} {name}: category={category} gender={gender} gp={row.get('global_player_id')}")

    for gp_id, fields in GLOBAL_UPDATES.items():
        if args.dry_run:
            print(f"DRY global {gp_id}: {fields}")
            continue
        with database.db_conn() as conn:
            cursor = conn.cursor()
            sets = [f"{k} = ?" for k in fields]
            params = list(fields.values()) + [gp_id]
            cursor.execute(f"UPDATE global_players SET {', '.join(sets)} WHERE id = ?", params)
            conn.commit()
        print(f"Updated global_player {gp_id}: {fields}")

    if not args.dry_run:
        players = database.fetch_players(tournament_id)
        bad = [p for p in players if str(p.get("category") or "").upper() in {"B34", "B3/4"}]
        if bad:
            raise RuntimeError(f"Still have invalid player categories: {bad}")
        print("OK: no B34 player categories")
        for p in sorted(players, key=lambda x: x.get("category") or ""):
            print(f"  {p['id']} {p['name']}: cat={p.get('category')} gender={p.get('gender')!r} gp={p.get('global_player_id')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
