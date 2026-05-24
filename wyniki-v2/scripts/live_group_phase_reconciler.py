"""Continuously reconcile live mobile match metadata in SQLite."""

from __future__ import annotations

import json
import os
import sqlite3
import time
from datetime import datetime, timedelta, timezone


DB_PATH = os.environ.get("DATABASE_PATH", "/data/wyniki.sqlite3")
POLL_SECONDS = int(os.environ.get("GROUP_RECONCILER_POLL_SECONDS", "15"))
LOOKBACK_HOURS = int(os.environ.get("GROUP_RECONCILER_LOOKBACK_HOURS", "12"))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _surname(value: str | None) -> str:
    normalized = _normalize(value)
    if not normalized:
        return ""
    return normalized.split()[-1]


def _pair_key(player1_name: str | None, player2_name: str | None) -> tuple[str, str]:
    return tuple(sorted((_surname(player1_name), _surname(player2_name))))


def _active_tournament(cursor: sqlite3.Cursor) -> sqlite3.Row | None:
    cursor.execute(
        "SELECT id, name FROM tournaments WHERE active = 1 ORDER BY id DESC LIMIT 1"
    )
    return cursor.fetchone()


def _regular_score_arrays(sets_history_text: str | None) -> tuple[list[int], list[int], str | None]:
    if not sets_history_text:
        return [], [], None
    try:
        sets_history = json.loads(sets_history_text)
    except Exception:
        return [], [], None

    regular_sets = [set_info for set_info in sets_history if not set_info.get("is_super_tiebreak")]
    score_a = [int(set_info.get("player1_games", 0)) for set_info in regular_sets]
    score_b = [int(set_info.get("player2_games", 0)) for set_info in regular_sets]
    return score_a, score_b, json.dumps(sets_history, ensure_ascii=False)


def _reconcile_group_phase(cursor: sqlite3.Cursor, tournament_id: int, lookback: str, day_date: str) -> int:
    schedule_rows = cursor.execute(
        """
        SELECT id, court_id, player1_name, player2_name, bracket_group_id, phase, match_id
        FROM tournament_schedule
        WHERE tournament_id = ?
          AND day_date = ?
          AND COALESCE(phase, '') = 'Grupowa'
        ORDER BY court_id, scheduled_time, sort_order, id
        """,
        (tournament_id, day_date),
    ).fetchall()

    schedule_by_key: dict[tuple[str, tuple[str, str]], list[dict[str, object]]] = {}
    for row in schedule_rows:
        key = (str(row["court_id"] or "").strip(), _pair_key(row["player1_name"], row["player2_name"]))
        schedule_by_key.setdefault(key, []).append(dict(row))

    match_rows = cursor.execute(
        """
        SELECT id, court_id, player1_name, player2_name, status, phase, bracket_group_id
        FROM matches
        WHERE tournament_id = ?
          AND created_at >= ?
        ORDER BY id DESC
        """,
        (tournament_id, lookback),
    ).fetchall()
    matches_by_id = {int(row["id"]): dict(row) for row in match_rows}

    matches = [
        row for row in match_rows
        if not (row["phase"] or "").strip() or row["bracket_group_id"] is None
    ]

    updated = 0
    now = _utc_now_iso()
    for match in matches:
        key = (str(match["court_id"] or "").strip(), _pair_key(match["player1_name"], match["player2_name"]))
        candidates = []
        for row in schedule_by_key.get(key, []):
            linked_match_id = row.get("match_id")
            if linked_match_id in (None, int(match["id"])):
                candidates.append(row)
                continue

            linked_match = matches_by_id.get(int(linked_match_id))
            if not linked_match:
                continue

            same_pair = (
                str(linked_match.get("court_id") or "").strip() == key[0]
                and _pair_key(linked_match.get("player1_name"), linked_match.get("player2_name")) == key[1]
            )
            new_match_finished = (match["status"] or "").strip() == "finished"
            linked_match_finished = (linked_match.get("status") or "").strip() == "finished"
            if same_pair and new_match_finished and not linked_match_finished:
                candidates.append(row)
        if len(candidates) != 1:
            continue

        slot = candidates[0]
        schedule_status = "completed" if (match["status"] or "").strip() == "finished" else "in_progress"
        cursor.execute(
            """
            UPDATE matches
            SET bracket_group_id = COALESCE(bracket_group_id, ?),
                phase = CASE
                    WHEN TRIM(COALESCE(phase, '')) = '' THEN ?
                    ELSE phase
                END,
                updated_at = ?
            WHERE id = ?
            """,
            (slot["bracket_group_id"], slot["phase"] or "Grupowa", now, int(match["id"])),
        )
        cursor.execute(
            """
            UPDATE tournament_schedule
            SET match_id = ?,
                status = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (int(match["id"]), schedule_status, now, int(slot["id"])),
        )
        slot["match_id"] = int(match["id"])
        updated += 1
    return updated


def _reconcile_history_scores(cursor: sqlite3.Cursor, tournament_id: int, lookback: str) -> int:
    rows = cursor.execute(
        """
        SELECT mh.id, mh.score_a, mh.score_b, mh.sets_history, m.sets_history AS match_sets_history
        FROM match_history mh
        JOIN matches m ON m.id = mh.match_id
        WHERE mh.tournament_id = ?
          AND mh.ended_ts >= ?
          AND m.status = 'finished'
          AND COALESCE(m.sets_history, '') != ''
        ORDER BY mh.id DESC
        """,
        (tournament_id, lookback),
    ).fetchall()

    updated = 0
    for row in rows:
        score_a, score_b, normalized_sets_history = _regular_score_arrays(row["match_sets_history"])
        if not score_a and not score_b:
            continue
        desired_score_a = json.dumps(score_a, ensure_ascii=False)
        desired_score_b = json.dumps(score_b, ensure_ascii=False)
        if (
            (row["score_a"] or "") == desired_score_a
            and (row["score_b"] or "") == desired_score_b
            and (row["sets_history"] or "") == (normalized_sets_history or "")
        ):
            continue

        cursor.execute(
            """
            UPDATE match_history
            SET score_a = ?, score_b = ?, sets_history = ?
            WHERE id = ?
            """,
            (desired_score_a, desired_score_b, normalized_sets_history, int(row["id"])),
        )
        updated += 1
    return updated


def reconcile_once() -> int:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        tournament = _active_tournament(cursor)
        if not tournament:
            return 0

        day_date = datetime.now(timezone.utc).date().isoformat()
        lookback = (datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).isoformat()
        updated = 0
        updated += _reconcile_group_phase(cursor, int(tournament["id"]), lookback, day_date)
        updated += _reconcile_history_scores(cursor, int(tournament["id"]), lookback)

        if updated:
            conn.commit()
        return updated


def main() -> None:
    print(f"live_group_phase_reconciler starting db={DB_PATH} poll={POLL_SECONDS}s", flush=True)
    while True:
        try:
            updated = reconcile_once()
            if updated:
                print(f"{_utc_now_iso()} updated={updated}", flush=True)
        except Exception as exc:  # pragma: no cover - operational logging only
            print(f"{_utc_now_iso()} error={exc}", flush=True)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()