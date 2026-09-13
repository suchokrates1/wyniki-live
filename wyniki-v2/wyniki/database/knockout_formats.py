"""Knockout format per category: what the office chooses in the "Drabinki" step.

A category's format decides how its knockout draw is built once groups are drawn
(see ``brackets._formatted_unit_slots``). Categories without a saved format keep the
automatic one that matches their number of groups. Changing a format rebuilds that
category's draw, which is only allowed before any of its knockout matches has a result.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from ..config import logger
from ..services.draw_builder import (
    PLACES,
    cross_draw_lines,
    direct_draw_lines,
    group_draw_lines,
    swap_lines,
)
from .connection import db_conn, upsert_app_settings

FORMATS = ("none", "table", "cross", "main", "direct")


def _brackets():
    from . import brackets
    return brackets


def default_places(fmt: str) -> str:
    return "third" if fmt in ("table", "direct") else "all"


def default_config(fmt: str) -> Dict[str, Any]:
    return {"format": fmt, "qualifiers": 2, "places": default_places(fmt), "consolation": True, "swaps": {}, "confirmed": False}


def normalize_config(raw: Dict[str, Any], *, allowed: List[str], expected: str, max_qualifiers: int) -> Dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    fmt = str(raw.get("format") or expected)
    if fmt not in allowed:
        fmt = expected
    places = str(raw.get("places") or default_places(fmt))
    if places not in PLACES:
        places = default_places(fmt)
    try:
        qualifiers = int(raw.get("qualifiers") or 2)
    except (TypeError, ValueError):
        qualifiers = 2
    qualifiers = max(1, min(qualifiers, max(1, max_qualifiers)))
    swaps: Dict[str, List[List[int]]] = {}
    for key in ("main", "consolation"):
        pairs = []
        for pair in (raw.get("swaps") or {}).get(key) or []:
            try:
                pairs.append([int(pair[0]), int(pair[1])])
            except (TypeError, ValueError, IndexError):
                continue
        if pairs:
            swaps[key] = pairs
    return {
        "format": fmt,
        "qualifiers": qualifiers,
        "places": places,
        "consolation": bool(raw.get("consolation", True)),
        "swaps": swaps,
        "confirmed": bool(raw.get("confirmed", False)),
    }


def _group_letter(name: str) -> str:
    label = str(name or "").rsplit(" — ", 1)[-1].strip()
    token = label.split()[-1] if label else ""
    return token.upper() if len(token) == 1 and token.isalpha() else label


def _category_units(tournament_id: int) -> Dict[str, List[Dict[str, Any]]]:
    brackets = _brackets()
    groups = brackets.fetch_bracket_groups(tournament_id)
    units: Dict[str, List[Dict[str, Any]]] = {}
    for unit in brackets._iter_knockout_units(groups):
        if unit.get("category_id"):
            units.setdefault(str(unit["category_id"]), []).append(unit)
    return units


def _category_slots_with_results(tournament_id: int, prefixes: List[str]) -> List[Dict[str, Any]]:
    rows = _brackets().fetch_bracket_knockout(tournament_id)
    return [row for row in rows if _phase_in_category(row.get("phase"), prefixes)]


def _phase_in_category(phase: Optional[str], prefixes: List[str]) -> bool:
    text = str(phase or "")
    return any(text == prefix or text.startswith(f"{prefix} — ") for prefix in prefixes if prefix)


def _preview(category: Dict[str, Any], units: List[Dict[str, Any]], groups: List[Dict[str, Any]], config: Dict[str, Any]) -> Dict[str, Any]:
    """First-round lines and match counts for a config, with places named "A1", "B2"."""
    brackets = _brackets()
    fmt = config["format"]
    result: Dict[str, Any] = {"draws": [], "table": [], "placements": [], "matches": 0, "main_matches": 0, "consolation_matches": 0}
    if fmt == "none" or not units:
        return result
    unit = units[0]
    draw_groups = []
    for index, group in enumerate(unit["groups"]):
        letter = _group_letter(group["name"])
        letter = letter if len(letter) == 1 else chr(65 + index)
        draw_groups.append({"name": letter, "ranking": [f"{letter}{rank}" for rank in range(1, len(group.get("players") or []) + 1)]})
    swaps = config.get("swaps") or {}

    def entry(item, seed_rank: int = 1):
        if not item:
            return None
        group, label = item
        rank = label[len(group):] if label.startswith(group) else ""
        return {"label": label, "group": group, "seed": rank == str(seed_rank)}

    if fmt == "main":
        lines = group_draw_lines(draw_groups, qualifiers=config["qualifiers"], consolation=config["consolation"])
        for key, seed_rank in (("main", 1), ("consolation", config["qualifiers"] + 1)):
            if lines.get(key):
                result["draws"].append({"key": key, "lines": [entry(item, seed_rank) for item in swap_lines(lines[key], swaps.get(key))]})
    elif fmt == "cross":
        lines = cross_draw_lines(draw_groups) if len(draw_groups) >= 2 else []
        result["draws"].append({"key": "main", "lines": [entry(item) for item in swap_lines(lines, swaps.get("main"))]})
    elif fmt == "direct":
        names = brackets._group_competitor_names(unit["groups"][0])
        lines = direct_draw_lines(names)
        byes = len(lines) - len(names)
        seeds = set(names[:byes]) if byes > 0 else set()
        result["draws"].append({"key": "main", "lines": [
            {"label": name, "group": "", "seed": name in seeds} if name else None
            for name in swap_lines(lines, swaps.get("main"))
        ]})
    elif fmt == "table":
        ranking = draw_groups[0]["ranking"] if draw_groups else []
        result["table"] = [{"phase": "final", "a": ranking[0], "b": ranking[1]}] if len(ranking) >= 2 else []
        if config["places"] != "none" and len(ranking) >= 4:
            result["table"].append({"phase": "third", "a": ranking[2], "b": ranking[3]})

    counts = {group["name"]: len(group.get("players") or []) for group in groups}
    slots = []
    for item in units:
        slots.extend(brackets._formatted_unit_slots(item, config, complete=False, counts=counts) or [])
    main_rounds = ("Finał", "Półfinał", "Ćwierćfinał")
    placements: Dict[str, int] = {}
    for slot in slots:
        suffix = str(slot["phase"]).rsplit(" — ", 1)[-1]
        if suffix.startswith("Pocieszenie"):
            result["consolation_matches"] += 1
            continue
        result["main_matches"] += 1
        if suffix not in main_rounds and not suffix.startswith("1/"):
            placements[suffix] = placements.get(suffix, 0) + 1
    result["placements"] = [{"phase": phase, "matches": count} for phase, count in placements.items()]
    result["matches"] = len(slots)
    return result


def knockout_format_overview(tournament_id: int, drafts: Optional[Dict[str, Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """Every active category with its allowed formats, chosen config and a draw preview."""
    brackets = _brackets()
    from .categories import fetch_tournament_categories

    stored = brackets.load_knockout_formats(tournament_id)
    groups = brackets.fetch_bracket_groups(tournament_id)
    units = _category_units(tournament_id)
    knockout_rows = brackets.fetch_bracket_knockout(tournament_id)
    overview = []
    for category in fetch_tournament_categories(tournament_id, active_only=True):
        key = str(category["id"])
        category_groups = [group for group in groups if str(group.get("tournament_category_id")) == key]
        category_units = units.get(key, [])
        expected = brackets.KNOCKOUT_UNIT_FORMAT.get(category_units[0]["type"], "none") if category_units else "none"
        allowed = [expected, "none"] if expected != "none" else ["none"]
        sizes = [len(group.get("players") or []) for group in category_groups if group.get("play_format") != "knockout"]
        raw = (drafts or {}).get(key) or stored.get(key) or default_config(expected)
        config = normalize_config(raw, allowed=allowed, expected=expected, max_qualifiers=min(sizes) if sizes else 2)
        prefixes = sorted({str(unit.get("label") or "") for unit in category_units} | {category.get("label") or ""})
        locked = any(row.get("winner_name") and _phase_in_category(row.get("phase"), prefixes) for row in knockout_rows)
        overview.append({
            "category_id": category["id"],
            "label": category.get("label") or "",
            "is_doubles": bool(category.get("is_doubles")),
            "groups": [{"name": group["name"], "letter": _group_letter(group["name"]), "size": len(group.get("players") or []), "play_format": group.get("play_format")} for group in category_groups],
            "allowed_formats": allowed,
            "default_format": expected,
            "saved": key in stored,
            "config": config,
            "locked": locked,
            "preview": _preview(category, category_units, category_groups, config),
        })
    return overview


def _effective(config: Dict[str, Any]) -> str:
    return json.dumps({k: config.get(k) for k in ("format", "qualifiers", "places", "consolation", "swaps")}, sort_keys=True)


def save_knockout_format(tournament_id: int, category_id: int, raw: Dict[str, Any]) -> Dict[str, Any]:
    """Store a category's format; rebuild its draw when the draw itself changes."""
    brackets = _brackets()
    key = str(int(category_id))
    current = next((item for item in knockout_format_overview(tournament_id) if str(item["category_id"]) == key), None)
    if current is None:
        return {"error": "category_not_found"}
    config = normalize_config(
        raw,
        allowed=current["allowed_formats"],
        expected=current["default_format"],
        max_qualifiers=min([group["size"] for group in current["groups"] if group.get("play_format") != "knockout"] or [2]),
    )
    changed = _effective(config) != _effective(current["config"])
    if changed and current["locked"]:
        return {"error": "locked"}
    stored = brackets.load_knockout_formats(tournament_id)
    stored[key] = config
    upsert_app_settings({brackets.knockout_formats_settings_key(tournament_id): json.dumps(stored)})
    if changed:
        _rebuild_category_draw(tournament_id, category_id)
    logger.info("knockout_format_saved", tournament_id=tournament_id, category_id=category_id, format=config["format"], rebuilt=changed)
    return {"status": "ok", "rebuilt": changed}


