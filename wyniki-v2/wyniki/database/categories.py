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

from .connection import _utc_now, db_conn, fetch_app_settings, upsert_app_settings

def _tournament_category_counts(cursor: sqlite3.Cursor, category_id: int) -> tuple[int, int, int]:
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM bracket_group_players bgp
        JOIN bracket_groups bg ON bg.id = bgp.group_id
        WHERE bg.tournament_category_id = ?
        """,
        (category_id,),
    )
    player_count = int(cursor.fetchone()[0] or 0)
    cursor.execute(
        "SELECT COUNT(*) FROM bracket_groups WHERE tournament_category_id = ?",
        (category_id,),
    )
    group_count = int(cursor.fetchone()[0] or 0)
    cursor.execute(
        "SELECT COUNT(*) FROM tournament_teams WHERE category_id = ?",
        (category_id,),
    )
    team_count = int(cursor.fetchone()[0] or 0)
    return player_count, group_count, team_count

def fetch_tournament_categories(tournament_id: int, *, active_only: bool = False) -> List[Dict[str, Any]]:
    from ..services.tournament_categories import category_row_payload

    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            clause = "AND is_active = 1" if active_only else ""
            cursor.execute(
                f"""
                SELECT tc.*,
                       (SELECT COUNT(*)
                        FROM bracket_group_players bgp
                        JOIN bracket_groups bg ON bg.id = bgp.group_id
                        WHERE bg.tournament_category_id = tc.id) AS player_count,
                       (SELECT COUNT(*)
                        FROM bracket_groups bg
                        WHERE bg.tournament_category_id = tc.id) AS group_count,
                       (SELECT COUNT(*)
                        FROM tournament_teams tt
                        WHERE tt.category_id = tc.id) AS team_count
                FROM tournament_categories tc
                WHERE tc.tournament_id = ? {clause}
                ORDER BY tc.sort_order, tc.id
                """,
                (tournament_id,),
            )
            return [category_row_payload(row) for row in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_tournament_categories_error", error=str(e), tournament_id=tournament_id)
        return []

def fetch_tournament_category(category_id: int) -> Optional[Dict[str, Any]]:
    from ..services.tournament_categories import category_row_payload

    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT tc.*, 0 AS player_count, 0 AS group_count, 0 AS team_count
                FROM tournament_categories tc
                WHERE tc.id = ?
                """,
                (category_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            payload = category_row_payload(row)
            payload["player_count"], payload["group_count"], payload["team_count"] = _tournament_category_counts(
                cursor, category_id
            )
            return payload
    except Exception as e:
        logger.error("fetch_tournament_category_error", error=str(e), category_id=category_id)
        return None

def _insert_tournament_category_row(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    *,
    label: str,
    preset_key: str = "",
    hint_bands: Optional[List[str]] = None,
    sort_order: Optional[int] = None,
    is_doubles: bool = False,
) -> int:
    from ..services.teams import coerce_is_doubles
    from ..services.tournament_categories import normalize_hint_bands

    if sort_order is None:
        cursor.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM tournament_categories WHERE tournament_id = ?",
            (tournament_id,),
        )
        sort_order = int(cursor.fetchone()[0] or -1) + 1
    bands_json = json.dumps(normalize_hint_bands(hint_bands or []))
    cursor.execute(
        """
        INSERT INTO tournament_categories (
            tournament_id, label, preset_key, sort_order, is_active, hint_bands, is_doubles, created_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        """,
        (
            tournament_id,
            label.strip(),
            preset_key.strip(),
            sort_order,
            bands_json,
            1 if coerce_is_doubles(is_doubles) else 0,
            _utc_now(),
        ),
    )
    return int(cursor.lastrowid)

