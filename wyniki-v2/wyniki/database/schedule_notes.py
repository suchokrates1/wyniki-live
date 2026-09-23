"""Bulk public notes on schedule rows."""
from typing import Any, Dict

from ..config import logger
from .connection import _utc_now, db_conn
from .schedule import fetch_tournament_schedule

SCHEDULE_NOTE_MODES = ("replace", "append", "clear")


def _schedule_note_category(row: Dict[str, Any]) -> str:
    label = str(row.get("category_name") or row.get("group_name") or "").strip()
    return label.split(" — ", 1)[0].strip()


def _schedule_row_matches_note_filters(row: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    day = str(filters.get("day_date") or "").strip()
    if day and str(row.get("day_date") or "") != day:
        return False
    courts = {str(value) for value in (filters.get("court_ids") or []) if str(value or "").strip()}
    if courts and str(row.get("court_id") or "") not in courts:
        return False
    categories = {str(value).strip() for value in (filters.get("categories") or []) if str(value or "").strip()}
    if categories:
        label = str(row.get("category_name") or row.get("group_name") or "").strip()
        if _schedule_note_category(row) not in categories and label not in categories:
            return False
    phase = str(filters.get("phase") or "all")
    source = str(row.get("source_type") or "")
    if phase == "group" and source not in ("group", "group_rematch"):
        return False
    if phase == "knockout" and source != "knockout":
        return False
    if filters.get("only_unplayed", True):
        status = str(row.get("status") or "").lower()
        if row.get("match_id") or status in ("completed", "in_progress"):
            return False
    return True


def apply_schedule_notes(
    tournament_id: int,
    filters: Dict[str, Any],
    *,
    text: str = "",
    mode: str = "replace",
    apply: bool = False,
) -> Dict[str, Any]:
    """Public notes for many matches at once: every match matching the filters (day, courts,
    categories, phase, unplayed only). Without ``apply`` it only reports what would change."""
    if mode not in SCHEDULE_NOTE_MODES:
        return {"error": "invalid_mode"}
    note = str(text or "").strip()[:500]
    if mode != "clear" and not note:
        return {"error": "empty_note"}
    rows = [row for row in fetch_tournament_schedule(tournament_id) if _schedule_row_matches_note_filters(row, filters or {})]
    changes = []
    for row in rows:
        current = str(row.get("notes_public") or "").strip()
        if mode == "clear":
            new = ""
        elif mode == "append":
            new = note if not current else (current if current.endswith(note) else f"{current} · {note}")
        else:
            new = note
        changes.append({
            "id": row.get("id"),
            "day_date": row.get("day_date") or "",
            "scheduled_time": row.get("scheduled_time") or "",
            "court_id": row.get("court_id") or "",
            "court_name": row.get("court_name") or "",
            "category_name": row.get("category_name") or "",
            "phase": row.get("phase") or "",
            "player1_name": row.get("player1_name") or "",
            "player2_name": row.get("player2_name") or "",
            "current": current,
            "new": new,
        })
    result = {
        "count": len(changes),
        "with_notes": sum(1 for item in changes if item["current"]),
        "changed": sum(1 for item in changes if item["current"] != item["new"]),
        "matches": changes,
        "updated": 0,
    }
    if apply and changes:
        now = _utc_now()
        with db_conn() as conn:
            cursor = conn.cursor()
            for item in changes:
                if item["current"] == item["new"]:
                    continue
                cursor.execute(
                    "UPDATE tournament_schedule SET notes_public = ?, updated_at = ? WHERE id = ? AND tournament_id = ?",
                    (item["new"], now, int(item["id"]), int(tournament_id)),
                )
                result["updated"] += cursor.rowcount
            conn.commit()
        logger.info("schedule_notes_applied", tournament_id=tournament_id, mode=mode, updated=result["updated"])
    return result
