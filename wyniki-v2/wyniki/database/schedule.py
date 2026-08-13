"""Database access layer submodule."""
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional
from werkzeug.security import generate_password_hash

from ..config import settings, logger
from ..services.teams import PLAY_FORMAT_KNOCKOUT, normalize_play_format

from .connection import _utc_now, db_conn, fetch_app_settings, upsert_app_settings

DEFAULT_GROUP_SCHEDULE_NOTE_PL = "Godzina orientacyjna zostanie podana przez biuro zawodow"

DEFAULT_KNOCKOUT_SCHEDULE_NOTE_PL = "Mecz fazy pucharowej - godzina do potwierdzenia"

DEFAULT_GROUP_SCHEDULE_NOTE_DE = "Orientierungszeit wird vom Turnierbüro bekannt gegeben"

DEFAULT_KNOCKOUT_SCHEDULE_NOTE_DE = "Pokalspiel – Uhrzeit noch zu bestätigen"

def _tournament_country_code(tournament_id: int) -> str:
    try:
        with db_conn() as conn:
            row = conn.execute(
                "SELECT UPPER(COALESCE(country, '')) AS country FROM tournaments WHERE id = ?",
                (tournament_id,),
            ).fetchone()
            return str(row["country"] if row else "")
    except Exception:
        return ""

def _default_group_schedule_note(tournament_id: int) -> str:
    if _tournament_country_code(tournament_id) == "DE":
        return DEFAULT_GROUP_SCHEDULE_NOTE_DE
    return DEFAULT_GROUP_SCHEDULE_NOTE_PL

def _default_knockout_schedule_note(tournament_id: int) -> str:
    if _tournament_country_code(tournament_id) == "DE":
        return DEFAULT_KNOCKOUT_SCHEDULE_NOTE_DE
    return DEFAULT_KNOCKOUT_SCHEDULE_NOTE_PL

def ensure_group_rematch_schedule_entries(
    tournament_id: int,
    bracket_group_ids: List[int],
    *,
    schedule_day: Optional[str] = None,
) -> Dict[str, Any]:
    """Add a second round-robin (everyone vs everyone) for selected groups."""
    groups = fetch_bracket_groups(tournament_id)
    group_by_id = {int(group["id"]): group for group in groups if group.get("id")}
    requested = [int(group_id) for group_id in bracket_group_ids if group_id]
    if not requested:
        return {"status": "error", "error": "no_groups_selected"}

    inserted = 0
    skipped: List[Dict[str, Any]] = []
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            default_day = (
                str(schedule_day).strip()
                if schedule_day
                else _schedule_day_for_tournament(cursor, tournament_id)
            )
            now = _utc_now()
            cursor.execute(
                "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tournament_schedule WHERE tournament_id = ?",
                (tournament_id,),
            )
            next_order = int(cursor.fetchone()["max_order"] or 0) + 1

            for group_id in requested:
                group = group_by_id.get(group_id)
                if not group:
                    skipped.append({"group_id": group_id, "reason": "not_found"})
                    continue
                if normalize_play_format(group.get("play_format")) == PLAY_FORMAT_KNOCKOUT:
                    skipped.append({"group_id": group_id, "reason": "knockout_format"})
                    continue

                cursor.execute(
                    """
                    SELECT id FROM tournament_schedule
                    WHERE tournament_id = ? AND bracket_group_id = ? AND phase = ?
                    LIMIT 1
                    """,
                    (tournament_id, group_id, GROUP_REMATCH_PHASE),
                )
                if cursor.fetchone():
                    skipped.append({"group_id": group_id, "reason": "rematch_exists"})
                    continue

                before_order = next_order
                next_order = _insert_group_round_robin_schedule_entries(
                    cursor,
                    tournament_id,
                    group,
                    phase=GROUP_REMATCH_PHASE,
                    source_type="group_rematch",
                    default_day=default_day,
                    start_order=next_order,
                    now=now,
                )
                inserted += max(next_order - before_order, 0)

            conn.commit()
        return {
            "status": "ok",
            "inserted": inserted,
            "skipped": skipped,
            "schedule": fetch_tournament_schedule(tournament_id),
        }
    except Exception as e:
        logger.error("ensure_group_rematch_schedule_error", error=str(e), tournament_id=tournament_id)
        return {"status": "error", "error": str(e)}

def _schedule_day_for_tournament(cursor: sqlite3.Cursor, tournament_id: int) -> str:
    cursor.execute("SELECT start_date FROM tournaments WHERE id = ?", (tournament_id,))
    row = cursor.fetchone()
    return str(row["start_date"] if row and row["start_date"] else datetime.now(timezone.utc).date().isoformat())

def _knockout_schedule_day_for_tournament(cursor: sqlite3.Cursor, tournament_id: int) -> str:
    """Prefer tournament end_date for knockout schedule entries when it differs from start_date."""
    cursor.execute("SELECT start_date, end_date FROM tournaments WHERE id = ?", (tournament_id,))
    row = cursor.fetchone()
    start = str(row["start_date"] or "") if row else ""
    end = str(row["end_date"] or "") if row else ""
    if end and end != start:
        return end
    return start or datetime.now(timezone.utc).date().isoformat()

def _autoschedule_phases_include_knockout(phases: Optional[List[str]]) -> bool:
    if not phases:
        return True
    wanted = {str(phase).strip().lower() for phase in phases}
    return bool({"knockout", "pucharowa", "knockouts", "all", "wszystko"} & wanted)

def _schedule_pair_clause(player1_name: str, player2_name: str) -> tuple[str, tuple[str, str, str, str]]:
    return (
        "((player1_name = ? AND player2_name = ?) OR (player1_name = ? AND player2_name = ?))",
        (player1_name, player2_name, player2_name, player1_name),
    )

def _schedule_entry_is_assigned(court_id: Any, scheduled_time: Any) -> bool:
    return bool(str(court_id or "").strip() and str(scheduled_time or "").strip())

