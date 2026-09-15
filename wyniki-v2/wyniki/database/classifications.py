"""Sport classes (B1–B4) of players in the player database, with their history.

A player's class is what a classification (usually a medical one at a tournament) gave them.
It is kept apart from the category a player played in a tournament: a B2 can play up in B3,
and "B3/4 Mixed" is a bucket, not a class. Results always stay with the category they were
played in; a class change never moves them.

``player_classifications`` holds every change. The current class is the latest one by date,
mirrored in ``global_players.category`` (what the rest of the app reads). After a tournament
the admin reviews the players who played outside their class and decides per player.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Set

from ..config import logger
from .connection import db_conn

CLASSES = ("B1", "B2", "B3", "B4")
SOURCES = ("initial", "tournament", "manual")
STATUSES = ("confirmed", "provisional")
DECISIONS = ("reclassify", "play_up", "skip")

_CLASS_IN_LABEL = re.compile(r"B\s*([1-4])((?:\s*/\s*B?\s*[1-4])*)", re.IGNORECASE)


def normalize_gender(value: Any) -> str:
    """One code per sex: M for men, K for women (F and W from imports and older rows)."""
    raw = str(value or "").strip().upper()
    if raw in {"K", "F", "W"}:
        return "K"
    if raw == "M":
        return "M"
    return ""


def normalize_class(value: Any) -> str:
    raw = re.sub(r"[^A-Z0-9]", "", str(value or "").upper())
    return raw if raw in CLASSES else ""


def classes_in_label(label: Any) -> Set[str]:
    """B-classes a tournament category is open to: "B2 Men" → {B2}, "B3/4 Mixed" → {B3, B4}."""
    found: Set[str] = set()
    for match in _CLASS_IN_LABEL.finditer(str(label or "")):
        found.add(f"B{match.group(1)}")
        for extra in re.findall(r"[1-4]", match.group(2) or ""):
            found.add(f"B{extra}")
    return found


def ensure_classification_tables(cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS player_classifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            global_player_id INTEGER NOT NULL,
            classification TEXT NOT NULL,
            previous_classification TEXT NOT NULL DEFAULT '',
            effective_date TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL,
            tournament_id INTEGER,
            status TEXT NOT NULL DEFAULT 'confirmed',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (global_player_id) REFERENCES global_players(id) ON DELETE CASCADE,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_classifications_player ON player_classifications(global_player_id, effective_date)")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS classification_reviews (
            tournament_id INTEGER NOT NULL,
            global_player_id INTEGER NOT NULL,
            decision TEXT NOT NULL,
            classification TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tournament_id, global_player_id),
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            FOREIGN KEY (global_player_id) REFERENCES global_players(id) ON DELETE CASCADE
        )
    """)


def normalize_stored_genders(cursor) -> int:
    changed = 0
    for table in ("global_players", "players"):
        cursor.execute(f"UPDATE {table} SET gender = 'K' WHERE UPPER(TRIM(COALESCE(gender, ''))) IN ('K', 'F', 'W') AND gender <> 'K'")
        changed += cursor.rowcount
        cursor.execute(f"UPDATE {table} SET gender = 'M' WHERE UPPER(TRIM(COALESCE(gender, ''))) = 'M' AND gender <> 'M'")
        changed += cursor.rowcount
    return changed


def _rows(cursor, global_player_id: int) -> List[Dict[str, Any]]:
    cursor.execute(
        """
        SELECT pc.*, t.name AS tournament_name, t.start_date AS tournament_start, t.end_date AS tournament_end
        FROM player_classifications pc LEFT JOIN tournaments t ON t.id = pc.tournament_id
        WHERE pc.global_player_id = ?
        ORDER BY pc.effective_date, pc.id
        """,
        (int(global_player_id),),
    )
    return [dict(row) for row in cursor.fetchall()]


def fetch_classification_history(global_player_id: int) -> List[Dict[str, Any]]:
    """Every class the player had, oldest first; a player never reclassified has one entry."""
    with db_conn() as conn:
        cursor = conn.cursor()
        rows = _rows(cursor, global_player_id)
        if rows:
            return rows
        cursor.execute("SELECT category FROM global_players WHERE id = ?", (int(global_player_id),))
        found = cursor.fetchone()
        current = normalize_class(found[0]) if found else ""
        if not current:
            return []
        return [{
            "id": None, "global_player_id": int(global_player_id), "classification": current,
            "previous_classification": "", "effective_date": "",
            "source": "initial", "tournament_id": None, "status": "confirmed", "note": "",
            "tournament_name": None, "tournament_start": None, "tournament_end": None,
        }]


