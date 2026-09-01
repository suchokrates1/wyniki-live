#!/usr/bin/env python3
"""Align B4 Men/Women finished matches with tennis.lt / Tournated winners.

Tournated stores the score string winner-first. We stored it as player1-first and
then took player1 as winner when they had the larger numbers — 7 B4 Men results
and 2 B4 Women results are reversed vs the official table.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
from typing import Any

DB = os.environ.get("DATABASE_PATH", "/data/wyniki.sqlite3")
TID = 31


def last(name: str) -> str:
    parts = str(name or "").split()
    return parts[-1].lower() if parts else ""


def pair_key(a: str, b: str) -> tuple[str, str]:
    left, right = last(a), last(b)
    return (left, right) if left <= right else (right, left)


def names_match(row: sqlite3.Row, left: str, right: str) -> bool:
    return pair_key(row["player1_name"], row["player2_name"]) == pair_key(left, right)


def flip_history(raw: str | None) -> str:
    sets = json.loads(raw or "[]")
    for item in sets:
        if not isinstance(item, dict):
            continue
        item["player1_games"], item["player2_games"] = (
            item.get("player2_games", 0),
            item.get("player1_games", 0),
        )
    return json.dumps(sets, ensure_ascii=False)


def implied_winner(row: sqlite3.Row) -> str:
    sets = json.loads(row["sets_history"] or "[]")
    wins1 = 0
    wins2 = 0
    for item in sets:
        if not isinstance(item, dict):
            continue
        left = int(item.get("player1_games") or 0)
        right = int(item.get("player2_games") or 0)
        if left > right:
            wins1 += 1
        elif right > left:
            wins2 += 1
    if wins1 > wins2:
        return row["player1_name"]
    if wins2 > wins1:
        return row["player2_name"]
    return row["winner_name"] or ""


def official_winner_name(row: sqlite3.Row, winner_last: str) -> str:
    if last(row["player1_name"]) == winner_last:
        return row["player1_name"]
    if last(row["player2_name"]) == winner_last:
        return row["player2_name"]
    raise SystemExit(f"winner {winner_last} not in {row['player1_name']} vs {row['player2_name']}")


# Official Tournated winner (surname token) for each flipped pairing.
B4_MEN_FLIPS = {
    pair_key("Balwierz", "Katsuda-Green"): "katsuda-green",
    pair_key("Szulc", "Balwierz"): "balwierz",
    pair_key("Skarżyński", "Balwierz"): "balwierz",
    pair_key("Hayward", "Balwierz"): "hayward",
    pair_key("Szulc", "Skarżyński"): "skarżyński",
    pair_key("Hayward", "Katsuda-Green"): "katsuda-green",
    pair_key("Hayward", "Skarżyński"): "hayward",
}

B4_WOMEN_FLIPS = {
    pair_key("Quinn", "Antczak"): "antczak",
    pair_key("Antczak", "Kelly"): "kelly",
    pair_key("Quinn", "Kelly"): "kelly",
}


def load_rows(conn: sqlite3.Connection, needles: list[str]) -> list[sqlite3.Row]:
    like = " OR ".join(["player1_name LIKE ? OR player2_name LIKE ?"] * len(needles))
    params: list[Any] = []
    for needle in needles:
        params.extend([f"%{needle}%", f"%{needle}%"])
    return list(conn.execute(
        f"""
        SELECT id, player1_name, player2_name, winner_name, player1_sets, player2_sets,
               sets_history, phase, status
        FROM matches
        WHERE tournament_id = ? AND status = 'finished' AND ({like})
        ORDER BY id
        """,
        (TID, *params),
    ))


def apply_flips(conn: sqlite3.Connection, rows: list[sqlite3.Row], mapping: dict, dry: bool) -> int:
    changed = 0
    seen: set[tuple[str, str]] = set()
    for row in rows:
        key = pair_key(row["player1_name"], row["player2_name"])
        winner_last = mapping.get(key)
        if not winner_last:
            continue
        if "/" in (row["player1_name"] or "") or "/" in (row["player2_name"] or ""):
            continue
        current = last(implied_winner(row))
        if not current:
            print("NO IMPLIED WINNER", dict(row))
            continue
        if current == winner_last:
            continue
        if key in seen:
            print("SKIP extra copy", dict(row))
            continue
        seen.add(key)
        new_winner = official_winner_name(row, winner_last)
        new_history = flip_history(row["sets_history"])
        print(
            f"FLIP {row['id']} {row['player1_name']} vs {row['player2_name']} "
            f"{row['winner_name']} -> {new_winner} phase={row['phase']}"
        )
        if dry:
            changed += 1
            continue
        conn.execute(
            """
            UPDATE matches
            SET winner_name = ?, player1_sets = ?, player2_sets = ?, sets_history = ?
            WHERE id = ?
            """,
            (new_winner, row["player2_sets"], row["player1_sets"], new_history, row["id"]),
        )
        changed += 1
    return changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    dry = not args.apply
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    men = load_rows(conn, ["Katsuda", "Balwierz", "Szulc", "Hayward", "Skar"])
    women = load_rows(conn, ["Antczak", "Kelly", "Quinn", "Pybus", "Hobbs"])
    print("=== B4 Men candidates", len(men), "===")
    n_men = apply_flips(conn, men, B4_MEN_FLIPS, dry)
    print("=== B4 Women singles ===")
    for row in women:
        if "/" in (row["player1_name"] or "") or "/" in (row["player2_name"] or ""):
            continue
        print(row["id"], row["phase"], row["player1_name"], "vs", row["player2_name"], "W", row["winner_name"], "sets", row["player1_sets"], row["player2_sets"])
    n_women = apply_flips(conn, women, B4_WOMEN_FLIPS, dry)

    kelly_quinn = next((row for row in women if names_match(row, "Kelly", "Quinn")), None)
    if kelly_quinn and (kelly_quinn["phase"] or "") != "Grupowa":
        print(f"PHASE {kelly_quinn['id']} {kelly_quinn['phase']!r} -> Grupowa")
        if not dry:
            conn.execute("UPDATE matches SET phase = 'Grupowa' WHERE id = ?", (kelly_quinn["id"],))
        n_women += 1

    pybus_rows = [row for row in women if names_match(row, "Antczak", "Pybus") and "/" not in (row["player1_name"] or "")]
    if len(pybus_rows) >= 2:
        keep, extra = pybus_rows[0], pybus_rows[1]
        print(f"KEEP group Antczak-Pybus {keep['id']}; extra {extra['id']} phase {extra['phase']!r} -> Pucharowa")
        if not dry:
            conn.execute(
                """
                UPDATE matches SET
                    player1_sets = 2, player2_sets = 0, winner_name = ?,
                    sets_history = ?
                WHERE id = ?
                """,
                (
                    keep["player1_name"] if last(keep["player1_name"]) == "antczak" else keep["player2_name"],
                    json.dumps([
                        {"set_number": 1, "player1_games": 5 if last(keep["player1_name"]) == "antczak" else 3,
                         "player2_games": 3 if last(keep["player1_name"]) == "antczak" else 5},
                        {"set_number": 2, "player1_games": 5 if last(keep["player1_name"]) == "antczak" else 4,
                         "player2_games": 4 if last(keep["player1_name"]) == "antczak" else 5,
                         "tiebreak_loser_points": 4},
                    ], ensure_ascii=False),
                    keep["id"],
                ),
            )
            conn.execute("UPDATE matches SET phase = 'Pucharowa' WHERE id = ? AND IFNULL(phase,'') = 'Grupowa'", (extra["id"],))
        n_women += 1
    if not dry:
        conn.commit()
    print(f"{'DRY' if dry else 'APPLIED'} men={n_men} women={n_women}")


if __name__ == "__main__":
    main()