def confirm_tournament_categories(
    tournament_id: int,
    entries: List[Dict[str, Any]],
    *,
    replace: bool = False,
) -> List[Dict[str, Any]]:
    """Create the initial category set for a tournament (after checkbox confirm)."""
    from ..services.tournament_categories import preset_defaults, normalize_hint_bands

    if not entries:
        return fetch_tournament_categories(tournament_id)
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if replace:
                cursor.execute(
                    "SELECT COUNT(*) FROM tournament_categories WHERE tournament_id = ?",
                    (tournament_id,),
                )
                if int(cursor.fetchone()[0] or 0):
                    cursor.execute(
                        """
                        SELECT COUNT(*) FROM bracket_groups
                        WHERE tournament_id = ? AND tournament_category_id IS NOT NULL
                        """,
                        (tournament_id,),
                    )
                    if int(cursor.fetchone()[0] or 0):
                        raise ValueError("Cannot replace categories while groups are assigned")
                    cursor.execute("DELETE FROM tournament_categories WHERE tournament_id = ?", (tournament_id,))
            cursor.execute(
                "SELECT COUNT(*) FROM tournament_categories WHERE tournament_id = ?",
                (tournament_id,),
            )
            if int(cursor.fetchone()[0] or 0) and not replace:
                raise ValueError("Tournament categories already confirmed")
            for index, entry in enumerate(entries):
                preset_key = str(entry.get("preset_key") or "").strip().upper()
                label = str(entry.get("label") or "").strip()
                hint_bands = entry.get("hint_bands")
                if preset_key and not label:
                    preset = preset_defaults(preset_key)
                    if preset:
                        label = preset["label"]
                        hint_bands = hint_bands or preset.get("hint_bands")
                if not label:
                    continue
                _insert_tournament_category_row(
                    cursor,
                    tournament_id,
                    label=label,
                    preset_key=preset_key,
                    hint_bands=normalize_hint_bands(hint_bands or []),
                    sort_order=index,
                    is_doubles=entry.get("is_doubles"),
                )
            conn.commit()
        logger.info("tournament_categories_confirmed", tournament_id=tournament_id, count=len(entries))
        return fetch_tournament_categories(tournament_id)
    except ValueError:
        raise
    except Exception as e:
        logger.error("confirm_tournament_categories_error", error=str(e), tournament_id=tournament_id)
        raise

def insert_tournament_category(
    tournament_id: int,
    *,
    label: str,
    preset_key: str = "",
    hint_bands: Optional[List[str]] = None,
    is_doubles: bool = False,
) -> Optional[Dict[str, Any]]:
    from ..services.tournament_categories import normalize_hint_bands

    label = label.strip()
    if not label:
        return None
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            category_id = _insert_tournament_category_row(
                cursor,
                tournament_id,
                label=label,
                preset_key=preset_key,
                hint_bands=normalize_hint_bands(hint_bands or []),
                is_doubles=is_doubles,
            )
            conn.commit()
        return fetch_tournament_category(category_id)
    except Exception as e:
        logger.error("insert_tournament_category_error", error=str(e), tournament_id=tournament_id)
        return None

def _propagate_tournament_category_label(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    category_id: int,
    old_label: str,
    new_label: str,
) -> None:
    if not old_label or old_label == new_label:
        return
    now = _utc_now()
    cursor.execute(
        """
        UPDATE bracket_groups
        SET name = CASE
            WHEN name = ? THEN ?
            WHEN name LIKE ? THEN ? || SUBSTR(name, ?)
            ELSE name
        END
        WHERE tournament_id = ? AND tournament_category_id = ?
        """,
        (
            old_label,
            new_label,
            old_label + " — %",
            new_label,
            len(old_label) + 1,
            tournament_id,
            category_id,
        ),
    )
    cursor.execute(
        """
        UPDATE tournament_schedule
        SET category_name = ?, group_name = CASE
            WHEN group_name = ? THEN ?
            WHEN group_name LIKE ? THEN ? || SUBSTR(group_name, ?)
            ELSE group_name
        END, updated_at = ?
        WHERE tournament_id = ? AND category_name = ?
        """,
        (
            new_label,
            old_label,
            new_label,
            old_label + " — %",
            new_label,
            len(old_label) + 1,
            now,
            tournament_id,
            old_label,
        ),
    )
    cursor.execute(
        """
        UPDATE bracket_knockout
        SET phase = REPLACE(phase, ?, ?)
        WHERE tournament_id = ? AND phase LIKE ?
        """,
        (old_label, new_label, tournament_id, old_label + "%"),
    )
    cursor.execute(
        """
        UPDATE tournament_schedule
        SET phase = REPLACE(phase, ?, ?), updated_at = ?
        WHERE tournament_id = ? AND phase LIKE ?
        """,
        (old_label, new_label, now, tournament_id, old_label + "%"),
    )