def _sync_current(cursor, global_player_id: int) -> str:
    rows = _rows(cursor, global_player_id)
    if not rows:
        return ""
    current = rows[-1]["classification"]
    cursor.execute("UPDATE global_players SET category = ? WHERE id = ?", (current, int(global_player_id)))
    return current


def record_classification_change(
    global_player_id: int,
    classification: str,
    *,
    source: str,
    tournament_id: Optional[int] = None,
    effective_date: Optional[str] = None,
    status: str = "confirmed",
    note: str = "",
) -> Dict[str, Any]:
    """Add a class to the player's history and make the latest one by date current.

    A change from a tournament also sets the class of the player's entry in that tournament,
    since that is where they were classified.
    """
    code = normalize_class(classification)
    if not code:
        raise ValueError("invalid_classification")
    if source not in SOURCES:
        raise ValueError("invalid_source")
    if status not in STATUSES:
        raise ValueError("invalid_status")
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        cursor.execute("SELECT category FROM global_players WHERE id = ?", (int(global_player_id),))
        found = cursor.fetchone()
        if found is None:
            conn.rollback()
            raise LookupError("player_not_found")
        rows = _rows(cursor, global_player_id)
        before = normalize_class(found[0])
        if not effective_date and tournament_id:
            cursor.execute("SELECT COALESCE(NULLIF(end_date, ''), start_date) FROM tournaments WHERE id = ?", (int(tournament_id),))
            tournament_row = cursor.fetchone()
            effective_date = str(tournament_row[0] or "") if tournament_row else ""
        effective_date = effective_date or date.today().isoformat()
        if not rows and before:
            # the class the player had until now becomes the start of the history
            # undated: nobody recorded when it was given
            cursor.execute(
                "INSERT INTO player_classifications (global_player_id, classification, effective_date, source) VALUES (?, ?, '', 'initial')",
                (int(global_player_id), before),
            )
            rows = _rows(cursor, global_player_id)
        previous = ""
        for row in rows:
            if str(row["effective_date"] or "") <= effective_date:
                previous = row["classification"]
        cursor.execute(
            "INSERT INTO player_classifications (global_player_id, classification, previous_classification, effective_date, source, tournament_id, status, note) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (int(global_player_id), code, previous, effective_date, source, int(tournament_id) if tournament_id else None, status, note or ""),
        )
        new_id = cursor.lastrowid
        if tournament_id:
            cursor.execute(
                "UPDATE players SET category = ? WHERE tournament_id = ? AND global_player_id = ?",
                (code, int(tournament_id), int(global_player_id)),
            )
        current = _sync_current(cursor, global_player_id)
        conn.commit()
    logger.info("player_classification_recorded", global_player_id=global_player_id, classification=code, previous=previous, current=current, source=source, tournament_id=tournament_id)
    return {"id": new_id, "classification": code, "previous_classification": previous, "effective_date": effective_date, "current": current}


