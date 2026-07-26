"""Thin service helpers for tournament lifecycle (groups → schedule → rematch → KO).

Keeps office/admin routes free of repeated orchestration glue. No schema changes.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from ..database import (
    ensure_group_rematch_schedule_entries,
    ensure_group_schedule_entries,
    ensure_knockout_schedule_entries,
    fetch_bracket_groups,
    fetch_bracket_knockout,
    maybe_generate_knockout_from_completed_groups,
    upsert_tournament_schedule_entries,
)


class TournamentLifecycleError(ValueError):
    pass


def seed_group_schedule(tournament_id: int) -> Dict[str, Any]:
    """Ensure group-stage schedule rows exist for all bracket groups."""
    groups = fetch_bracket_groups(tournament_id) or []
    created = ensure_group_schedule_entries(tournament_id) or []
    count = len(created) if isinstance(created, list) else int(created or 0)
    return {
        "tournament_id": tournament_id,
        "groups": len(groups),
        "schedule_entries": count,
    }


def seed_rematch_schedule(tournament_id: int, group_ids: Sequence[int]) -> Dict[str, Any]:
    """Ensure rematch schedule entries for selected groups."""
    ids = [int(g) for g in group_ids]
    if not ids:
        raise TournamentLifecycleError("group_ids required for rematch schedule")
    result = ensure_group_rematch_schedule_entries(tournament_id, ids)
    if isinstance(result, dict):
        return {"tournament_id": tournament_id, **result}
    return {
        "tournament_id": tournament_id,
        "rematch_entries": len(result) if isinstance(result, list) else result,
    }


def seed_knockout_schedule(tournament_id: int) -> Dict[str, Any]:
    """Ensure KO schedule rows; optionally generate KO when groups complete."""
    generated = maybe_generate_knockout_from_completed_groups(tournament_id)
    ko = fetch_bracket_knockout(tournament_id) or []
    entries = ensure_knockout_schedule_entries(tournament_id) or []
    return {
        "tournament_id": tournament_id,
        "knockout_slots": len(ko) if isinstance(ko, list) else 0,
        "generated": bool(generated),
        "schedule_entries": len(entries) if isinstance(entries, list) else entries,
    }


def lifecycle_snapshot(tournament_id: int) -> Dict[str, Any]:
    """Read-only summary for tests / smoke."""
    groups = fetch_bracket_groups(tournament_id) or []
    knockout = fetch_bracket_knockout(tournament_id) or []
    return {
        "tournament_id": tournament_id,
        "group_count": len(groups) if isinstance(groups, list) else 0,
        "knockout_count": len(knockout) if isinstance(knockout, list) else 0,
    }


def replace_schedule(tournament_id: int, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Upsert a full schedule payload (admin/office generate path)."""
    if not isinstance(entries, list):
        raise TournamentLifecycleError("entries must be a list")
    result = upsert_tournament_schedule_entries(tournament_id, entries)
    return {"tournament_id": tournament_id, "result": result}