def update_tournament_category(
    category_id: int,
    *,
    label: Optional[str] = None,
    hint_bands: Optional[List[str]] = None,
    sort_order: Optional[int] = None,
    is_active: Optional[bool] = None,
    is_doubles: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    from ..services.teams import coerce_is_doubles
    from ..services.tournament_categories import normalize_hint_bands

    existing = fetch_tournament_category(category_id)
    if not existing:
        return None
    tournament_id = int(existing["tournament_id"])
    new_label = label.strip() if label is not None else None
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            old_label = existing["label"]
            if new_label is not None and new_label != old_label:
                _propagate_tournament_category_label(
                    cursor, tournament_id, category_id, old_label, new_label
                )
            fields: List[str] = []
            params: List[Any] = []
            if new_label is not None:
                fields.append("label = ?")
                params.append(new_label)
            if hint_bands is not None:
                fields.append("hint_bands = ?")
                params.append(json.dumps(normalize_hint_bands(hint_bands)))
            if sort_order is not None:
                fields.append("sort_order = ?")
                params.append(int(sort_order))
            if is_active is not None:
                fields.append("is_active = ?")
                params.append(1 if is_active else 0)
            if is_doubles is not None:
                fields.append("is_doubles = ?")
                params.append(1 if coerce_is_doubles(is_doubles) else 0)
            if fields:
                params.append(category_id)
                cursor.execute(
                    f"UPDATE tournament_categories SET {', '.join(fields)} WHERE id = ?",
                    params,
                )
            conn.commit()
        return fetch_tournament_category(category_id)
    except Exception as e:
        logger.error("update_tournament_category_error", error=str(e), category_id=category_id)
        return None

def delete_tournament_category(category_id: int, *, force: bool = False) -> bool:
    existing = fetch_tournament_category(category_id)
    if not existing:
        return False
    player_count = int(existing.get("player_count") or 0)
    group_count = int(existing.get("group_count") or 0)
    team_count = int(existing.get("team_count") or 0)
    if (player_count or group_count or team_count) and not force:
        return update_tournament_category(category_id, is_active=False) is not None
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                DELETE FROM bracket_group_players
                WHERE team_id IN (SELECT id FROM tournament_teams WHERE category_id = ?)
                """,
                (category_id,),
            )
            cursor.execute("DELETE FROM tournament_teams WHERE category_id = ?", (category_id,))
            cursor.execute(
                "UPDATE bracket_groups SET tournament_category_id = NULL WHERE tournament_category_id = ?",
                (category_id,),
            )
            cursor.execute("DELETE FROM tournament_categories WHERE id = ?", (category_id,))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("delete_tournament_category_error", error=str(e), category_id=category_id)
        return False

def migrate_tournament_categories_from_legacy(tournament_id: int) -> List[Dict[str, Any]]:
    """One-time migration: infer tournament categories from bracket group names."""
    existing = fetch_tournament_categories(tournament_id)
    if existing:
        return existing
    groups = fetch_bracket_groups(tournament_id)
    labels: List[str] = []
    for group in groups:
        base = str(group.get("name") or "").split(" — ")[0].split(" - ")[0].strip()
        if base and base not in labels:
            labels.append(base)
    if not labels:
        mixed = get_mixed_categories(tournament_id)
        for code in mixed:
            from ..services.categories import mixed_category_label, format_category_display
            labels.append(mixed_category_label(code) if code == "B34" else f"{format_category_display(code)} Mixed")
    if not labels:
        return []
    entries = [{"label": label} for label in labels]
    categories = confirm_tournament_categories(tournament_id, entries)
    label_to_id = {cat["label"]: cat["id"] for cat in categories}
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for group in groups:
                base = str(group.get("name") or "").split(" — ")[0].split(" - ")[0].strip()
                category_id = label_to_id.get(base)
                if category_id:
                    cursor.execute(
                        "UPDATE bracket_groups SET tournament_category_id = ? WHERE id = ?",
                        (category_id, group["id"]),
                    )
            conn.commit()
    except Exception as e:
        logger.error("migrate_tournament_categories_link_error", error=str(e), tournament_id=tournament_id)
    return fetch_tournament_categories(tournament_id)

def _mixed_categories_settings_key(tournament_id: int) -> str:
    return f"mixed_categories:{int(tournament_id)}"

def get_mixed_categories(tournament_id: int) -> List[str]:
    """Legacy mixed-band settings (app_settings). Prefer get_planning_mixed_bands()."""
    from ..services.categories import normalize_mixed_categories

    stored = fetch_app_settings([_mixed_categories_settings_key(tournament_id)]).get(
        _mixed_categories_settings_key(tournament_id)
    )
    if not stored:
        return []
    try:
        data = json.loads(stored)
        if isinstance(data, list):
            return normalize_mixed_categories(data)
    except (ValueError, TypeError):
        pass
    return []

def get_planning_mixed_bands(tournament_id: int) -> List[str]:
    """Mixed player-band codes for import/planning — from tournament_categories, legacy fallback."""
    from ..services.tournament_categories import infer_mixed_player_bands

    categories = fetch_tournament_categories(tournament_id, active_only=True)
    if categories:
        return infer_mixed_player_bands(categories)
    return get_mixed_categories(tournament_id)

def clear_legacy_mixed_categories(tournament_id: int) -> bool:
    """Remove deprecated mixed_categories:{id} from app_settings."""
    key = _mixed_categories_settings_key(tournament_id)
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM app_settings WHERE key = ?", (key,))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("clear_legacy_mixed_categories_error", error=str(e), tournament_id=tournament_id)
        return False

def set_mixed_categories(tournament_id: int, categories: List[str]) -> List[str]:
    """Deprecated — use confirm_tournament_categories instead."""
    from ..services.categories import normalize_mixed_categories

    normalized = normalize_mixed_categories(categories)
    upsert_app_settings({_mixed_categories_settings_key(tournament_id): json.dumps(normalized)})
    return normalized
