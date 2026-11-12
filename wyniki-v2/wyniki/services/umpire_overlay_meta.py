"""Overlay phase/category resolution from schedule, bracket group, and player entries."""
from __future__ import annotations

from ..database import (
    _split_bracket_label,
    fetch_bracket_groups,
    fetch_tournament_category,
    fetch_tournament_schedule,
    first_row_where,
)
from ..db_models import Player


def _schedule_context_for_match(tournament_id: int | None, schedule_id: int | None) -> dict | None:
    if not tournament_id or not schedule_id:
        return None
    return next(
        (
            entry
            for entry in fetch_tournament_schedule(tournament_id)
            if int(entry.get("id") or 0) == int(schedule_id)
        ),
        None,
    )


def _apply_live_overlay_meta(
    court_state: dict,
    *,
    phase: str | None = None,
    category: str | None = None,
) -> None:
    meta = court_state.setdefault("history_meta", {})
    if phase:
        meta["phase"] = phase
    if category:
        meta["category"] = category


def _resolve_live_overlay_category(
    tournament_id: int | None,
    schedule_entry: dict | None,
    bracket_ctx: dict | None,
    player1_name: str | None,
    player2_name: str | None,
) -> str | None:
    if schedule_entry:
        name = str(schedule_entry.get("category_name") or "").strip()
        if name:
            return name
        prefix, _ = _split_bracket_label(schedule_entry.get("group_name") or "")
        if prefix:
            return prefix

    group_id = (bracket_ctx or {}).get("group_id")
    if tournament_id and group_id:
        for group in fetch_bracket_groups(tournament_id) or []:
            if int(group.get("id") or 0) != int(group_id):
                continue
            prefix, _ = _split_bracket_label(group.get("name") or "")
            if prefix:
                return prefix
            cat_id = group.get("tournament_category_id")
            if cat_id:
                category = fetch_tournament_category(int(cat_id))
                if category:
                    label = str(category.get("label") or category.get("name") or "").strip()
                    if label:
                        return label
            break

    if tournament_id and player1_name and player2_name:
        p1 = first_row_where(Player, tournament_id=tournament_id, name=player1_name)
        p2 = first_row_where(Player, tournament_id=tournament_id, name=player2_name)
        if p1 and p2 and p1.category and p1.category == p2.category:
            band = str(p1.category).strip().upper()
            g1 = str(p1.gender or "").upper()
            g2 = str(p2.gender or "").upper()
            if g1 in {"F", "K"} and g2 in {"F", "K"}:
                return f"{band} Women"
            if g1 == "M" and g2 == "M":
                return f"{band} Men"
            return band
    return None


def _refresh_live_overlay_meta_from_match(court_state: dict, match) -> None:
    if not match:
        return
    schedule_entry = _schedule_context_for_match(match.tournament_id, match.schedule_id)
    bracket_ctx = {"group_id": match.bracket_group_id, "phase": match.phase}
    _apply_live_overlay_meta(
        court_state,
        phase=match.phase or (schedule_entry or {}).get("phase"),
        category=_resolve_live_overlay_category(
            match.tournament_id,
            schedule_entry,
            bracket_ctx,
            match.player1_name,
            match.player2_name,
        ) or court_state.get("history_meta", {}).get("category"),
    )
