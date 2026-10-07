"""What the admin and the office both do to a tournament's categories and players.

The admin reaches a tournament by its id, the office by its slot and password; past
that door the work is the same, so it is written once here. Each category call returns
the JSON body and the status, and the blueprint decides how to send it.
"""
from __future__ import annotations

from typing import Any

from ..database import (
    confirm_tournament_categories,
    delete_tournament_category,
    fetch_bracket_groups,
    fetch_tournament_categories,
    fetch_tournament_category,
    fetch_tournament_schedule,
    insert_tournament_category,
    migrate_tournament_categories_from_legacy,
    update_tournament_category,
)

Reply = tuple[dict[str, Any], int]


def list_categories(tournament_id: int) -> Reply:
    categories = fetch_tournament_categories(tournament_id)
    if not categories and fetch_bracket_groups(tournament_id):
        categories = migrate_tournament_categories_from_legacy(tournament_id)
    return {"categories": categories}, 200


def confirm_categories(tournament_id: int, data: dict[str, Any]) -> Reply:
    entries = data.get("categories") or data.get("entries") or []
    if not isinstance(entries, list) or not entries:
        return {"error": "categories required"}, 400
    try:
        categories = confirm_tournament_categories(tournament_id, entries, replace=bool(data.get("replace")))
    except ValueError as exc:
        return {"error": str(exc)}, 409
    return {"categories": categories}, 200


def _hint_bands(data: dict[str, Any]) -> list | None:
    return data.get("hint_bands") if isinstance(data.get("hint_bands"), list) else None


def create_category(tournament_id: int, data: dict[str, Any]) -> Reply:
    label = str(data.get("label") or "").strip()
    if not label:
        return {"error": "label required"}, 400
    category = insert_tournament_category(
        tournament_id,
        label=label,
        preset_key=str(data.get("preset_key") or ""),
        hint_bands=_hint_bands(data),
        is_doubles=data.get("is_doubles", False),
    )
    if not category:
        return {"error": "Failed to create category"}, 500
    return {"category": category, "categories": fetch_tournament_categories(tournament_id)}, 201


def update_category(tournament_id: int, category_id: int, data: dict[str, Any]) -> Reply:
    # checked before the write: a category of another tournament stays untouched
    existing = fetch_tournament_category(category_id)
    if not existing or int(existing.get("tournament_id") or 0) != tournament_id:
        return {"error": "Category not found"}, 404
    category = update_tournament_category(
        category_id,
        label=data.get("label") if "label" in data else None,
        hint_bands=_hint_bands(data),
        sort_order=data.get("sort_order"),
        is_active=data.get("is_active") if "is_active" in data else None,
        is_doubles=data.get("is_doubles") if "is_doubles" in data else None,
    )
    if not category or int(category.get("tournament_id") or 0) != tournament_id:
        return {"error": "Category not found"}, 404
    return {
        "category": category,
        "categories": fetch_tournament_categories(tournament_id),
        "groups": fetch_bracket_groups(tournament_id),
        "schedule": fetch_tournament_schedule(tournament_id),
    }, 200


def delete_category(tournament_id: int, category_id: int) -> Reply:
    existing = fetch_tournament_category(category_id)
    if not existing or int(existing.get("tournament_id") or 0) != tournament_id:
        return {"error": "Category not found"}, 404
    if not delete_tournament_category(category_id):
        return {"error": "Failed to delete category"}, 500
    return {"categories": fetch_tournament_categories(tournament_id)}, 200


def player_names(data: dict[str, Any]) -> tuple[str, str, str] | None:
    """Display name, first and last name from a player form; None when there is no name at all.

    A form that sends only `name` has it split at the last space, so "Anna Maria Nowak"
    keeps "Anna Maria" as the first name.
    """
    first_name = str(data.get("first_name") or "").strip()
    last_name = str(data.get("last_name") or "").strip()
    name = str(data.get("name") or "").strip()
    if not first_name and not last_name:
        if not name:
            return None
        first, _, last = name.rpartition(" ")
        first_name, last_name = first, last
    return name or f"{first_name} {last_name}".strip(), first_name, last_name
