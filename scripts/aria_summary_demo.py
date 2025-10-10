#!/usr/bin/env python3
"""Utility to preview the aria-label text for a sample court card."""
from __future__ import annotations

import re
from typing import Dict, Iterable, Tuple


TRANSLATIONS: Dict[str, Dict[str, object]] = {
    "pl": {
        "table": {
            "columns": {
                "points": "Punkty",
                "tieBreak": "Tie Break",
                "superTieBreak": "Super TB",
                "set1": "Set 1",
                "set2": "Set 2",
            },
        },
        "accessibility": {
            "versus": "kontra",
            "points": "punkty",
            "tieBreak": "tie-break",
            "superTieBreak": "super tie-break",
            "set": "Set {number}",
            "active": "aktywny",
        },
    }
}


def format_template(template: str, **values: object) -> str:
    return template.format(**values)


def resolve_accessibility_strings(lang: str = "pl") -> Dict[str, str]:
    translation = TRANSLATIONS[lang]
    acc = dict(translation.get("accessibility", {}))
    columns = dict(translation.get("table", {}).get("columns", {}))

    versus = acc.get("versus") or "kontra"
    raw_points = acc.get("points") or columns.get("points") or "Points"
    points = re.sub(r"\s*\(.*?\)\s*", " ", raw_points).strip() or "Points"
    tie_break = acc.get("tieBreak") or columns.get("tieBreak") or "tie-break"
    super_tie_break = (
        acc.get("superTieBreak")
        or columns.get("superTieBreak")
        or f"super {tie_break}"
    )

    set_template = acc.get("set")
    if not set_template:
        raw_set = columns.get("set1")
        if isinstance(raw_set, str):
            cleaned = raw_set.split("(")[0].strip()
            replaced = re.sub(r"\d+", "{number}", cleaned, count=1)
            if replaced and "{number}" in replaced:
                set_template = replaced
    if not set_template or "{number}" not in set_template:
        set_template = "Set {number}"

    active = acc.get("active") or "active"
    return {
        "versus": versus,
        "points": points,
        "tieBreak": tie_break,
        "superTieBreak": super_tie_break,
        "setTemplate": set_template,
        "active": active,
    }


def normalize_points_display(value: object) -> str:
    if value is None:
        return "0"
    text = str(value).strip()
    if not text or text == "-":
        return "0"
    return text


def summary_for_sets(
    acc: Dict[str, str],
    current_set: int,
    sets: Iterable[Tuple[int, object, object]],
    column_labels: Dict[str, str],
) -> Iterable[str]:
    for index, a_val, b_val in sets:
        safe_a = "0" if a_val in (None, "") else str(a_val).strip() or "0"
        safe_b = "0" if b_val in (None, "") else str(b_val).strip() or "0"
        try:
            a_num = int(safe_a)
        except ValueError:
            a_num = 0
        try:
            b_num = int(safe_b)
        except ValueError:
            b_num = 0
        include = index == 1 or current_set >= index or a_num > 0 or b_num > 0
        if not include:
            continue
        label = column_labels.get(f"set{index}", "").strip()
        if not label:
            label = format_template(acc["setTemplate"], number=index)
        is_active = current_set == index
        if is_active:
            yield f"{label}, {acc['active']}, {safe_a}:{safe_b}"
        else:
            yield f"{label} {safe_a}:{safe_b}"


def build_summary(lang: str = "pl") -> str:
    acc = resolve_accessibility_strings(lang)
    columns = TRANSLATIONS[lang]["table"]["columns"]

    kort_state = {
        "current_set": 2,
        "tie": {"visible": False},
        "A": {"full_name": "Kowalski", "points": "30", "set1": 4, "set2": 1},
        "B": {"full_name": "Nowak", "points": "20", "set1": 0, "set2": 3},
    }

    name_a = kort_state["A"].get("full_name") or "Gracz A"
    name_b = kort_state["B"].get("full_name") or "Gracz B"
    versus_line = f"{name_a} {acc['versus']} {name_b}"

    tie_visible = bool(kort_state["tie"].get("visible"))
    is_super_tie = tie_visible and kort_state.get("current_set") == 3

    points_label = (
        acc["superTieBreak"]
        if is_super_tie
        else (acc["tieBreak"] if tie_visible else columns.get("points", acc["points"]))
    )
    if not points_label:
        points_label = acc["points"]
    points_a = normalize_points_display(kort_state["A"].get("points"))
    points_b = normalize_points_display(kort_state["B"].get("points"))
    points_line = f"{points_label} {points_a}:{points_b}"

    set_iter = (
        (1, kort_state["A"].get("set1"), kort_state["B"].get("set1")),
        (2, kort_state["A"].get("set2"), kort_state["B"].get("set2")),
    )
    set_lines = list(
        summary_for_sets(
            acc,
            int(kort_state.get("current_set", 1)),
            set_iter,
            columns,
        )
    )
    parts = [versus_line, points_line, *set_lines]
    return "\n".join(parts)


if __name__ == "__main__":
    print(build_summary())
