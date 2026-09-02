#!/usr/bin/env python3
"""Align group-table matches with tennis.lt / Tournated.

Tournated `score` is winner-first. We store player1-first and derive the winner
from set games, which reversed many group results vs the official tables.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB = os.environ.get("DATABASE_PATH", "/data/wyniki.sqlite3")
TID = 31
DUMP = Path(os.environ.get("TLT_GROUP_DUMP", Path(__file__).with_name("_tmp_group_mismatches.json")))

SET_RE = re.compile(r"(?:\[)?(\d+)\s*:\s*(\d+)(?:\((\d+)(?:\s*:\s*(\d+))?\))?(?:\])?")
KO_MARKERS = (
    "puchar", "finał", "final", "ćwierć", "cwierc", "półfina", "polfina",
    "miejsce", "quarter", "semi", "consolation",
)


def last_token(name: str) -> str:
    parts = [p for p in re.split(r"\s+", str(name or "").replace("/", " ")) if p]
    return parts[-1].lower() if parts else ""


def name_tokens(name: str) -> frozenset[str]:
    text = str(name or "").strip()
    if not text:
        return frozenset()
    return frozenset(last_token(person) for person in re.split(r"\s*/\s*", text) if last_token(person))


def parse_tlt_score(raw: str | None) -> list[dict]:
    text = str(raw or "").strip()
    if not text:
        return []
    sets: list[dict] = []
    for match in SET_RE.finditer(text):
        w_games, l_games = int(match.group(1)), int(match.group(2))
        tb_w, tb_l = match.group(3), match.group(4)
        wrapped = text[max(0, match.start() - 1) : match.end() + 1]
        is_stb = "[" in wrapped or (max(w_games, l_games) >= 10 and abs(w_games - l_games) >= 2)
        if w_games == l_games:
            continue
        row: dict[str, Any] = {"player1_games": w_games, "player2_games": l_games}
        if tb_w is not None:
            tb_vals = [int(tb_w)] + ([int(tb_l)] if tb_l is not None else [])
            row["tiebreak_loser_points"] = min(tb_vals)
        if is_stb:
            row["is_super_tiebreak"] = True
        sets.append(row)
    if len(sets) >= 3 and max(sets[-1]["player1_games"], sets[-1]["player2_games"]) >= 10:
        sets[-1]["is_super_tiebreak"] = True
    for idx, item in enumerate(sets, start=1):
        item["set_number"] = idx
    return sets


def orient_sets(sets: list[dict], winner_is_p1: bool) -> list[dict]:
    if winner_is_p1:
        return [dict(item) for item in sets]
    out = []
    for item in sets:
        row = dict(item)
        row["player1_games"], row["player2_games"] = item["player2_games"], item["player1_games"]
        out.append(row)
    return out


def set_wins(sets: list[dict]) -> tuple[int, int]:
    s1 = sum(1 for item in sets if item["player1_games"] > item["player2_games"])
    s2 = sum(1 for item in sets if item["player2_games"] > item["player1_games"])
    return s1, s2


def pick_name(p1: str, p2: str, winner: str) -> str:
    tokens = name_tokens(winner)
    if name_tokens(p1) == tokens:
        return p1
    if name_tokens(p2) == tokens:
        return p2
    raise SystemExit(f"winner {winner!r} not in {p1!r} vs {p2!r}")


def is_ko_phase(phase: str | None) -> bool:
    text = str(phase or "").casefold()
    return any(marker in text for marker in KO_MARKERS)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def history_scores(sets: list[dict]) -> tuple[str, str]:
    return (
        json.dumps([item["player1_games"] for item in sets], ensure_ascii=False),
        json.dumps([item["player2_games"] for item in sets], ensure_ascii=False),
    )


def apply_row(conn: sqlite3.Connection, match_id: int, winner: str, sets: list[dict], dry: bool) -> None:
    s1, s2 = set_wins(sets)
    history = json.dumps(sets, ensure_ascii=False)
    score_a, score_b = history_scores(sets)
    print(f"  UPDATE {match_id} W={winner} {s1}-{s2} {history}")
    if dry:
        return
    conn.execute(
        """
        UPDATE matches
        SET winner_name = ?, player1_sets = ?, player2_sets = ?, sets_history = ?,
            phase = CASE WHEN IFNULL(phase,'') = '' THEN 'Grupowa' ELSE phase END,
            status = 'finished', updated_at = ?
        WHERE id = ?
        """,
        (winner, s1, s2, history, now_iso(), match_id),
    )
    conn.execute(
        """
        UPDATE match_history
        SET winner_name = ?, sets_history = ?, score_a = ?, score_b = ?,
            phase = CASE WHEN IFNULL(phase,'') = '' THEN 'Grupowa' ELSE phase END
        WHERE match_id = ?
        """,
        (winner, history, score_a, score_b, match_id),
    )


def insert_missing(conn: sqlite3.Connection, rec: dict, dry: bool) -> None:
    p1, p2 = rec.get("our_p1"), rec.get("our_p2")
    if not p1 or not p2:
        print(f"  SKIP missing names {rec['tlt_p1']} vs {rec['tlt_p2']}")
        return
    winner = pick_name(p1, p2, rec["tlt_winner"])
    sets = orient_sets(parse_tlt_score(rec["tlt_score"]), name_tokens(winner) == name_tokens(p1))
    if not sets:
        print(f"  SKIP empty score {rec}")
        return
    s1, s2 = set_wins(sets)
    group_name = rec["group"]
    row = conn.execute(
        "SELECT id FROM bracket_groups WHERE tournament_id = ? AND name = ?",
        (TID, group_name),
    ).fetchone()
    group_id = row["id"] if row else None
    history = json.dumps(sets, ensure_ascii=False)
    score_a, score_b = history_scores(sets)
    ts = now_iso()
    print(f"  INSERT {group_name} {p1} vs {p2} W={winner} {s1}-{s2} group_id={group_id}")
    if dry:
        return
    cur = conn.execute(
        """
        INSERT INTO matches (
            court_id, player1_name, player2_name, status, tournament_id, bracket_group_id,
            phase, finish_reason, winner_name, player1_sets, player2_sets,
            player1_games, player2_games, player1_points, player2_points,
            sets_history, created_at, updated_at
        ) VALUES (?, ?, ?, 'finished', ?, ?, 'Grupowa', 'normal', ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)
        """,
        ("tlt-align", p1, p2, TID, group_id, winner, s1, s2, history, ts, ts),
    )
    match_id = cur.lastrowid
    conn.execute(
        """
        INSERT INTO match_history (
            kort_id, ended_ts, duration_seconds, player_a, player_b, score_a, score_b,
            category, phase, match_id, stats_mode, sets_history, tournament_id,
            finish_reason, winner_name
        ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, 'Grupowa', ?, 'standard', ?, ?, 'normal', ?)
        """,
        ("tlt-align", ts, p1, p2, score_a, score_b, rec["category"], match_id, history, TID, winner),
    )


def existing_group_match(conn: sqlite3.Connection, p1: str, p2: str) -> sqlite3.Row | None:
    rows = list(conn.execute(
        """
        SELECT id, phase, player1_name, player2_name, winner_name, sets_history
        FROM matches
        WHERE tournament_id = ? AND status = 'finished'
          AND COALESCE(finish_reason, 'normal') != 'test'
          AND (
            (player1_name = ? AND player2_name = ?)
            OR (player1_name = ? AND player2_name = ?)
            OR (player1_name LIKE ? AND player2_name LIKE ?)
            OR (player1_name LIKE ? AND player2_name LIKE ?)
          )
        ORDER BY id
        """,
        (
            TID, p1, p2, p2, p1,
            f"%{last_token(p1)}", f"%{last_token(p2)}",
            f"%{last_token(p2)}", f"%{last_token(p1)}",
        ),
    ))
    group_rows = [row for row in rows if not is_ko_phase(row["phase"])]
    return group_rows[0] if group_rows else None


def demote(conn: sqlite3.Connection, match_id: int, reason: str, dry: bool) -> None:
    print(f"  DEMOTE {match_id} -> Pucharowa ({reason})")
    if dry:
        return
    conn.execute("UPDATE matches SET phase = 'Pucharowa', updated_at = ? WHERE id = ?", (now_iso(), match_id))
    conn.execute("UPDATE match_history SET phase = 'Pucharowa' WHERE match_id = ?", (match_id,))


def sync_official(conn: sqlite3.Connection, rec: dict, dry: bool) -> None:
    ids = [mid for mid in rec.get("match_ids") or [] if mid]
    if not ids:
        print("NO MATCH ID", rec["group"], rec["tlt_p1"], rec["tlt_p2"])
        return
    match_id = ids[0]
    row = conn.execute(
        "SELECT id, player1_name, player2_name, phase, winner_name FROM matches WHERE id = ?",
        (match_id,),
    ).fetchone()
    if not row:
        print("MISSING ROW", match_id)
        return
    winner = pick_name(row["player1_name"], row["player2_name"], rec["tlt_winner"])
    sets = orient_sets(
        parse_tlt_score(rec["tlt_score"]),
        name_tokens(winner) == name_tokens(row["player1_name"]),
    )
    print(f"{rec['category']}/{rec['group']} #{match_id} TLT {rec['tlt_score']} W={winner}")
    apply_row(conn, match_id, winner, sets, dry)
    if not dry and (row["phase"] or "") != "Grupowa":
        conn.execute("UPDATE matches SET phase = 'Grupowa' WHERE id = ?", (match_id,))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dump", default=str(DUMP))
    parser.add_argument("--sync-all", action="store_true", help="Rewrite every group score from Tournated dump")
    args = parser.parse_args()
    dry = not args.apply
    payload = json.loads(Path(args.dump).read_text(encoding="utf-8"))
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    if args.sync_all or "official" in payload:
        print(f"=== sync official {len(payload.get('official') or [])} ===")
        for rec in payload.get("official") or []:
            sync_official(conn, rec, dry)
        print(f"\n=== unplayed {len(payload.get('unplayed') or [])} ===")
        for rec in payload.get("unplayed") or []:
            for match_id in rec.get("match_ids") or []:
                demote(conn, match_id, "unplayed on tennis.lt", dry)
        print(f"\n=== extras {len(payload.get('extras') or [])} ===")
        for rec in payload.get("extras") or []:
            for item in rec.get("matches") or []:
                match_id = item.get("match_id")
                if match_id:
                    demote(conn, match_id, f"extra vs tennis.lt dup={rec.get('duplicate_of')}", dry)
        if not dry:
            conn.commit()
        print("APPLIED" if not dry else "DRY")
        return

    print(f"=== updates {len(payload['updates'])} ===")
    for rec in payload["updates"]:
        match_id = rec.get("match_id")
        if not match_id:
            print("NO MATCH ID", rec)
            continue
        row = conn.execute(
            "SELECT id, player1_name, player2_name, phase, winner_name FROM matches WHERE id = ?",
            (match_id,),
        ).fetchone()
        if not row:
            print("MISSING ROW", match_id, rec)
            continue
        if is_ko_phase(row["phase"]):
            print("SKIP KO", match_id, row["phase"], rec["tlt_p1"], rec["tlt_p2"])
            continue
        winner = pick_name(row["player1_name"], row["player2_name"], rec["tlt_winner"])
        sets = orient_sets(
            parse_tlt_score(rec["tlt_score"]),
            name_tokens(winner) == name_tokens(row["player1_name"]),
        )
        print(
            f"{rec['category']}/{rec['group']} #{match_id} "
            f"{row['player1_name']} vs {row['player2_name']} "
            f"{row['winner_name']} -> {winner} TLT {rec['tlt_score']}"
        )
        apply_row(conn, match_id, winner, sets, dry)

    print(f"\n=== missing {len(payload['missing'])} ===")
    for rec in payload["missing"]:
        p1, p2 = rec.get("our_p1"), rec.get("our_p2")
        if p1 and p2:
            existing = existing_group_match(conn, p1, p2)
            if existing:
                winner = pick_name(existing["player1_name"], existing["player2_name"], rec["tlt_winner"])
                sets = orient_sets(
                    parse_tlt_score(rec["tlt_score"]),
                    name_tokens(winner) == name_tokens(existing["player1_name"]),
                )
                print(
                    f"{rec['category']} reuse #{existing['id']} phase={existing['phase']!r} "
                    f"{existing['player1_name']} vs {existing['player2_name']} -> {winner}"
                )
                apply_row(conn, existing["id"], winner, sets, dry)
                if not dry and (existing["phase"] or "") != "Grupowa":
                    conn.execute("UPDATE matches SET phase = 'Grupowa' WHERE id = ?", (existing["id"],))
                continue
        insert_missing(conn, rec, dry)

    if not dry:
        conn.commit()
    print("APPLIED" if not dry else "DRY")


if __name__ == "__main__":
    main()
