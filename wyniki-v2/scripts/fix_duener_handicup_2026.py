#!/usr/bin/env python3
"""Fix Dürener Handicup 2026 tournament data and apply client schedule."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from wyniki import database

TOURNAMENT_ID = 28
TOURNAMENT_NAME = "5th Dürener Handicup 2026"
START_DATE = "2026-07-17"
END_DATE = "2026-07-19"

COURTS = {
    1: "t28-1",
    2: "t28-2",
    3: "t28-3",
    4: "t28-4",
}

# Client plan: Platzbelegung / Zeitplan (Freitag–Sonntag)
SCHEDULE_SLOTS: list[tuple[str, str, str, int]] = [
    # Freitag 17.07 — B2 on Platz 2
    ("2026-07-17", "16:00", COURTS[2], 278),
    ("2026-07-17", "17:10", COURTS[2], 279),
    ("2026-07-17", "18:20", COURTS[2], 280),
    # Samstag 18.07
    ("2026-07-18", "10:00", COURTS[1], 272),  # B1
    ("2026-07-18", "10:00", COURTS[2], 288),  # B3/4
    ("2026-07-18", "10:00", COURTS[3], 281),  # B2
    ("2026-07-18", "11:10", COURTS[2], 282),  # B2
    ("2026-07-18", "11:10", COURTS[4], 273),  # B1
    ("2026-07-18", "12:20", COURTS[1], 274),  # B1
    ("2026-07-18", "12:20", COURTS[2], 289),  # B3/4
    ("2026-07-18", "12:20", COURTS[4], 275),  # B1
    ("2026-07-18", "13:30", COURTS[2], 283),  # B2
    ("2026-07-18", "13:30", COURTS[3], 284),  # B2
    ("2026-07-18", "14:40", COURTS[1], 276),  # B1
    ("2026-07-18", "14:40", COURTS[2], 290),  # B3/4
    ("2026-07-18", "14:40", COURTS[4], 277),  # B1
    # Sonntag 19.07
    ("2026-07-19", "10:00", COURTS[1], 292),  # B1 — Spiel um Platz 3
    ("2026-07-19", "10:00", COURTS[2], 285),  # B2
    ("2026-07-19", "10:00", COURTS[3], 286),  # B2
    ("2026-07-19", "11:10", COURTS[1], 291),  # B1 — Finale
    ("2026-07-19", "11:10", COURTS[2], 287),  # B2
    ("2026-07-19", "11:10", COURTS[3], 293),  # B3/4 — Finale
]

SIMONE_PLAYER_ID = 493


def _court_label(court_id: str) -> str:
    courts = {c["kort_id"]: c["name"] for c in database.fetch_courts_for_tournament(TOURNAMENT_ID)}
    return courts.get(court_id, court_id)


def fix_tournament_meta() -> None:
    with database.db_conn() as conn:
        c = conn.cursor()
        c.execute(
            "UPDATE tournaments SET name = ?, start_date = ?, end_date = ? WHERE id = ?",
            (TOURNAMENT_NAME, START_DATE, END_DATE, TOURNAMENT_ID),
        )
        conn.commit()
    print(f"Updated tournament name/dates: {TOURNAMENT_NAME} {START_DATE}..{END_DATE}")


def fix_simone_name() -> None:
    players = [p for p in database.fetch_players(TOURNAMENT_ID) if int(p["id"]) == SIMONE_PLAYER_ID]
    if not players:
        raise RuntimeError(f"Player {SIMONE_PLAYER_ID} not found")
    player = players[0]
    database.update_player(
        SIMONE_PLAYER_ID,
        "Simone Kaminski",
        player.get("category") or "B2",
        player.get("country") or "DE",
        first_name="Simone",
        last_name="Kaminski",
        gender=player.get("gender") or "",
    )
    with database.db_conn() as conn:
        c = conn.cursor()
        for column in ("player1_name", "player2_name"):
            c.execute(
                f"""
                UPDATE tournament_schedule
                SET {column} = REPLACE({column}, 'Siomone Kaminski', 'Simone Kaminski')
                WHERE tournament_id = ?
                  AND {column} LIKE '%Siomone Kaminski%'
                """,
                (TOURNAMENT_ID,),
            )
        conn.commit()
    print("Fixed player name: Simone Kaminski")


def apply_schedule() -> None:
    now = database._utc_now()
    court_labels = {cid: _court_label(cid) for cid in COURTS.values()}
    with database.db_conn() as conn:
        c = conn.cursor()
        c.execute(
            """
            UPDATE tournament_schedule
            SET court_id = '', court_label = '', scheduled_time = '', updated_at = ?
            WHERE tournament_id = ?
            """,
            (now, TOURNAMENT_ID),
        )
        for day_date, scheduled_time, court_id, schedule_id in SCHEDULE_SLOTS:
            c.execute(
                """
                UPDATE tournament_schedule
                SET day_date = ?, scheduled_time = ?, court_id = ?, court_label = ?,
                    status = CASE WHEN status = 'draft' THEN 'planned' ELSE status END,
                    updated_at = ?
                WHERE id = ? AND tournament_id = ?
                """,
                (
                    day_date,
                    scheduled_time,
                    court_id,
                    court_labels.get(court_id, court_id),
                    now,
                    schedule_id,
                    TOURNAMENT_ID,
                ),
            )
            if c.rowcount != 1:
                raise RuntimeError(f"Schedule entry {schedule_id} not updated")
        conn.commit()
    print(f"Applied {len(SCHEDULE_SLOTS)} schedule slots")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tournament-id", type=int, default=TOURNAMENT_ID)
    args = parser.parse_args()
    global TOURNAMENT_ID
    TOURNAMENT_ID = args.tournament_id
    database.init_db()
    fix_tournament_meta()
    fix_simone_name()
    apply_schedule()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
