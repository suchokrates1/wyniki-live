"""Shared tournament category helpers."""

from __future__ import annotations

import json
from typing import Any, Iterable

_MIXED_SECTION_LABELS = frozenset({
    'mixed',
    'mix',
    'mieszane',
    'mieszana',
    'mieszany',
    'misto',
    'mezclado',
    'melange',
})


def normalize_category_code(value: Any) -> str:
    raw = str(value or '').strip().upper()
    if not raw:
        return ''
    cleaned = ''.join(ch for ch in raw if ch.isalnum())
    if cleaned in {'K', 'M'}:
        return ''
    return cleaned


def normalize_player_classification(value: Any) -> str:
    """Player skill band only (B1–B4). B34 is a tournament bucket, not a player category."""
    code = normalize_category_code(value)
    if code in {'B1', 'B2', 'B3', 'B4'}:
        return code
    return ''


def normalize_mixed_categories(values: Iterable[Any] | None) -> list[str]:
    normalized: list[str] = []
    for value in values or []:
        code = normalize_category_code(value)
        if code and code not in normalized:
            normalized.append(code)
    return normalized


def is_mixed_category(category: Any, mixed_categories: Iterable[Any] | None = None) -> bool:
    code = normalize_category_code(category)
    if not code:
        return False
    allowed = set(normalize_mixed_categories(mixed_categories))
    return code in allowed


def is_mixed_section_label(value: Any) -> bool:
    raw = str(value or '').strip().lower()
    if not raw:
        return False
    normalized = raw.replace('/', '').replace('-', ' ').strip()
    return normalized in _MIXED_SECTION_LABELS


def format_category_display(category: Any) -> str:
    code = normalize_category_code(category)
    if code == 'B34':
        return 'B3/4'
    return code


def mixed_category_label(category: Any = 'B34') -> str:
    return f'{format_category_display(category)} Mixed'


def start_group_key(
    category: Any,
    gender: Any,
    mixed_categories: Iterable[Any] | None = None,
) -> str:
    cat = normalize_category_code(category)
    if is_mixed_category(cat, mixed_categories):
        return cat or 'NIEPRZYPISANI'
    gender_code = str(gender or '').strip().upper()
    if gender_code in {'K', 'F', 'W'}:
        gender_code = 'K'
    elif gender_code != 'M':
        gender_code = ''
    if cat and gender_code:
        return f'{cat}{gender_code}'
    return cat or gender_code or 'NIEPRZYPISANI'