def _schedule_entry_is_unplaced(
    *,
    court_id: Any,
    scheduled_time: Any,
    match_id: Any = None,
    status: Any = None,
) -> bool:
    """True when a schedule row still belongs in the unassigned pool."""
    if match_id not in (None, "", 0):
        return False
    if str(status or "").strip().lower() == "completed":
        return False
    return not _schedule_entry_is_assigned(court_id, scheduled_time)

def _schedule_entry_priority(row: sqlite3.Row | Dict[str, Any]) -> tuple[int, int, int, int]:
    """Higher tuple values mean the row should be kept over duplicates."""
    has_match = row["match_id"] not in (None, "", 0) if isinstance(row, dict) else row["match_id"] is not None
    assigned = _schedule_entry_is_assigned(row["court_id"], row["scheduled_time"])
    has_group = row["bracket_group_id"] not in (None, "", 0) if isinstance(row, dict) else row["bracket_group_id"] is not None
    row_id = int(row["id"] or 0)
    return (
        1 if has_match else 0,
        1 if assigned else 0,
        1 if has_group else 0,
        -row_id,
    )

def _prune_duplicate_schedule_entries(cursor: sqlite3.Cursor, tournament_id: int) -> int:
    """Drop redundant unassigned rows when another row exists for the same pair and phase."""
    cursor.execute(
        """
        SELECT id, phase, player1_name, player2_name, court_id, scheduled_time,
               match_id, bracket_group_id, status
        FROM tournament_schedule
        WHERE tournament_id = ?
        ORDER BY id
        """,
        (tournament_id,),
    )
    rows = [dict(row) for row in cursor.fetchall()]
    grouped: Dict[tuple[str, tuple[str, str]], List[Dict[str, Any]]] = {}
    for row in rows:
        players = sorted(
            [str(row["player1_name"] or "").strip(), str(row["player2_name"] or "").strip()],
            key=str.casefold,
        )
        if not players[0] or not players[1]:
            continue
        key = (str(row["phase"] or "").strip().casefold(), tuple(players))
        grouped.setdefault(key, []).append(row)

    deleted = 0
    for entries in grouped.values():
        if len(entries) <= 1:
            continue
        keeper = max(entries, key=_schedule_entry_priority)
        for entry in entries:
            if int(entry["id"]) == int(keeper["id"]):
                continue
            if not _schedule_entry_is_unplaced(
                court_id=entry["court_id"],
                scheduled_time=entry["scheduled_time"],
                match_id=entry["match_id"],
                status=entry["status"],
            ):
                continue
            cursor.execute(
                "DELETE FROM tournament_schedule WHERE id = ? AND tournament_id = ?",
                (entry["id"], tournament_id),
            )
            deleted += int(cursor.rowcount or 0)
    return deleted

def _format_score_text(sets_history_raw: Any) -> str:
    """Build a compact score string (e.g. '4:2 4:1 STB 10:7') from a sets_history JSON."""
    if not sets_history_raw:
        return ""
    try:
        sets_history = json.loads(sets_history_raw) if isinstance(sets_history_raw, str) else sets_history_raw
    except (ValueError, TypeError):
        return ""
    if not isinstance(sets_history, list):
        return ""
    parts: List[str] = []
    for set_score in sets_history:
        if not isinstance(set_score, dict):
            continue
        p1 = set_score.get("player1_games", 0)
        p2 = set_score.get("player2_games", 0)
        if set_score.get("is_super_tiebreak"):
            parts.append(f"STB {p1}:{p2}")
        else:
            tb = set_score.get("tiebreak_loser_points")
            parts.append(f"{p1}:{p2}" + (f"({tb})" if tb is not None else ""))
    return " ".join(parts)