def played_categories(tournament_id: int) -> List[Dict[str, Any]]:
    """Each database player of a tournament with the singles category they played in."""
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.global_player_id, gp.first_name, gp.last_name, gp.gender, gp.category AS current_class,
                   p.category AS entry_class, tc.label AS category_label, tc.id AS category_id
            FROM bracket_group_players bgp
            JOIN bracket_groups bg ON bg.id = bgp.group_id
            JOIN players p ON p.id = bgp.player_id
            JOIN global_players gp ON gp.id = p.global_player_id
            LEFT JOIN tournament_categories tc ON tc.id = bg.tournament_category_id
            WHERE bg.tournament_id = ? AND bgp.team_id IS NULL AND COALESCE(tc.is_doubles, 0) = 0
            ORDER BY tc.sort_order, gp.last_name, gp.first_name
            """,
            (int(tournament_id),),
        )
        seen: Set[int] = set()
        result = []
        for row in cursor.fetchall():
            gid = int(row["global_player_id"])
            if gid in seen:
                continue
            seen.add(gid)
            label = row["category_label"] or ""
            result.append({
                "global_player_id": gid,
                "first_name": row["first_name"] or "",
                "last_name": row["last_name"] or "",
                "gender": normalize_gender(row["gender"]),
                "current_class": normalize_class(row["current_class"]),
                "entry_class": normalize_class(row["entry_class"]),
                "category_id": row["category_id"],
                "category_label": label,
                "category_classes": sorted(classes_in_label(label)),
            })
        return result


def classification_review(tournament_id: int) -> Dict[str, Any]:
    """Players who played outside their class, with what the admin decided so far."""
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT global_player_id, decision, classification, created_at FROM classification_reviews WHERE tournament_id = ?", (int(tournament_id),))
        decided = {int(row[0]): {"decision": row[1], "classification": row[2], "decided_at": row[3]} for row in cursor.fetchall()}
    items = []
    for entry in played_categories(tournament_id):
        classes = entry["category_classes"]
        # the class the player had when entering counts: a decision already applied changes it
        reference = entry["entry_class"] or entry["current_class"]
        if not classes or (reference in classes and entry["global_player_id"] not in decided):
            continue
        suggested = classes[0] if len(classes) == 1 else ""
        # a lower number means less sight: a player cannot play below their class without a new one
        plays_lower = bool(reference) and all(int(code[1]) < int(reference[1]) for code in classes)
        items.append({
            **entry,
            "suggested_class": suggested,
            "hint": "reclassification_required" if plays_lower else "maybe_playing_up",
            **(decided.get(entry["global_player_id"]) or {"decision": None, "classification": "", "decided_at": None}),
        })
    return {"tournament_id": int(tournament_id), "items": items, "pending": sum(1 for item in items if not item["decision"])}


def apply_classification_decisions(tournament_id: int, decisions: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """reclassify: the class changes from this tournament; play_up / skip: only remembered."""
    review = {item["global_player_id"]: item for item in classification_review(tournament_id)["items"]}
    applied, errors = [], []
    for raw in decisions or []:
        try:
            gid = int(raw.get("global_player_id"))
        except (TypeError, ValueError):
            errors.append({"global_player_id": raw.get("global_player_id"), "error": "invalid_player"})
            continue
        decision = str(raw.get("decision") or "")
        item = review.get(gid)
        if item is None:
            errors.append({"global_player_id": gid, "error": "not_in_review"})
            continue
        if decision not in DECISIONS:
            errors.append({"global_player_id": gid, "error": "invalid_decision"})
            continue
        if item.get("decision"):
            errors.append({"global_player_id": gid, "error": "already_decided"})
            continue
        code = normalize_class(raw.get("classification") or item["suggested_class"])
        if decision == "reclassify":
            if not code:
                errors.append({"global_player_id": gid, "error": "invalid_classification"})
                continue
            record_classification_change(gid, code, source="tournament", tournament_id=tournament_id, note=str(raw.get("note") or ""))
        with db_conn() as conn:
            conn.execute(
                "INSERT INTO classification_reviews (tournament_id, global_player_id, decision, classification) VALUES (?, ?, ?, ?)",
                (int(tournament_id), gid, decision, code if decision == "reclassify" else ""),
            )
            conn.commit()
        applied.append({"global_player_id": gid, "decision": decision, "classification": code if decision == "reclassify" else ""})
    logger.info("classification_review_applied", tournament_id=tournament_id, applied=len(applied), errors=len(errors))
    return {"applied": applied, "errors": errors, "review": classification_review(tournament_id)}


def move_classifications(source_id: int, target_id: int) -> None:
    """Merged duplicates: the kept player takes over the history and the review decisions."""
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE player_classifications SET global_player_id = ? WHERE global_player_id = ?", (int(target_id), int(source_id)))
        moved = cursor.rowcount
        cursor.execute("UPDATE OR IGNORE classification_reviews SET global_player_id = ? WHERE global_player_id = ?", (int(target_id), int(source_id)))
        cursor.execute("DELETE FROM classification_reviews WHERE global_player_id = ?", (int(source_id),))
        if moved:
            _sync_current(cursor, target_id)
        conn.commit()


def played_category_labels(player_entry_ids: Iterable[int]) -> Dict[int, str]:
    """{tournament_id: singles category label} for tournament entries of one person."""
    ids = [int(value) for value in player_entry_ids if value]
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    with db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT bg.tournament_id, tc.label
            FROM bracket_group_players bgp
            JOIN bracket_groups bg ON bg.id = bgp.group_id
            JOIN tournament_categories tc ON tc.id = bg.tournament_category_id
            WHERE bgp.player_id IN ({placeholders}) AND bgp.team_id IS NULL AND COALESCE(tc.is_doubles, 0) = 0
            ORDER BY bg.order_num, bg.id
            """,
            ids,
        ).fetchall()
    labels: Dict[int, str] = {}
    for tournament_id, label in rows:
        labels.setdefault(int(tournament_id), str(label or ""))
    return labels
