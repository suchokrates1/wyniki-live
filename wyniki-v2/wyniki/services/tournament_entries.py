"""A tournament's entries and the shared player base, for the admin and the series organizer.

Each function takes an already checked tournament (or player) and a payload, and answers
(body, status). The admin's routes still insist on an active tournament; the organizer
prepares tournaments ahead, so the organizer's routes do not.
"""
from __future__ import annotations

from typing import Any

from ..api import tournament_setup
from ..api.player_import import (
    _normalize_import_category,
    _normalize_import_country,
    _normalize_import_gender,
    _parse_import_players_with_ai,
    _summarize_import_players,
)
from ..config import logger
from ..database import (
    add_row,
    bulk_insert_players,
    classifications,
    commit_writes,
    delete_player,
    entry_of_global_player_in_tournament,
    fetch_tournament_categories,
    forget_row,
    get_planning_mixed_bands,
    get_row,
    insert_player,
    update_player,
    write_session,
)
from ..db_models import GlobalPlayer
from .player_registry import create_tournament_player

Result = tuple[Any, int]
PLAYER_FIELDS = ("first_name", "last_name", "gender", "birth_date", "country", "category", "notes")


def add_entry(tournament_id: int, data: dict[str, Any]) -> Result:
    names = tournament_setup.player_names(data)
    if not names:
        return {"error": "Name is required"}, 400
    name, first_name, last_name = names
    player_id = insert_player(tournament_id, name, data.get('category', ''), data.get('country', ''),
                              first_name=first_name, last_name=last_name, gender=data.get('gender', ''))
    if not player_id:
        return {"error": "Failed to add player"}, 500
    return {"id": player_id, "message": "Player added"}, 201


def update_entry(tournament_id: int, player_id: int, data: dict[str, Any]) -> Result:
    names = tournament_setup.player_names(data)
    if not names:
        return {"error": "Name is required"}, 400
    name, first_name, last_name = names
    if not update_player(player_id, name, data.get('category', ''), data.get('country', ''),
                         first_name=first_name, last_name=last_name, gender=data.get('gender', ''),
                         tournament_id=tournament_id):
        return {"error": "Player not found in tournament"}, 404
    return {"message": "Player updated"}, 200


def delete_entry(tournament_id: int, player_id: int) -> Result:
    if not delete_player(player_id, tournament_id=tournament_id):
        return {"error": "Player not found in tournament"}, 404
    return {"message": "Player deleted"}, 200


def parse_import(tournament_id: int, data: dict[str, Any]) -> Result:
    text = data.get('text', '')
    if not text:
        return {"error": "No text provided"}, 400
    players_data = _parse_import_players_with_ai(text, get_planning_mixed_bands(tournament_id))
    if not players_data:
        return {"error": "No valid players found"}, 400
    return {
        'players': players_data,
        'tournament_categories': fetch_tournament_categories(tournament_id),
        'summary': _summarize_import_players(players_data),
        'needs_attention_count': sum(1 for player in players_data if player.get('warnings')),
        'count': len(players_data),
    }, 200


def bulk_import(tournament_id: int, data: dict[str, Any]) -> Result:
    players_data = []
    for item in data.get('players', []) or []:
        name = str(item.get('name', '')).strip()
        first_name = str(item.get('first_name', '')).strip()
        last_name = str(item.get('last_name', '')).strip()
        if not first_name and not last_name:
            if not name:
                continue
            first_name, _, last_name = name.rpartition(' ')
        players_data.append({
            "name": name or f"{first_name} {last_name}".strip(),
            "first_name": first_name,
            "last_name": last_name,
            "category": _normalize_import_category(item.get('category', '')).strip(),
            "country": _normalize_import_country(item.get('country', '')).strip(),
            "gender": _normalize_import_gender(item.get('gender', '')).strip(),
        })
    if not players_data:
        return {"error": "No valid players found"}, 400
    count = bulk_insert_players(tournament_id, players_data)
    return {"message": f"Imported {count} players", "count": count}, 200


def add_global_entry(tournament_id: int, data: dict[str, Any]) -> Result:
    gp_id = data.get('global_player_id')
    if not gp_id:
        return {'error': 'global_player_id is required'}, 400
    gp = get_row(GlobalPlayer, gp_id)
    if not gp:
        return {'error': 'Global player not found'}, 404
    if entry_of_global_player_in_tournament(tournament_id, gp_id):
        return {'error': 'Player already in this tournament'}, 409
    entry = create_tournament_player(
        write_session(),
        tournament_id=tournament_id,
        name=gp.full_name,
        first_name=gp.first_name,
        last_name=gp.last_name,
        gender=gp.gender or '',
        category=str(data.get('category', '')).strip() or gp.category or '',
        country=gp.country or '',
        global_player=gp,
    )
    commit_writes()
    logger.info("global_player_added_to_tournament", gp_id=gp_id, tournament_id=tournament_id, player_id=entry.id)
    return entry.to_dict(), 201


def create_global_player(data: dict[str, Any]) -> Result:
    first_name = str(data.get('first_name', '')).strip()
    last_name = str(data.get('last_name', '')).strip()
    if not last_name:
        return {'error': 'last_name is required'}, 400
    gp = GlobalPlayer(
        first_name=first_name,
        last_name=last_name,
        gender=classifications.normalize_gender(data.get('gender', '')),
        birth_date=str(data.get('birth_date', '')).strip() or None,
        country=str(data.get('country', '')).strip(),
        category=classifications.normalize_class(data.get('category', '')) or str(data.get('category', '')).strip(),
        notes=str(data.get('notes', '')).strip() or None,
    )
    add_row(gp)
    commit_writes()
    logger.info("global_player_created", id=gp.id, name=gp.full_name)
    return gp.to_dict(), 201


def player_snapshot(gp: GlobalPlayer) -> dict[str, Any]:
    data = gp.to_dict()
    return {key: data.get(key) or '' for key in PLAYER_FIELDS}


def update_global_player(gp_id: int, data: dict[str, Any]) -> Result:
    gp = get_row(GlobalPlayer, gp_id)
    if not gp:
        return {'error': 'Player not found'}, 404
    if not data:
        return {'error': 'No data provided'}, 400
    if 'first_name' in data:
        gp.first_name = str(data['first_name']).strip()
    if 'last_name' in data:
        gp.last_name = str(data['last_name']).strip()
    if 'gender' in data:
        gp.gender = classifications.normalize_gender(data['gender'])
    if 'birth_date' in data:
        gp.birth_date = str(data['birth_date'] or '').strip() or None
    if 'country' in data:
        gp.country = str(data['country']).strip()
    new_class = None
    if 'category' in data:
        requested = str(data['category']).strip()
        code = classifications.normalize_class(requested)
        if code and code != classifications.normalize_class(gp.category):
            # a class change goes through the history (below), which also sets the category
            new_class = code
        elif not code:
            gp.category = requested
    if 'notes' in data:
        gp.notes = str(data['notes'] or '').strip() or None
    commit_writes()
    if new_class:
        classifications.record_classification_change(
            gp_id,
            new_class,
            source='manual',
            effective_date=str(data.get('classification_date') or '').strip() or None,
            status=str(data.get('classification_status')) if data.get('classification_status') in classifications.STATUSES else 'confirmed',
            note=str(data.get('classification_note') or '').strip(),
        )
        forget_row(gp)
        gp = get_row(GlobalPlayer, gp_id)
    logger.info("global_player_updated", id=gp_id)
    return gp.to_dict(), 200