def _schedule_match_result(data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract a public-friendly result for a schedule row joined with its match."""
    has_match = data.get("match_id") not in (None, "", 0)
    sets_history_raw = data.get("match_sets_history")
    score_text = _format_score_text(sets_history_raw)
    return {
        "match_status": data.get("match_status") or "",
        "winner_name": data.get("match_winner_name") or "",
        "result_note": data.get("match_result_note") or "",
        "finish_reason": data.get("match_finish_reason") or "",
        "player1_sets": int(data.get("match_player1_sets") or 0) if has_match else None,
        "player2_sets": int(data.get("match_player2_sets") or 0) if has_match else None,
        "score_text": score_text,
        "has_result": bool(has_match and (score_text or data.get("match_winner_name") or data.get("match_status") == "finished")),
    }

def _schedule_row_payload(row: sqlite3.Row | Dict[str, Any], *, public: bool = False) -> Dict[str, Any]:
    data = dict(row)
    payload = {
        "id": data.get("id"),
        "tournament_id": data.get("tournament_id"),
        "day_date": data.get("day_date") or "",
        "scheduled_time": data.get("scheduled_time") or "",
        "court_id": data.get("court_id") or "",
        "court_label": data.get("court_label") or data.get("court_name") or data.get("court_id") or "",
        "category_name": data.get("category_name") or "",
        "bracket_group_id": data.get("bracket_group_id"),
        "group_name": data.get("group_name") or "",
        "phase": data.get("phase") or "",
        "player1_name": data.get("player1_name") or "",
        "player2_name": data.get("player2_name") or "",
        "status": data.get("status") or "draft",
        "source_type": data.get("source_type") or "manual",
        "source_ref_id": data.get("source_ref_id"),
        "match_id": data.get("match_id"),
        "sort_order": int(data.get("sort_order") or 0),
        "court_display_order": int(data.get("court_display_order") or 9999),
        "notes_public": data.get("notes_public") or "",
        "created_at": data.get("created_at") or "",
        "updated_at": data.get("updated_at") or "",
    }
    payload.update(_schedule_match_result(data))
    if not public:
        payload["notes_internal"] = data.get("notes_internal") or ""
    return payload

def fetch_tournament_schedule(tournament_id: int, *, public_only: bool = False) -> List[Dict[str, Any]]:
    """Return flat tournament schedule entries sorted by day, time, court and order."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            status_clause = "AND ts.status != 'draft'" if public_only else ""
            cursor.execute(
                f"""
                SELECT ts.*, c.name AS court_name, COALESCE(c.display_order, 9999) AS court_display_order,
                       m.status AS match_status, m.winner_name AS match_winner_name,
                       m.result_note AS match_result_note, m.finish_reason AS match_finish_reason,
                       m.player1_sets AS match_player1_sets, m.player2_sets AS match_player2_sets,
                       m.sets_history AS match_sets_history
                FROM tournament_schedule ts
                LEFT JOIN courts c ON c.kort_id = ts.court_id
                LEFT JOIN matches m ON m.id = ts.match_id
                WHERE ts.tournament_id = ? {status_clause}
                ORDER BY ts.day_date, COALESCE(NULLIF(ts.scheduled_time, ''), '99:99'),
                         COALESCE(c.display_order, 9999), ts.sort_order, ts.id
                """,
                (tournament_id,),
            )
            return [_schedule_row_payload(row, public=public_only) for row in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_tournament_schedule_error", error=str(e), tournament_id=tournament_id)
        return []

def _parse_schedule_reference_datetime(value: Optional[str] = None) -> datetime:
    if value:
        normalized = str(value).strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).replace(tzinfo=None)
        except ValueError:
            pass
    return datetime.now().replace(tzinfo=None)

def find_suggested_schedule_match(
    tournament_id: int,
    court_id: str,
    *,
    reference_time: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return the nearest unlinked schedule entry for a court and reference time."""
    if not tournament_id or not court_id:
        return None
    reference = _parse_schedule_reference_datetime(reference_time)
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT ts.*, c.name AS court_name, COALESCE(c.display_order, 9999) AS court_display_order
                FROM tournament_schedule ts
                LEFT JOIN courts c ON c.kort_id = ts.court_id
                WHERE ts.tournament_id = ?
                  AND ts.court_id = ?
                  AND (ts.match_id IS NULL OR ts.match_id = '')
                  AND COALESCE(ts.status, 'planned') != 'completed'
                  AND COALESCE(ts.day_date, '') != ''
                  AND COALESCE(ts.scheduled_time, '') != ''
                  AND COALESCE(ts.player1_name, '') != ''
                  AND COALESCE(ts.player2_name, '') != ''
                """,
                (tournament_id, court_id),
            )
            candidates = []
            for row in cursor.fetchall():
                entry = _schedule_row_payload(row, public=False)
                try:
                    scheduled_at = datetime.fromisoformat(f"{entry['day_date']}T{entry['scheduled_time']}:00")
                except ValueError:
                    continue
                diff_seconds = abs((scheduled_at - reference).total_seconds())
                future_first = 0 if scheduled_at >= reference else 1
                candidates.append((diff_seconds, future_first, entry.get("sort_order") or 0, entry.get("id") or 0, entry))
            if not candidates:
                return None
            candidates.sort(key=lambda item: (item[0], item[1], item[2], item[3]))
            return candidates[0][4]
    except Exception as e:
        logger.error("find_suggested_schedule_match_error", error=str(e), tournament_id=tournament_id, court_id=court_id)
        return None

def build_public_schedule_payload(tournament_id: int) -> Dict[str, Any]:
    """Return schedule grouped by day and category for the public UI."""
    tournament = fetch_tournament(tournament_id) or {}
    entries = fetch_tournament_schedule(tournament_id, public_only=True)
    days: Dict[str, Dict[str, Any]] = {}
    for entry in entries:
        day_date = entry.get("day_date") or ""
        day = days.setdefault(day_date, {"date": day_date, "categories": {}})
        category_name = entry.get("category_name") or entry.get("group_name") or "Kategoria do ustalenia"
        category = day["categories"].setdefault(
            category_name,
            {
                "name": category_name,
                "matches": [],
            },
        )
        category["matches"].append(entry)

    grouped_days = []
    for day in days.values():
        categories = list(day["categories"].values())
        for category in categories:
            category["matches"].sort(
                key=lambda item: (
                    item.get("scheduled_time") or "99:99",
                    item.get("sort_order") or 0,
                    item.get("id") or 0,
                )
            )
        categories.sort(
            key=lambda item: (
                str(item.get("name") or "").casefold(),
            )
        )
        grouped_days.append(
            {
                "date": day["date"],
                "categories": [
                    {"name": category["name"], "matches": category["matches"]}
                    for category in categories
                ],
            }
        )
    grouped_days.sort(key=lambda item: item["date"])

    return {
        "tournament": {
            "id": tournament.get("id") or tournament_id,
            "name": tournament.get("name") or "",
            "start_date": tournament.get("start_date") or "",
            "end_date": tournament.get("end_date") or "",
        },
        "days": grouped_days,
    }

def _coerce_schedule_entry(tournament_id: int, data: Dict[str, Any], default_order: int = 0) -> Dict[str, Any]:
    return {
        "tournament_id": tournament_id,
        "day_date": str(data.get("day_date") or data.get("date") or "").strip(),
        "scheduled_time": str(data.get("scheduled_time") or data.get("time") or "").strip(),
        "court_id": str(data.get("court_id") or "").strip(),
        "court_label": str(data.get("court_label") or "").strip(),
        "category_name": str(data.get("category_name") or data.get("category") or "").strip(),
        "bracket_group_id": data.get("bracket_group_id"),
        "group_name": str(data.get("group_name") or "").strip(),
        "phase": str(data.get("phase") or "Grupowa").strip(),
        "player1_name": str(data.get("player1_name") or data.get("player_a") or "").strip(),
        "player2_name": str(data.get("player2_name") or data.get("player_b") or "").strip(),
        "status": str(data.get("status") or "draft").strip(),
        "source_type": str(data.get("source_type") or "manual").strip(),
        "source_ref_id": data.get("source_ref_id"),
        "match_id": data.get("match_id"),
        "sort_order": int(data.get("sort_order") or default_order),
        "notes_public": str(data.get("notes_public") or "").strip(),
        "notes_internal": str(data.get("notes_internal") or "").strip(),
    }

def upsert_tournament_schedule_entries(tournament_id: int, entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Create or update schedule entries and return the refreshed schedule."""
    if not entries:
        return fetch_tournament_schedule(tournament_id)
    with db_conn() as conn:
        cursor = conn.cursor()
        default_day = _schedule_day_for_tournament(cursor, tournament_id)
        now = _utc_now()
        for index, raw_entry in enumerate(entries):
            entry = _coerce_schedule_entry(tournament_id, raw_entry, default_order=index)
            if not entry["day_date"]:
                entry["day_date"] = default_day
            if not entry["player1_name"] or not entry["player2_name"]:
                raise ValueError("Two player names are required for schedule entry")
            schedule_id = raw_entry.get("id")
            values = (
                entry["day_date"], entry["scheduled_time"], entry["court_id"], entry["court_label"],
                entry["category_name"], entry["bracket_group_id"], entry["group_name"], entry["phase"],
                entry["player1_name"], entry["player2_name"], entry["status"], entry["source_type"],
                entry["source_ref_id"], entry["match_id"], entry["sort_order"], entry["notes_public"],
                entry["notes_internal"], now,
            )
            if schedule_id:
                cursor.execute(
                    """
                    UPDATE tournament_schedule
                    SET day_date = ?, scheduled_time = ?, court_id = ?, court_label = ?, category_name = ?,
                        bracket_group_id = ?, group_name = ?, phase = ?, player1_name = ?, player2_name = ?,
                        status = ?, source_type = ?, source_ref_id = ?, match_id = ?, sort_order = ?,
                        notes_public = ?, notes_internal = ?, updated_at = ?
                    WHERE id = ? AND tournament_id = ?
                    """,
                    (*values, schedule_id, tournament_id),
                )
            else:
                pair_clause, pair_params = _schedule_pair_clause(entry["player1_name"], entry["player2_name"])
                cursor.execute(
                    f"""
                    SELECT id FROM tournament_schedule
                    WHERE tournament_id = ? AND phase = ? AND {pair_clause}
                    ORDER BY id
                    LIMIT 1
                    """,
                    (tournament_id, entry["phase"], *pair_params),
                )
                existing = cursor.fetchone()
                if existing:
                    schedule_id = int(existing["id"])
                    cursor.execute(
                        """
                        UPDATE tournament_schedule
                        SET day_date = ?, scheduled_time = ?, court_id = ?, court_label = ?, category_name = ?,
                            bracket_group_id = COALESCE(?, bracket_group_id), group_name = CASE
                                WHEN COALESCE(?, '') != '' THEN ? ELSE group_name END,
                            phase = ?, player1_name = ?, player2_name = ?,
                            status = ?, source_type = ?, source_ref_id = ?, match_id = COALESCE(?, match_id),
                            sort_order = ?, notes_public = ?, notes_internal = ?, updated_at = ?
                        WHERE id = ? AND tournament_id = ?
                        """,
                        (
                            entry["day_date"], entry["scheduled_time"], entry["court_id"], entry["court_label"],
                            entry["category_name"], entry["bracket_group_id"], entry["group_name"], entry["group_name"],
                            entry["phase"], entry["player1_name"], entry["player2_name"], entry["status"],
                            entry["source_type"], entry["source_ref_id"], entry["match_id"], entry["sort_order"],
                            entry["notes_public"], entry["notes_internal"], now, schedule_id, tournament_id,
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO tournament_schedule (
                            tournament_id, day_date, scheduled_time, court_id, court_label, category_name,
                            bracket_group_id, group_name, phase, player1_name, player2_name, status, source_type,
                            source_ref_id, match_id, sort_order, notes_public, notes_internal, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (tournament_id, *values[:-1], now, now),
                    )
        conn.commit()
        cursor = conn.cursor()
        _prune_duplicate_schedule_entries(cursor, tournament_id)
        conn.commit()
    return fetch_tournament_schedule(tournament_id)

def update_tournament_schedule_entry(tournament_id: int, schedule_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Patch one schedule entry."""
    allowed_fields = {
        "day_date", "scheduled_time", "court_id", "court_label", "category_name", "bracket_group_id",
        "group_name", "phase", "player1_name", "player2_name", "status", "source_type", "source_ref_id",
        "match_id", "sort_order", "notes_public", "notes_internal",
    }
    updates = {key: value for key, value in data.items() if key in allowed_fields}
    if not updates:
        return next((entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(schedule_id)), None)
    if "sort_order" in updates:
        updates["sort_order"] = int(updates.get("sort_order") or 0)
    updates["updated_at"] = _utc_now()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            assignments = ", ".join(f"{key} = ?" for key in updates)
            cursor.execute(
                f"UPDATE tournament_schedule SET {assignments} WHERE id = ? AND tournament_id = ?",
                [*updates.values(), schedule_id, tournament_id],
            )
            conn.commit()
            if cursor.rowcount == 0:
                return None
        return next((entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(schedule_id)), None)
    except Exception as e:
        logger.error("update_tournament_schedule_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
        return None

def delete_tournament_schedule_entry(tournament_id: int, schedule_id: int) -> bool:
    """Delete one schedule entry."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tournament_schedule WHERE id = ? AND tournament_id = ?", (schedule_id, tournament_id))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("delete_tournament_schedule_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
        return False

def publish_tournament_schedule(tournament_id: int, day_date: Optional[str] = None) -> int:
    """Promote all draft schedule entries to 'planned' (published). Returns updated count."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            params: List[Any] = [_utc_now(), tournament_id]
            query = "UPDATE tournament_schedule SET status = 'planned', updated_at = ? WHERE tournament_id = ? AND status = 'draft'"
            if day_date:
                query += " AND day_date = ?"
                params.append(day_date)
            cursor.execute(query, params)
            conn.commit()
            return int(cursor.rowcount or 0)
    except Exception as e:
        logger.error("publish_tournament_schedule_error", error=str(e), tournament_id=tournament_id)
        return 0

def _insert_group_round_robin_schedule_entries(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    group: Dict[str, Any],
    *,
    phase: str,
    source_type: str,
    default_day: str,
    start_order: int,
    now: str,
) -> int:
    """Insert missing round-robin schedule rows for one group and return next sort order."""
    group_id = int(group["id"])
    group_name = group.get("name") or ""
    category_name, _ = _split_bracket_label(group_name)
    players = group.get("players") or []
    next_order = start_order
    for left_index, player1 in enumerate(players):
        for player2 in players[left_index + 1:]:
            player1_name = player1.get("name") or ""
            player2_name = player2.get("name") or ""
            if not player1_name or not player2_name:
                continue
            pair_clause, pair_params = _schedule_pair_clause(player1_name, player2_name)
            cursor.execute(
                f"""
                SELECT id FROM tournament_schedule
                WHERE tournament_id = ? AND phase = ? AND {pair_clause}
                """,
                (tournament_id, phase, *pair_params),
            )
            if cursor.fetchone():
                continue
            cursor.execute(
                """
                INSERT INTO tournament_schedule (
                    tournament_id, day_date, category_name, bracket_group_id, group_name, phase,
                    player1_name, player2_name, status, source_type, source_ref_id, sort_order,
                    notes_public, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
                """,
                (
                    tournament_id, default_day, category_name or group_name, group_id, group_name, phase,
                    player1_name, player2_name, source_type, group_id, next_order,
                    _default_group_schedule_note(tournament_id), now, now,
                ),
            )
            next_order += 1
    return next_order

def ensure_group_schedule_entries(tournament_id: int) -> List[Dict[str, Any]]:
    """Ensure every configured group round-robin pair has a schedule slot."""
    groups = fetch_bracket_groups(tournament_id)
    if not groups:
        return fetch_tournament_schedule(tournament_id)
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            default_day = _schedule_day_for_tournament(cursor, tournament_id)
            now = _utc_now()
            cursor.execute("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tournament_schedule WHERE tournament_id = ?", (tournament_id,))
            next_order = int(cursor.fetchone()["max_order"] or 0) + 1
            for group in groups:
                if normalize_play_format(group.get("play_format")) == PLAY_FORMAT_KNOCKOUT:
                    continue
                next_order = _insert_group_round_robin_schedule_entries(
                    cursor,
                    tournament_id,
                    group,
                    phase=GROUP_PHASE,
                    source_type="group",
                    default_day=default_day,
                    start_order=next_order,
                    now=now,
                )
            _prune_duplicate_schedule_entries(cursor, tournament_id)
            conn.commit()
        return fetch_tournament_schedule(tournament_id)
    except Exception as e:
        logger.error("ensure_group_schedule_error", error=str(e), tournament_id=tournament_id)
        return fetch_tournament_schedule(tournament_id)

def ensure_knockout_schedule_entries(
    tournament_id: int,
    *,
    schedule_day: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Ensure every relevant knockout slot has a schedule entry for office assignment."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            default_day = (
                str(schedule_day).strip()
                if schedule_day
                else _knockout_schedule_day_for_tournament(cursor, tournament_id)
            )
            now = _utc_now()
            cursor.execute("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tournament_schedule WHERE tournament_id = ?", (tournament_id,))
            next_order = int(cursor.fetchone()["max_order"] or 0) + 1
            cursor.execute(
                """
                SELECT id, phase, position, player1_name, player2_name, winner_name
                FROM bracket_knockout
                WHERE tournament_id = ?
                ORDER BY phase, position
                """,
                (tournament_id,),
            )
            for slot in cursor.fetchall():
                player1_name, player2_name = _knockout_schedule_player_names(slot)
                if not player1_name or not player2_name:
                    continue
                category_name, phase_suffix = _split_bracket_label(slot["phase"])
                phase_label = slot["phase"] or phase_suffix or "Pucharowa"
                cursor.execute(
                    """
                    SELECT id, status, match_id, scheduled_time, court_id, court_label
                    FROM tournament_schedule
                    WHERE tournament_id = ? AND source_type = 'knockout' AND source_ref_id = ?
                    """,
                    (tournament_id, slot["id"]),
                )
                existing = cursor.fetchone()
                status = "completed" if slot["winner_name"] else "draft"
                if existing:
                    corrected_status: Optional[str] = None
                    if slot["winner_name"]:
                        corrected_status = "completed"
                    elif existing["status"] == "completed" and not existing["match_id"]:
                        corrected_status = "planned" if (
                            (existing["scheduled_time"] or "").strip()
                            or (existing["court_id"] or "").strip()
                            or (existing["court_label"] or "").strip()
                        ) else "draft"
                    cursor.execute(
                        """
                        UPDATE tournament_schedule
                        SET category_name = ?, phase = ?, player1_name = ?, player2_name = ?,
                            status = CASE
                                WHEN ? IS NOT NULL THEN ?
                                WHEN ? = 'completed' THEN 'completed'
                                ELSE status
                            END,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            category_name or phase_label,
                            phase_label,
                            player1_name,
                            player2_name,
                            corrected_status,
                            corrected_status,
                            status,
                            now,
                            existing["id"],
                        ),
                    )
                    continue
                cursor.execute(
                    """
                    INSERT INTO tournament_schedule (
                        tournament_id, day_date, category_name, phase, player1_name, player2_name,
                        status, source_type, source_ref_id, sort_order, notes_public, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'knockout', ?, ?, ?, ?, ?)
                    """,
                    (
                        tournament_id, default_day, category_name or phase_label, phase_label,
                        player1_name, player2_name, status, slot["id"], next_order,
                        _default_knockout_schedule_note(tournament_id), now, now,
                    ),
                )
                next_order += 1
            conn.commit()
        return fetch_tournament_schedule(tournament_id)
    except Exception as e:
        logger.error("ensure_knockout_schedule_error", error=str(e), tournament_id=tournament_id)
        return fetch_tournament_schedule(tournament_id)

def link_schedule_to_match(
    tournament_id: int,
    match_id: int,
    *,
    schedule_id: Optional[int] = None,
    player1_name: str,
    player2_name: str,
    phase: Optional[str] = None,
    bracket_group_id: Optional[int] = None,
    status: str = "completed",
) -> Optional[Dict[str, Any]]:
    """Link a planned schedule slot to the real match row."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if schedule_id:
                cursor.execute(
                    """
                    SELECT id FROM tournament_schedule
                    WHERE id = ? AND tournament_id = ? AND (match_id IS NULL OR match_id = ?)
                    LIMIT 1
                    """,
                    (schedule_id, tournament_id, match_id),
                )
                row = cursor.fetchone()
                if not row:
                    return None
                cursor.execute(
                    "UPDATE tournament_schedule SET match_id = ?, status = ?, updated_at = ? WHERE id = ?",
                    (match_id, status, _utc_now(), row["id"]),
                )
                conn.commit()
                return next((entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(row["id"])), None)

            pair_clause, pair_params = _schedule_pair_clause(player1_name, player2_name)
            params: List[Any] = [tournament_id, *pair_params]
            filters = ["tournament_id = ?", pair_clause]
            if bracket_group_id:
                filters.append("bracket_group_id = ?")
                params.append(bracket_group_id)
            elif phase:
                filters.append("phase = ?")
                params.append(phase)
            filters.append("(match_id IS NULL OR match_id = ?)")
            params.append(match_id)
            cursor.execute(
                f"""
                SELECT id FROM tournament_schedule
                WHERE {' AND '.join(filters)}
                ORDER BY
                    CASE
                        WHEN COALESCE(court_id, '') != '' AND COALESCE(scheduled_time, '') != '' THEN 0
                        ELSE 1
                    END,
                    CASE WHEN match_id IS NULL THEN 0 ELSE 1 END,
                    id
                LIMIT 1
                """,
                params,
            )
            row = cursor.fetchone()
            if not row:
                return None
            cursor.execute(
                "UPDATE tournament_schedule SET match_id = ?, status = ?, updated_at = ? WHERE id = ?",
                (match_id, status, _utc_now(), row["id"]),
            )
            _prune_duplicate_schedule_entries(cursor, tournament_id)
            conn.commit()
            schedule_id = row["id"]
        return next((entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(schedule_id)), None)
    except Exception as e:
        logger.error("link_schedule_to_match_error", error=str(e), tournament_id=tournament_id, match_id=match_id)
        return None

def unlink_schedule_from_match(match_id: int, *, fallback_status: str = "planned") -> int:
    """Detach schedule slots from a match that must not count for tournament lifecycle."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE tournament_schedule
                SET match_id = NULL,
                    status = CASE
                        WHEN status IN ('in_progress', 'completed') THEN ?
                        ELSE status
                    END,
                    updated_at = ?
                WHERE match_id = ?
                """,
                (fallback_status, _utc_now(), match_id),
            )
            affected = cursor.rowcount
            conn.commit()
            return affected
    except Exception as e:
        logger.error("unlink_schedule_from_match_error", error=str(e), match_id=match_id)
        return 0

def _autoscheduler_settings_key(tournament_id: int) -> str:
    return f"autoscheduler:{int(tournament_id)}"

def get_autoscheduler_config(tournament_id: int) -> Dict[str, Any]:
    """Return the auto-scheduler config for a tournament, merged over court-based defaults."""
    from ..services import auto_scheduler

    courts = fetch_courts_for_tournament(tournament_id)
    config = auto_scheduler.build_default_config(courts)
    stored = fetch_app_settings([_autoscheduler_settings_key(tournament_id)]).get(
        _autoscheduler_settings_key(tournament_id)
    )
    if stored:
        try:
            saved = json.loads(stored)
            if isinstance(saved, dict):
                config.update({k: v for k, v in saved.items() if v not in (None, "")})
                if isinstance(saved.get("slot_minutes"), dict):
                    merged_slots = dict(config.get("slot_minutes") or {})
                    merged_slots.update(saved["slot_minutes"])
                    config["slot_minutes"] = merged_slots
                if isinstance(saved.get("category_courts"), dict):
                    config["category_courts"] = saved["category_courts"]
                if isinstance(saved.get("b1_court_ids"), list):
                    ids = [str(court_id).strip() for court_id in saved["b1_court_ids"] if str(court_id or "").strip()]
                    if ids:
                        config["b1_court_ids"] = ids
                        config["b1_court_id"] = ids[0]
        except (ValueError, TypeError):
            pass
    if not config.get("b1_court_ids") and config.get("b1_court_id"):
        config["b1_court_ids"] = [str(config["b1_court_id"])]
    return config

def save_autoscheduler_config(tournament_id: int, config: Dict[str, Any]) -> Dict[str, Any]:
    """Persist the auto-scheduler config for a tournament."""
    from ..services import auto_scheduler

    current = get_autoscheduler_config(tournament_id)
    allowed = {"start_time", "b1_court_id", "b1_court_ids", "category_courts", "slot_minutes", "rest_slots"}
    for key in allowed:
        if key in config and config[key] not in (None, ""):
            current[key] = config[key]
    if isinstance(current.get("b1_court_ids"), list):
        ids = [str(court_id).strip() for court_id in current["b1_court_ids"] if str(court_id or "").strip()]
        if ids:
            current = auto_scheduler.apply_b1_courts(current, ids)
        else:
            current["b1_court_ids"] = []
            current["b1_court_id"] = ""
    upsert_app_settings({_autoscheduler_settings_key(tournament_id): json.dumps(current)})
    return current

def _schedule_entry_match_dict(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": entry.get("id"),
        "category_name": entry.get("category_name") or entry.get("group_name") or "",
        "group_name": entry.get("group_name") or "",
        "phase": entry.get("phase") or "",
        "player1_name": entry.get("player1_name") or "",
        "player2_name": entry.get("player2_name") or "",
        "court_id": entry.get("court_id") or "",
        "sort_order": entry.get("sort_order") or 0,
        "source_type": entry.get("source_type") or "",
        "status": entry.get("status") or "draft",
    }

def generate_autoschedule_proposal(
    tournament_id: int,
    *,
    start_time: Optional[str] = None,
    b1_court_id: Optional[str] = None,
    b1_court_ids: Optional[List[str]] = None,
    day_date: Optional[str] = None,
    phases: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Build a (non-persisted) auto-placement proposal for the tournament schedule.

    Returns {config, placements, courts} where each placement carries the schedule entry
    plus the proposed court_id/day_date/scheduled_time.
    """
    from ..services import auto_scheduler

    ensure_group_schedule_entries(tournament_id)

    config = get_autoscheduler_config(tournament_id)
    if start_time:
        config["start_time"] = str(start_time)
    selected_b1_courts = [
        str(court_id).strip()
        for court_id in (b1_court_ids or [])
        if str(court_id or "").strip()
    ]
    if not selected_b1_courts and b1_court_id:
        selected_b1_courts = [str(b1_court_id).strip()]
    if selected_b1_courts:
        config = auto_scheduler.apply_b1_courts(config, selected_b1_courts)
        save_autoscheduler_config(tournament_id, {
            "b1_court_ids": selected_b1_courts,
            "b1_court_id": selected_b1_courts[0],
        })

    with db_conn() as conn:
        cursor = conn.cursor()
        default_day = _schedule_day_for_tournament(cursor, tournament_id)
        knockout_day = _knockout_schedule_day_for_tournament(cursor, tournament_id)
    target_day = day_date or config.get("day_date") or default_day

    if _autoschedule_phases_include_knockout(phases):
        seed_day = target_day if day_date else knockout_day
        seed_provisional_knockout_from_groups(tournament_id, schedule_day=seed_day)
    else:
        ensure_knockout_schedule_entries(tournament_id)

    entries = fetch_tournament_schedule(tournament_id)
    if day_date:
        target_day_str = str(day_date).strip()
        entries = [
            entry
            for entry in entries
            if str(entry.get("day_date") or "").strip() == target_day_str
        ]
    if phases:
        wanted = {str(p).strip().lower() for p in phases}

        def _is_group_entry(entry) -> bool:
            source = str(entry.get("source_type") or "").lower()
            phase = str(entry.get("phase") or "").lower()
            return source == "group" or "grup" in phase

        def _phase_match(entry) -> bool:
            is_group = _is_group_entry(entry)
            if {"group", "grupowa", "groups"} & wanted:
                if is_group:
                    return True
            if {"knockout", "pucharowa", "knockouts"} & wanted:
                if not is_group:
                    return True
            return False

        entries = [entry for entry in entries if _phase_match(entry)]

    matches = [_schedule_entry_match_dict(entry) for entry in entries]
    placements = auto_scheduler.place_matches(matches, config, target_day)

    entry_by_id = {int(entry["id"]): entry for entry in entries if entry.get("id")}
    result_placements = []
    for placement in placements:
        match = placement["match"]
        entry = entry_by_id.get(int(match["id"])) if match.get("id") else None
        result_placements.append(
            {
                "schedule_id": match.get("id"),
                "court_id": placement["court_id"],
                "day_date": placement["day_date"],
                "scheduled_time": placement["scheduled_time"],
                "band": placement["band"],
                "category_name": entry.get("category_name") if entry else match.get("category_name"),
                "phase": entry.get("phase") if entry else match.get("phase"),
                "player1_name": entry.get("player1_name") if entry else match.get("player1_name"),
                "player2_name": entry.get("player2_name") if entry else match.get("player2_name"),
            }
        )
    return {
        "config": config,
        "courts": fetch_courts_for_tournament(tournament_id),
        "placements": result_placements,
    }

def apply_autoschedule_placements(
    tournament_id: int, placements: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Persist court/time/day placements onto schedule entries (publishes them as 'planned')."""
    if not placements:
        return fetch_tournament_schedule(tournament_id)
    courts = {str(c.get("kort_id")): c for c in fetch_courts_for_tournament(tournament_id)}
    now = _utc_now()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for placement in placements:
                schedule_id = placement.get("schedule_id") or placement.get("id")
                if not schedule_id:
                    continue
                court_id = str(placement.get("court_id") or "")
                court_label = courts.get(court_id, {}).get("name") or court_id
                scheduled_time = str(placement.get("scheduled_time") or "")
                day_date = str(placement.get("day_date") or "")
                # Only auto-publish entries that actually got a slot.
                new_status = "planned" if (court_id and scheduled_time) else None
                assignments = [
                    "court_id = ?",
                    "court_label = ?",
                    "scheduled_time = ?",
                    "updated_at = ?",
                ]
                values: List[Any] = [court_id, court_label, scheduled_time, now]
                if day_date:
                    assignments.insert(0, "day_date = ?")
                    values.insert(0, day_date)
                if new_status:
                    assignments.append(
                        "status = CASE WHEN status IN ('in_progress','completed') THEN status ELSE ? END"
                    )
                    values.append(new_status)
                values.extend([schedule_id, tournament_id])
                cursor.execute(
                    f"UPDATE tournament_schedule SET {', '.join(assignments)} "
                    f"WHERE id = ? AND tournament_id = ?",
                    values,
                )
            conn.commit()
    except Exception as e:
        logger.error("apply_autoschedule_error", error=str(e), tournament_id=tournament_id)
    return fetch_tournament_schedule(tournament_id)

def move_schedule_entry_with_cascade(
    tournament_id: int,
    schedule_id: int,
    *,
    court_id: str,
    scheduled_time: Optional[str] = None,
    day_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Move one entry to a court/time and re-cascade times on the affected courts.

    Moves the entry onto the target court (optionally at a requested time), then recomputes
    sequential start times for every entry on both the source and target courts for that day,
    using the configured slot lengths.
    """
    from ..services import auto_scheduler

    config = get_autoscheduler_config(tournament_id)
    schedule = fetch_tournament_schedule(tournament_id)
    moved = next((e for e in schedule if int(e["id"]) == int(schedule_id)), None)
    if not moved:
        return schedule

    source_court = str(moved.get("court_id") or "")
    target_court = str(court_id or source_court)
    target_day = str(day_date or moved.get("day_date") or "")
    courts = {str(c.get("kort_id")): c for c in fetch_courts_for_tournament(tournament_id)}

    # Apply the move in-memory first.
    moved["court_id"] = target_court
    moved["court_label"] = courts.get(target_court, {}).get("name") or target_court
    if day_date:
        moved["day_date"] = target_day
    if scheduled_time:
        moved["scheduled_time"] = str(scheduled_time)

    def _court_entries(court, day):
        items = [
            e
            for e in schedule
            if str(e.get("court_id") or "") == court and str(e.get("day_date") or "") == day
        ]
        items.sort(key=lambda e: (str(e.get("scheduled_time") or "99:99"), int(e.get("sort_order") or 0), int(e.get("id") or 0)))
        return items

    updates: List[Dict[str, Any]] = []

    # Target court: pin the moved match at its drop time, cascade only the matches after it
    # (matches earlier on the court keep their times). This matches the "shift by slot" mental model.
    target_entries = _court_entries(target_court, target_day)
    if scheduled_time:
        pivot_index = next(
            (i for i, e in enumerate(target_entries) if int(e["id"]) == int(schedule_id)), 0
        )
        cursor = str(moved.get("scheduled_time") or "")
        for entry in target_entries[pivot_index:]:
            band = auto_scheduler.normalize_band(entry.get("category_name") or entry.get("group_name"))
            entry["scheduled_time"] = cursor
            cursor = auto_scheduler.add_minutes(
                cursor,
                auto_scheduler._slot_minutes_for_court(target_court, config, band),
            )
        updates.extend(target_entries)
    else:
        updates.extend(auto_scheduler.recompute_court_times(target_entries, config))

    # Source court (if different): close the gap left behind by cascading from its start.
    source_day = str(moved.get("day_date") or target_day)
    if source_court and (source_court, source_day) != (target_court, target_day):
        updates.extend(auto_scheduler.recompute_court_times(_court_entries(source_court, source_day), config))

    now = _utc_now()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for entry in updates:
                cursor.execute(
                    """
                    UPDATE tournament_schedule
                    SET court_id = ?, court_label = ?, day_date = ?, scheduled_time = ?,
                        status = CASE WHEN status IN ('in_progress','completed') THEN status
                                      WHEN status = 'draft' THEN 'planned' ELSE status END,
                        updated_at = ?
                    WHERE id = ? AND tournament_id = ?
                    """,
                    (
                        str(entry.get("court_id") or ""),
                        courts.get(str(entry.get("court_id") or ""), {}).get("name") or str(entry.get("court_id") or ""),
                        str(entry.get("day_date") or ""),
                        str(entry.get("scheduled_time") or ""),
                        now,
                        int(entry["id"]),
                        tournament_id,
                    ),
                )
            conn.commit()
    except Exception as e:
        logger.error("move_schedule_cascade_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
    return fetch_tournament_schedule(tournament_id)

def unassign_schedule_entry(
    tournament_id: int,
    schedule_id: int,
    *,
    day_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Move a schedule entry back to the unassigned pool (no court/time)."""
    from ..services import auto_scheduler

    config = get_autoscheduler_config(tournament_id)
    schedule = fetch_tournament_schedule(tournament_id)
    moved = next((e for e in schedule if int(e["id"]) == int(schedule_id)), None)
    if not moved:
        return schedule

    source_court = str(moved.get("court_id") or "")
    source_day = str(day_date or moved.get("day_date") or "")
    now = _utc_now()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE tournament_schedule
                SET court_id = '', court_label = '', scheduled_time = '', updated_at = ?
                WHERE id = ? AND tournament_id = ?
                """,
                (now, int(schedule_id), tournament_id),
            )
            conn.commit()
    except Exception as e:
        logger.error("unassign_schedule_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
        return schedule

    if source_court and source_day:
        remaining = [
            e
            for e in fetch_tournament_schedule(tournament_id)
            if str(e.get("court_id") or "") == source_court and str(e.get("day_date") or "") == source_day
        ]
        remaining.sort(
            key=lambda e: (
                str(e.get("scheduled_time") or "99:99"),
                int(e.get("sort_order") or 0),
                int(e.get("id") or 0),
            )
        )
        updates = auto_scheduler.recompute_court_times(remaining, config)
        courts = {str(c.get("kort_id")): c for c in fetch_courts_for_tournament(tournament_id)}
        now = _utc_now()
        try:
            with db_conn() as conn:
                cursor = conn.cursor()
                for entry in updates:
                    cursor.execute(
                        """
                        UPDATE tournament_schedule
                        SET scheduled_time = ?, updated_at = ?
                        WHERE id = ? AND tournament_id = ?
                        """,
                        (
                            str(entry.get("scheduled_time") or ""),
                            now,
                            int(entry["id"]),
                            tournament_id,
                        ),
                    )
                conn.commit()
        except Exception as e:
            logger.error("unassign_schedule_cascade_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
    return fetch_tournament_schedule(tournament_id)

def delete_unassigned_schedule_entries(
    tournament_id: int,
    *,
    day_date: Optional[str] = None,
) -> int:
    """Delete schedule entries with no court or time assigned (optionally for one day)."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            params: List[Any] = [tournament_id]
            query = """
                DELETE FROM tournament_schedule
                WHERE tournament_id = ?
                  AND match_id IS NULL
                  AND LOWER(COALESCE(status, '')) != 'completed'
                  AND (COALESCE(court_id, '') = '' OR COALESCE(scheduled_time, '') = '')
            """
            if day_date:
                query += " AND day_date = ?"
                params.append(str(day_date).strip())
            cursor.execute(query, params)
            conn.commit()
            return int(cursor.rowcount or 0)
    except Exception as e:
        logger.error("delete_unassigned_schedule_error", error=str(e), tournament_id=tournament_id)
        return 0