def confirm_all_knockout_formats(tournament_id: int) -> Dict[str, Any]:
    """Confirm the current (or automatic) format of every category that is not locked."""
    confirmed = 0
    for item in knockout_format_overview(tournament_id):
        if item["config"].get("confirmed"):
            continue
        result = save_knockout_format(tournament_id, item["category_id"], {**item["config"], "confirmed": True})
        if result.get("status") == "ok":
            confirmed += 1
    return {"status": "ok", "confirmed": confirmed}


def _rebuild_category_draw(tournament_id: int, category_id: int) -> None:
    """Drop the category's knockout slots and unplayed knockout schedule rows, then rebuild."""
    brackets = _brackets()
    units = _category_units(tournament_id).get(str(int(category_id)), [])
    from .categories import fetch_tournament_category

    category = fetch_tournament_category(category_id) or {}
    prefixes = sorted({str(unit.get("label") or "") for unit in units} | {category.get("label") or ""})
    slots = _category_slots_with_results(tournament_id, prefixes)
    ids = [int(slot["id"]) for slot in slots if slot.get("id")]
    if ids:
        placeholders = ",".join("?" for _ in ids)
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"DELETE FROM tournament_schedule WHERE tournament_id = ? AND source_type = 'knockout' "
                f"AND match_id IS NULL AND source_ref_id IN ({placeholders})",
                (tournament_id, *ids),
            )
            cursor.execute(f"DELETE FROM bracket_knockout WHERE tournament_id = ? AND id IN ({placeholders})", (tournament_id, *ids))
            conn.commit()
    brackets.seed_provisional_knockout_from_groups(tournament_id)
    brackets.maybe_generate_knockout_from_completed_groups(tournament_id)
