"""One-time upgrade of tournaments created before the office's step-by-step path.

Those tournaments never went through the "Drabinki" step, so every category would show its
knockout format as not confirmed, and players already drawn into groups have no start number.
The upgrade confirms the format each category already plays (nothing is rebuilt, no group or
match changes) and numbers the players drawn into groups in the order they were entered.
A draw made some other way (an import, or a finished tournament that did not play the matches its
format would create) is marked imported: confirmed, locked and kept as played. Categories whose
groups do not agree with any single format are left for the office to decide.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Set, Tuple

from ..config import logger
from .connection import db_conn, upsert_app_settings

MIGRATION_KEY = "migration:upgrade_existing_tournaments"


def _claim_migration() -> bool:
    """Only one worker runs the upgrade: the first to insert the flag owns it."""
    with db_conn() as conn:
        cursor = conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, 'running')", (MIGRATION_KEY,))
        conn.commit()
        return cursor.rowcount == 1


def _needs_upgrade(tournament: Dict[str, Any]) -> bool:
    """Old tournaments only: never opened in the "Drabinki" step, and finished or already played.

    A tournament being set up now goes through the step by hand.
    """
    from . import brackets

    tournament_id = int(tournament["id"])
    if brackets.load_knockout_formats(tournament_id):
        return False
    if not int(tournament.get("active") or 0):
        return True
    with db_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM tournament_schedule WHERE tournament_id = ? AND match_id IS NOT NULL",
            (tournament_id,),
        ).fetchone()
    return int(row[0] or 0) > 0


def _existing_and_generated_phases(tournament_id: int, item: Dict[str, Any]) -> Tuple[Set[str], Set[str]]:
    """Knockout phases the category has in the database, and the ones its format would create."""
    from . import brackets
    from .knockout_formats import _phase_in_category, _units_for

    groups = brackets.fetch_bracket_groups(tournament_id)
    category_groups = [group for group in groups if str(group.get("tournament_category_id")) == str(item["category_id"]) and group.get("players")]
    counts = {group["name"]: len(group.get("players") or []) for group in groups}
    generated: Set[str] = set()
    for unit in _units_for(category_groups, item["play_format"]):
        slots = brackets._formatted_unit_slots(unit, item["config"], complete=False, counts=counts) or []
        generated |= {str(slot["phase"]) for slot in slots}
    labels = {str(unit.get("label") or "") for kind in ("groups_knockout", "knockout") for unit in _units_for(category_groups, kind)}
    prefixes = sorted(labels | {item.get("label") or ""})
    existing = {str(row["phase"]) for row in brackets.fetch_bracket_knockout(tournament_id) if _phase_in_category(row.get("phase"), prefixes)}
    return existing, generated


def upgrade_tournament(tournament_id: int) -> Dict[str, Any]:
    from . import brackets
    from .knockout_formats import default_config, knockout_format_overview
    from .start_numbers import assign_start_numbers
    from .tournaments import fetch_tournament

    stored = brackets.load_knockout_formats(tournament_id)
    finished = not int((fetch_tournament(tournament_id) or {}).get("active") or 0)
    confirmed: List[str] = []
    imported: List[str] = []
    skipped: List[str] = []
    for item in knockout_format_overview(tournament_id):
        key = str(item["category_id"])
        config = item["config"]
        if config.get("confirmed"):
            continue
        saved_format = (stored.get(key) or {}).get("format")
        group_formats = {group.get("play_format") for group in item["groups"]}
        # a saved choice that no longer fits, or groups playing different forms, need a person
        if (saved_format and saved_format != config["format"]) or (item["groups"] and group_formats != {item["play_format"]}):
            skipped.append(item["label"])
            continue
        existing, generated = _existing_and_generated_phases(tournament_id, item)
        # knockout matches this format would not make, or a finished tournament that never played
        # the ones it would: the draw was made some other way and is kept exactly as it was
        if (existing - generated) or (finished and generated - existing):
            stored[key] = {**default_config("none"), "confirmed": True, "imported": True}
            imported.append(item["label"])
            continue
        stored[key] = {**config, "confirmed": True}
        confirmed.append(item["label"])
    if confirmed or imported:
        upsert_app_settings({brackets.knockout_formats_settings_key(tournament_id): json.dumps(stored)})

    numbered = 0
    by_category: Dict[int, List[int]] = {}
    for group in brackets.fetch_bracket_groups(tournament_id):
        category_id = group.get("tournament_category_id")
        if not category_id:
            continue
        ids = by_category.setdefault(int(category_id), [])
        for row in group.get("players") or []:
            if row.get("player_id") and not row.get("team_id") and int(row["player_id"]) not in ids:
                ids.append(int(row["player_id"]))
    for category_id, player_ids in by_category.items():
        try:
            before = len((assign_start_numbers(tournament_id, category_id, "player", []).get(str(category_id)) or {}).get("player") or {})
            after = len((assign_start_numbers(tournament_id, category_id, "player", player_ids).get(str(category_id)) or {}).get("player") or {})
            numbered += after - before
        except LookupError:
            continue
    return {"confirmed": confirmed, "imported": imported, "skipped": skipped, "numbered": numbered}


def upgrade_existing_tournaments() -> Dict[str, Any]:
    """Run once per database; later starts see the flag and do nothing."""
    if not _claim_migration():
        return {"status": "already_done"}
    from .tournaments import fetch_tournaments

    summary: Dict[str, Any] = {}
    for tournament in fetch_tournaments():
        tournament_id = int(tournament["id"])
        if not _needs_upgrade(tournament):
            continue
        try:
            result = upgrade_tournament(tournament_id)
        except Exception as exc:  # noqa: BLE001 - one odd tournament must not stop the others
            logger.error("tournament_upgrade_failed", tournament_id=tournament_id, error=str(exc))
            result = {"error": str(exc)}
        if any(result.get(key) for key in ("confirmed", "imported", "skipped", "numbered", "error")):
            summary[str(tournament_id)] = result
    upsert_app_settings({MIGRATION_KEY: json.dumps(summary, ensure_ascii=False)})
    logger.info("database_migration", action="upgraded_existing_tournaments", summary=summary)
    return {"status": "ok", "tournaments": summary}
