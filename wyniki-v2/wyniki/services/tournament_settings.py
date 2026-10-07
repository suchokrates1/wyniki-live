"""Creating a tournament and changing its settings, for the admin and the series organizer.

Both call these with a payload they have already checked; a function answers with a
(body, status) pair so a route only has to jsonify it.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from ..config import settings
from ..database import (
    create_tournament_courts,
    fetch_courts,
    fetch_courts_for_tournament,
    fetch_tournament,
    get_row,
    insert_tournament,
    set_active_tournament,
    sync_tournament_courts,
    update_tournament,
)
from ..database.tournament_titles import save_tournament_title
from ..db_models import Tournament
from .office_workflow import _normalize_bool, _normalize_int

Result = tuple[dict[str, Any], int]


def normalize_flags(data: dict[str, Any]) -> tuple[bool, bool, bool, str]:
    is_simulation = _normalize_bool(data.get('is_simulation', False))
    is_public = _normalize_bool(data.get('is_public', not is_simulation))
    stats_enabled = _normalize_bool(data.get('stats_enabled', not is_simulation))
    if is_simulation:
        is_public = False
        stats_enabled = False
    access_key = (data.get('access_key') or '').strip()
    return is_public, stats_enabled, is_simulation, access_key


def office_password_hash(raw_password: Any, *, existing_hash: str = '', is_simulation: bool = False, is_create: bool = False) -> str:
    password = str(raw_password or '').strip()
    if is_simulation and not password and (is_create or not existing_hash):
        password = 'test'
    if password:
        return generate_password_hash(password)
    return existing_hash or ''


def save_logo(uploaded_file, tournament_name: str) -> str | None:
    """Save an uploaded tournament logo and return its public path."""
    if not uploaded_file or not uploaded_file.filename:
        return None
    logos_dir = Path(settings.database_path).parent / 'tournament-logos'
    logos_dir.mkdir(parents=True, exist_ok=True)
    extension = Path(secure_filename(uploaded_file.filename)).suffix.lower() or '.png'
    stem = secure_filename(tournament_name) or 'tournament'
    file_name = f"{stem}-{uuid4().hex[:8]}{extension}"
    uploaded_file.save(logos_dir / file_name)
    return f"/data/tournament-logos/{file_name}"


def _refresh_live_courts() -> None:
    from .court_manager import refresh_courts_from_db

    refresh_courts_from_db(fetch_courts(active_only=True))


def create_from(data: dict[str, Any], logo=None) -> Result:
    name = (data.get('name') or '').strip()
    start_date = (data.get('start_date') or '').strip()
    end_date = (data.get('end_date') or '').strip()
    if not all([name, start_date, end_date]):
        return {"error": "Missing required fields"}, 400
    active = _normalize_bool(data.get('active', False))
    is_public, stats_enabled, is_simulation, access_key = normalize_flags(data)
    tournament_id = insert_tournament(
        name,
        start_date,
        end_date,
        active=active,
        city=(data.get('city') or '').strip(),
        country=(data.get('country') or '').strip().upper(),
        logo_path=save_logo(logo, name),
        report_email=(data.get('report_email') or '').strip(),
        is_public=is_public,
        stats_enabled=stats_enabled,
        is_simulation=is_simulation,
        access_key=access_key,
        office_password_hash=office_password_hash(data.get('office_password'), is_simulation=is_simulation, is_create=True),
    )
    if not tournament_id:
        return {"error": "Failed to create tournament"}, 500
    created_courts = create_tournament_courts(tournament_id, _normalize_int(data.get('court_count'), 0))
    if active:
        set_active_tournament(tournament_id)
    _refresh_live_courts()
    return {"id": tournament_id, "message": "Tournament created", "created_courts": created_courts}, 201


def _busy_courts_to_remove(tournament_id: int, requested: int) -> list[str]:
    from .court_manager import get_court_state

    current = fetch_courts_for_tournament(tournament_id)
    if requested >= len(current):
        return []
    removable = sorted(
        current,
        key=lambda court: (int(court.get('display_order') or 0), str(court.get('kort_id') or '')),
        reverse=True,
    )[: len(current) - requested]
    busy = []
    for court in removable:
        kort_id = str(court.get('kort_id') or '')
        state = get_court_state(kort_id)
        if state and state.get('match_status', {}).get('active'):
            busy.append(kort_id)
    return busy


def update_from(tournament_id: int, data: dict[str, Any], logo=None) -> Result:
    existing = fetch_tournament(tournament_id)
    if not existing:
        return {"error": "Tournament not found"}, 404
    existing_row = get_row(Tournament, tournament_id)

    name = (data.get('name') or '').strip()
    start_date = (data.get('start_date') or '').strip()
    end_date = (data.get('end_date') or '').strip()
    if not all([name, start_date, end_date]):
        return {"error": "Missing required fields"}, 400
    requested_court_count = _normalize_int(data.get('court_count'), existing.get('court_count') or 0)
    if requested_court_count < 0:
        return {"error": "Court count cannot be negative"}, 400
    busy = _busy_courts_to_remove(tournament_id, requested_court_count)
    if busy:
        return {"error": f"Cannot remove active courts: {', '.join(busy)}"}, 400

    active = _normalize_bool(data.get('active', False))
    is_public, stats_enabled, is_simulation, access_key = normalize_flags(data)
    logo_path = save_logo(logo, name) if logo else existing.get('logo_path')
    success = update_tournament(
        tournament_id,
        name,
        start_date,
        end_date,
        active,
        city=(data.get('city') or '').strip(),
        country=(data.get('country') or '').strip().upper(),
        logo_path=logo_path,
        report_email=(data.get('report_email') or '').strip(),
        is_public=is_public,
        stats_enabled=stats_enabled,
        is_simulation=is_simulation,
        access_key=access_key,
        office_password_hash=office_password_hash(
            data.get('office_password'),
            existing_hash=existing_row.office_password_hash if existing_row else '',
            is_simulation=is_simulation,
        ),
    )
    if not success:
        return {"error": "Failed to update tournament"}, 500
    save_tournament_title(tournament_id, data.get('title_scope'), data.get('title_override'))
    court_changes = sync_tournament_courts(tournament_id, requested_court_count)
    _refresh_live_courts()
    if active:
        set_active_tournament(tournament_id)
    return {
        "message": "Tournament updated",
        "created_courts": court_changes["created"],
        "deleted_courts": court_changes["deleted"],
    }, 200
