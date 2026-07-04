"""Tournament competition categories (distinct from player classification B1–B4)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# Preset keys for checkbox UI — labels are defaults; user may edit before confirm.
CATEGORY_PRESET_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "B1M": {"label": "B1 Mężczyźni", "hint_bands": ["B1"], "gender_hint": "M"},
    "B1K": {"label": "B1 Kobiety", "hint_bands": ["B1"], "gender_hint": "K"},
    "B2M": {"label": "B2 Mężczyźni", "hint_bands": ["B2"], "gender_hint": "M"},
    "B2K": {"label": "B2 Kobiety", "hint_bands": ["B2"], "gender_hint": "K"},
    "B3M": {"label": "B3 Mężczyźni", "hint_bands": ["B3"], "gender_hint": "M"},
    "B3K": {"label": "B3 Kobiety", "hint_bands": ["B3"], "gender_hint": "K"},
    "B4M": {"label": "B4 Mężczyźni", "hint_bands": ["B4"], "gender_hint": "M"},
    "B4K": {"label": "B4 Kobiety", "hint_bands": ["B4"], "gender_hint": "K"},
}

PRESET_KEYS = list(CATEGORY_PRESET_DEFAULTS.keys())


def preset_defaults(preset_key: str) -> Optional[Dict[str, Any]]:
    key = str(preset_key or "").strip().upper()
    return dict(CATEGORY_PRESET_DEFAULTS[key]) if key in CATEGORY_PRESET_DEFAULTS else None


def normalize_hint_bands(values: Any) -> List[str]:
    if not values:
        return []
    if isinstance(values, str):
        values = [part.strip() for part in values.replace("/", ",").split(",")]
    bands: List[str] = []
    for value in values:
        raw = str(value or "").strip().upper().replace("/", "")
        if raw in {"B1", "B2", "B3", "B4", "B34"} and raw not in bands:
            bands.append(raw)
    return bands


def infer_mixed_player_bands(categories: List[Dict[str, Any]] | None) -> List[str]:
    """Derive legacy mixed player-band codes (B2, B34, …) from tournament categories."""
    from .categories import normalize_category_code

    bands: List[str] = []
    for cat in categories or []:
        if int(cat.get("is_active") or 0) == 0:
            continue
        raw_label = str(cat.get("label") or "")
        label = raw_label.lower()
        hints = normalize_hint_bands(cat.get("hint_bands") or [])
        is_mixed = (
            "mixed" in label
            or "mix" in label.replace("/", " ").split()
            or len(hints) > 1
            or "B34" in hints
        )
        if not is_mixed:
            continue
        if not hints:
            hints = [normalize_category_code(raw_label.split()[0])] if raw_label else []
            hints = [hint for hint in hints if hint]
        for hint in hints:
            if hint not in bands:
                bands.append(hint)
        if "B3" in hints and "B4" in hints and "B34" not in bands:
            bands.append("B34")
    return bands


def category_row_payload(row: Any) -> Dict[str, Any]:
    import json

    hint_raw = row["hint_bands"] if "hint_bands" in row.keys() else "[]"
    try:
        hint_bands = json.loads(hint_raw) if hint_raw else []
        if not isinstance(hint_bands, list):
            hint_bands = []
    except (ValueError, TypeError):
        hint_bands = []
    return {
        "id": int(row["id"]),
        "tournament_id": int(row["tournament_id"]),
        "label": str(row["label"] or ""),
        "preset_key": str(row["preset_key"] or ""),
        "sort_order": int(row["sort_order"] or 0),
        "is_active": int(row["is_active"] or 0),
        "hint_bands": hint_bands,
        "player_count": int(row["player_count"] if "player_count" in row.keys() else 0),
        "group_count": int(row["group_count"] if "group_count" in row.keys() else 0),
    }
