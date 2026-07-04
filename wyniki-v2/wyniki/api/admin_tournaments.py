"""Admin API routes for tournaments and players management."""
import json
import re

from flask import Blueprint, jsonify, request
from pathlib import Path
from typing import Dict, Any
from uuid import uuid4

import requests
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from ..db_models import Match, MatchHistory, Tournament, TournamentSchedule, db, utc_now_iso
from ..services.categories import (
    is_mixed_category,
    is_mixed_section_label,
    start_group_key,
)
from ..database import (
    fetch_tournaments,
    fetch_active_tournaments,
    fetch_tournament,
    fetch_tournament_categories,
    confirm_tournament_categories,
    insert_tournament_category,
    update_tournament_category,
    delete_tournament_category,
    migrate_tournament_categories_from_legacy,
    get_planning_mixed_bands,
    insert_tournament,
    update_tournament,
    delete_tournament,
    set_active_tournament,
    set_tournament_active_state,
    create_tournament_courts,
    sync_tournament_courts,
    fetch_courts_for_tournament,
    fetch_courts,
    fetch_bracket_groups,
    fetch_bracket_knockout,
    fetch_tournament_schedule,
    fetch_players,
    fetch_active_tournament_players,
    fetch_players_for_active_tournaments,
    insert_player,
    update_player,
    delete_player,
    bulk_insert_players,
    is_group_stage_phase,
    expected_group_matches_count,
    count_finished_group_matches,
    maybe_generate_knockout_from_completed_groups,
    advance_knockout,
    ensure_group_schedule_entries,
    ensure_knockout_schedule_entries,
    seed_knockout_rematch_for_groups,
    upsert_tournament_schedule_entries,
    update_tournament_schedule_entry,
    delete_tournament_schedule_entry,
    link_schedule_to_match,
    _is_knockout_placeholder_name,
)
from ..config import logger, settings

blueprint = Blueprint('admin_tournaments', __name__, url_prefix='/admin/api/tournaments')


def _is_knockout_phase(phase: str | None) -> bool:
    return bool(phase and phase != 'Grupowa')


class OfficeWorkflowError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _json_no_cache(payload, status: int = 200):
    response = jsonify(payload)
    response.status_code = status
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


def _request_payload() -> Dict[str, Any]:
    """Read tournament payload from JSON or multipart form."""
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict()


def _normalize_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _normalize_tournament_flags(data: Dict[str, Any]) -> tuple[bool, bool, bool, str]:
    is_simulation = _normalize_bool(data.get('is_simulation', False))
    is_public = _normalize_bool(data.get('is_public', not is_simulation))
    stats_enabled = _normalize_bool(data.get('stats_enabled', not is_simulation))
    if is_simulation:
        is_public = False
        stats_enabled = False
    access_key = (data.get('access_key') or '').strip()
    return is_public, stats_enabled, is_simulation, access_key


def _normalize_office_password_hash(raw_password: Any, *, existing_hash: str = '', is_simulation: bool = False, is_create: bool = False) -> str:
    password = str(raw_password or '').strip()
    if is_simulation and not password and (is_create or not existing_hash):
        password = 'test'
    if password:
        return generate_password_hash(password)
    return existing_hash or ''


def _save_tournament_logo(uploaded_file, tournament_name: str) -> str | None:
    """Save uploaded tournament logo and return public path."""
    if not uploaded_file or not uploaded_file.filename:
        return None

    data_dir = Path(settings.database_path).parent
    logos_dir = data_dir / 'tournament-logos'
    logos_dir.mkdir(parents=True, exist_ok=True)

    extension = Path(secure_filename(uploaded_file.filename)).suffix.lower() or '.png'
    stem = secure_filename(tournament_name) or 'tournament'
    file_name = f"{stem}-{uuid4().hex[:8]}{extension}"
    target = logos_dir / file_name
    uploaded_file.save(target)
    return f"/data/tournament-logos/{file_name}"


def _require_tournament(tournament_id: int, active_only: bool = False):
    tournament = fetch_tournament(tournament_id)
    if not tournament:
        return None, (jsonify({"error": "Tournament not found"}), 404)
    if active_only and int(tournament.get("active") or 0) != 1:
        return None, (jsonify({"error": "Tournament is inactive"}), 409)
    return tournament, None


def _json_loads(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def _normalize_import_gender(value: Any) -> str:
    raw = str(value or '').strip().lower()
    if not raw:
        return ''
    mapping = {
        'k': 'K',
        'kobieta': 'K',
        'kobiety': 'K',
        'kobiet': 'K',
        'dziewczyna': 'K',
        'dziewczyny': 'K',
        'f': 'K',
        'female': 'K',
        'woman': 'K',
        'women': 'K',
        'm': 'M',
        'mezczyzna': 'M',
        'mężczyzna': 'M',
        'mezczyzn': 'M',
        'mężczyzn': 'M',
        'mezczyzni': 'M',
        'mężczyźni': 'M',
        'chlopiec': 'M',
        'chłopiec': 'M',
        'chlopcy': 'M',
        'chłopcy': 'M',
        'male': 'M',
        'man': 'M',
        'men': 'M',
    }
    return mapping.get(
        raw,
        'K' if raw.startswith('kob') else 'M' if raw.startswith('męż') or raw.startswith('mez') else '',
    )


def _clean_import_line_text(line: str) -> str:
    text = str(line or '')
    text = re.sub(r'\s+[–—-]\s+', '-', text)
    text = text.replace(';', ' ').replace('|', ' ').replace(',', ' ')
    return ' '.join(text.split())


def _should_skip_import_line(text: str) -> bool:
    raw = (text or '').strip().lower()
    if not raw:
        return True
    info_prefixes = (
        'dzien dobry',
        'dzień dobry',
        'podaję',
        'podaje',
        'ostateczny termin',
    )
    if raw.startswith(info_prefixes):
        return True
    info_keywords = (
        'lista startowa',
        'mistrzostw polski',
        'losowanie',
        'termin odwołań',
        'termin odwolan',
        'zwrotu kosztów',
        'zwrotu kosztow',
    )
    if len(raw.split()) >= 4 and any(keyword in raw for keyword in info_keywords):
        return True
    if len(raw.split()) >= 4 and sum(char.isdigit() for char in raw) >= 4:
        return True
    return False


def _parse_import_section_header(
    line: str,
    mixed_categories: list[str] | None = None,
) -> Dict[str, str] | None:
    text = _clean_import_line_text(line)
    if not text:
        return None
    header_match = re.fullmatch(r'((?:B\d(?:/\d)?)|(?:B\d{2}))\s+(.+)', text, flags=re.IGNORECASE)
    if not header_match:
        return None
    category = _normalize_import_category(header_match.group(1))
    section_label = str(header_match.group(2) or '').strip()
    if not category:
        return None
    if is_mixed_category(category, mixed_categories):
        return {'category': category, 'gender': ''}
    gender = _normalize_import_gender(section_label)
    if not gender:
        return None
    return {'category': category, 'gender': gender}


def _normalize_import_country(value: Any) -> str:
    raw = str(value or '').strip()
    if len(raw) == 2 and raw.isalpha():
        return raw.upper()
    return ''


def _normalize_import_category(value: Any) -> str:
    raw = str(value or '').strip().upper()
    if not raw:
        return ''
    cleaned = ''.join(ch for ch in raw if ch.isalnum())
    if cleaned in {'K', 'M'}:
        return ''
    return cleaned


def _dedupe_import_warnings(warnings: list[str]) -> list[str]:
    unique: list[str] = []
    for warning in warnings:
        normalized = str(warning or '').strip()
        if normalized and normalized not in unique:
            unique.append(normalized)
    return unique


def _build_import_player_entry(
    *,
    line_number: int,
    raw_line: str,
    first_name: str = '',
    last_name: str = '',
    category: str = '',
    gender: str = '',
    country: str = '',
    name: str = '',
    extra_warnings: list[str] | None = None,
    ai_assisted: bool = False,
    ai_notes: str = '',
    mixed_categories: list[str] | None = None,
) -> Dict[str, Any]:
    first_name = str(first_name or '').strip()
    last_name = str(last_name or '').strip()
    category = _normalize_import_category(category)
    gender = _normalize_import_gender(gender)
    country = _normalize_import_country(country)
    name = str(name or '').strip()

    warnings: list[str] = []

    if not first_name and not last_name and name:
        name_parts = name.rsplit(' ', 1)
        if len(name_parts) == 2:
            first_name, last_name = name_parts[0].strip(), name_parts[1].strip()
        else:
            last_name = name.strip()

    if not name:
        name = f'{first_name} {last_name}'.strip()

    if not name:
        warnings.append('Nie rozpoznano imienia i nazwiska')
    elif not first_name or not last_name:
        warnings.append('Jednoczlonowe nazwisko - sprawdz podzial imienia i nazwiska')

    if not category:
        warnings.append('Nie rozpoznano kategorii startowej')
    if not gender:
        warnings.append('Nie rozpoznano plci')

    warnings.extend(extra_warnings or [])
    start_group = start_group_key(category, gender, mixed_categories)

    payload = {
        'line_number': line_number,
        'raw_line': _clean_import_line_text(raw_line),
        'name': name,
        'first_name': first_name,
        'last_name': last_name,
        'category': category,
        'gender': gender,
        'country': country,
        'start_group': start_group,
        'warnings': _dedupe_import_warnings(warnings),
    }
    if ai_assisted:
        payload['ai_assisted'] = True
    if ai_notes:
        payload['ai_notes'] = ai_notes.strip()
    return payload


def _extract_gemini_json_text(payload: Dict[str, Any]) -> str:
    for candidate in payload.get('candidates', []):
        content = candidate.get('content') or {}
        for part in content.get('parts', []):
            text = str(part.get('text') or '').strip()
            if text:
                return text
    return ''


def _needs_import_ai_help(player: Dict[str, Any]) -> bool:
    return bool(
        player.get('warnings')
        or not _normalize_import_country(player.get('country'))
        or not str(player.get('first_name') or '').strip()
        or not str(player.get('last_name') or '').strip()
    )


def _apply_import_ai_suggestions(
    players: list[Dict[str, Any]],
    suggestions: Dict[int, Dict[str, Any]],
    mixed_categories: list[str] | None = None,
) -> list[Dict[str, Any]]:
    enriched: list[Dict[str, Any]] = []
    for player in players:
        suggestion = suggestions.get(int(player.get('line_number') or 0)) or {}
        first_name = player.get('first_name') or suggestion.get('first_name') or ''
        last_name = player.get('last_name') or suggestion.get('last_name') or ''
        category = player.get('category') or suggestion.get('category') or ''
        gender = player.get('gender') or suggestion.get('gender') or ''
        country = player.get('country') or suggestion.get('country') or ''

        applied_fields = []
        for field_name, original, updated in (
            ('first_name', player.get('first_name'), first_name),
            ('last_name', player.get('last_name'), last_name),
            ('category', player.get('category'), category),
            ('gender', player.get('gender'), gender),
            ('country', player.get('country'), country),
        ):
            if str(original or '').strip() != str(updated or '').strip():
                applied_fields.append(field_name)

        enriched.append(_build_import_player_entry(
            line_number=int(player.get('line_number') or 0),
            raw_line=player.get('raw_line') or '',
            first_name=first_name,
            last_name=last_name,
            category=category,
            gender=gender,
            country=country,
            name=player.get('name') or '',
            ai_assisted=bool(applied_fields),
            ai_notes=str(suggestion.get('notes') or '').strip(),
            mixed_categories=mixed_categories,
        ))
    return enriched


def _fetch_import_ai_suggestions(text: str, players: list[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    api_key = str(settings.import_players_ai_api_key or '').strip()
    model = str(settings.import_players_ai_model or 'gemini-2.5-flash').strip()
    if not api_key or not players:
        return {}

    candidates = [
        {
            'line_number': int(player.get('line_number') or 0),
            'raw_line': player.get('raw_line') or '',
            'first_name': player.get('first_name') or '',
            'last_name': player.get('last_name') or '',
            'category': player.get('category') or '',
            'gender': player.get('gender') or '',
            'country': player.get('country') or '',
            'warnings': player.get('warnings') or [],
        }
        for player in players
        if _needs_import_ai_help(player)
    ]
    if not candidates:
        return {}

    prompt = (
        'You are correcting a tournament player import for blind tennis. '
        'Return only JSON matching this schema: '
        '{"players":[{"line_number":1,"first_name":"","last_name":"","category":"B1","gender":"K","country":"PL","notes":""}]}. '
        'Rules: keep existing explicit values unless they are empty, split names carefully, use only categories like B1/B2/B3/B4, '
        'use gender only K or M, use country as uppercase ISO-3166 alpha-2 or empty string. '
        'Infer country from names and the source text when reasonably likely. If the source appears to be a Polish start list and there is no contrary signal, prefer PL. '
        'Do not invent extra players and only return suggestions for the supplied line numbers.\n\n'
        f'Source text:\n{text}\n\nCandidates:\n{json.dumps(candidates, ensure_ascii=False)}'
    )

    request_payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'temperature': 0.1,
            'responseMimeType': 'application/json',
        },
    }
    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'

    try:
        response = requests.post(
            endpoint,
            json=request_payload,
            timeout=max(5, int(settings.import_players_ai_timeout_seconds or 20)),
        )
        response.raise_for_status()
        response_payload = response.json()
        json_text = _extract_gemini_json_text(response_payload)
        if not json_text:
            return {}
        parsed = json.loads(json_text)
    except Exception as exc:
        logger.warning('import_players_ai_failed', error=str(exc), candidates=len(candidates))
        return {}

    suggestions: Dict[int, Dict[str, Any]] = {}
    for item in parsed.get('players', []):
        line_number = _normalize_int(item.get('line_number'), 0)
        if not line_number:
            continue
        suggestions[line_number] = {
            'first_name': str(item.get('first_name') or '').strip(),
            'last_name': str(item.get('last_name') or '').strip(),
            'category': _normalize_import_category(item.get('category') or ''),
            'gender': _normalize_import_gender(item.get('gender') or ''),
            'country': _normalize_import_country(item.get('country') or ''),
            'notes': str(item.get('notes') or '').strip(),
        }
    return suggestions


def _parse_import_players_with_ai(text: str, mixed_categories: list[str] | None = None) -> list[Dict[str, Any]]:
    players = _parse_import_players_text(text, mixed_categories)
    suggestions = _fetch_import_ai_suggestions(text, players)
    if not suggestions:
        return players
    return _apply_import_ai_suggestions(players, suggestions, mixed_categories)


def _parse_import_player_line(
    line: str,
    line_number: int,
    default_category: str = '',
    default_gender: str = '',
    mixed_categories: list[str] | None = None,
) -> Dict[str, Any] | None:
    text = _clean_import_line_text(line)
    if not text:
        return None

    tokens = text.split(' ')
    country = ''
    explicit_gender = ''
    explicit_category = ''
    warnings: list[str] = []
    name_tokens: list[str] = []

    category_gender_pattern = re.compile(r'^(B\d{1,2})([KMFW])$')
    category_pattern = re.compile(r'^(B\d{1,2})$')

    for token in tokens:
        normalized_country = _normalize_import_country(token)
        if normalized_country and not country:
            country = normalized_country
            continue

        normalized_gender = _normalize_import_gender(token)
        if normalized_gender and not explicit_gender:
            explicit_gender = normalized_gender
            continue

        compact = ''.join(ch for ch in token.upper() if ch.isalnum())
        category_gender_match = category_gender_pattern.match(compact)
        if category_gender_match and not explicit_category:
            explicit_category = category_gender_match.group(1)
            if not explicit_gender:
                explicit_gender = _normalize_import_gender(category_gender_match.group(2))
            continue

        category_match = category_pattern.match(compact)
        if category_match and not explicit_category:
            explicit_category = category_match.group(1)
            continue

        if compact in {'K', 'M', 'F', 'W'} and not explicit_gender:
            explicit_gender = _normalize_import_gender(compact)
            continue

        name_tokens.append(token)

    category = explicit_category or _normalize_import_category(default_category)
    gender = explicit_gender or _normalize_import_gender(default_gender)

    name = ' '.join(name_tokens).strip()
    if not name:
        name = text

    name_parts = name.rsplit(' ', 1)
    if len(name_parts) == 2:
        first_name, last_name = name_parts[0].strip(), name_parts[1].strip()
    else:
        first_name, last_name = '', name.strip()

    return _build_import_player_entry(
        line_number=line_number,
        raw_line=text,
        first_name=first_name,
        last_name=last_name,
        category=category,
        gender=gender,
        country=country,
        name=name,
        extra_warnings=warnings,
        mixed_categories=mixed_categories,
    )


def _parse_import_players_text(text: str, mixed_categories: list[str] | None = None) -> list[Dict[str, Any]]:
    parsed: list[Dict[str, Any]] = []
    current_category = ''
    current_gender = ''
    for line_number, raw_line in enumerate(str(text or '').splitlines(), start=1):
        cleaned = _clean_import_line_text(raw_line)
        if _should_skip_import_line(cleaned):
            continue

        header = _parse_import_section_header(cleaned, mixed_categories)
        if header:
            current_category = header['category']
            current_gender = header['gender']
            continue

        entry = _parse_import_player_line(
            raw_line,
            line_number,
            current_category,
            current_gender,
            mixed_categories,
        )
        if entry:
            if not current_category and not current_gender and not entry.get('category') and not entry.get('gender'):
                continue
            parsed.append(entry)
    return parsed


def _summarize_import_players(players: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for player in players:
        bucket_key = player.get('start_group') or 'NIEPRZYPISANI'
        bucket = grouped.setdefault(bucket_key, {
            'start_group': bucket_key,
            'category': player.get('category') or '',
            'gender': player.get('gender') or '',
            'count': 0,
            'players': [],
        })
        bucket['count'] += 1
        bucket['players'].append(player.get('name') or '')
    summary = list(grouped.values())
    summary.sort(key=lambda item: (item['start_group'] == 'NIEPRZYPISANI', item['start_group']))
    return summary


def _bracket_category_from_group(group_name: str | None) -> str:
    label = (group_name or '').strip()
    if ' — ' in label:
        return label.split(' — ', 1)[0].strip()
    return label


def _score_text(sets_history: list[Dict[str, Any]]) -> str:
    parts = []
    for set_score in sets_history:
        p1 = set_score.get('player1_games', 0)
        p2 = set_score.get('player2_games', 0)
        if set_score.get('is_super_tiebreak'):
            parts.append(f"STB {p1}:{p2}")
        else:
            tb = set_score.get('tiebreak_loser_points')
            parts.append(f"{p1}:{p2}" + (f"({tb})" if tb is not None else ''))
    return '  '.join(parts)


def _normalize_name_key(value: str | None) -> str:
    return ' '.join((value or '').strip().lower().split())


def _player_pair_key(player1_name: str | None, player2_name: str | None) -> tuple[str, str]:
    return tuple(sorted((_normalize_name_key(player1_name), _normalize_name_key(player2_name))))


def _group_players_index(groups: list[Dict[str, Any]]) -> tuple[Dict[int, str], Dict[str, set[int]]]:
    group_lookup = {int(group['id']): group['name'] for group in groups}
    player_groups: Dict[str, set[int]] = {}
    for group in groups:
        group_id = int(group['id'])
        for player in group.get('players', []):
            player_groups.setdefault(_normalize_name_key(player.get('name')), set()).add(group_id)
    return group_lookup, player_groups


def _infer_group_id_for_players(player1_name: str | None, player2_name: str | None, player_groups: Dict[str, set[int]]) -> int | None:
    player1_group_ids = player_groups.get(_normalize_name_key(player1_name), set())
    player2_group_ids = player_groups.get(_normalize_name_key(player2_name), set())
    common = sorted(player1_group_ids & player2_group_ids)
    return common[0] if common else None


def _history_sets_payload(history: MatchHistory) -> list[Dict[str, Any]]:
    sets_history = _json_loads(history.sets_history, None)
    if isinstance(sets_history, list) and sets_history:
        return sets_history

    score_a = _json_loads(history.score_a, [])
    score_b = _json_loads(history.score_b, [])
    if not isinstance(score_a, list) or not isinstance(score_b, list):
        return []
    sets = []
    for index, (player1_games, player2_games) in enumerate(zip(score_a, score_b), start=1):
        sets.append({
            "set_number": index,
            "player1_games": int(player1_games),
            "player2_games": int(player2_games),
        })
    return sets


def _history_sets_score(sets_history: list[Dict[str, Any]]) -> tuple[int, int]:
    player1_sets = 0
    player2_sets = 0
    for set_score in sets_history:
        if int(set_score.get('player1_games', 0)) > int(set_score.get('player2_games', 0)):
            player1_sets += 1
        elif int(set_score.get('player2_games', 0)) > int(set_score.get('player1_games', 0)):
            player2_sets += 1
    return player1_sets, player2_sets


def _office_history_payload(history: MatchHistory, group_lookup: Dict[int, str], player_groups: Dict[str, set[int]]) -> Dict[str, Any]:
    sets_history = _history_sets_payload(history)
    player1_sets, player2_sets = _history_sets_score(sets_history)
    group_id = _infer_group_id_for_players(history.player_a, history.player_b, player_groups) if history.phase == 'Grupowa' else None
    group_name = group_lookup.get(group_id)
    winner_name = None
    if player1_sets != player2_sets:
        winner_name = history.player_a if player1_sets > player2_sets else history.player_b
    return {
        "id": history.id,
        "source": "history",
        "match_id": history.match_id,
        "court_id": history.kort_id,
        "player1_name": history.player_a,
        "player2_name": history.player_b,
        "winner_name": winner_name,
        "status": 'finished',
        "phase": history.phase,
        "finish_reason": history.finish_reason or 'normal',
        "injured_player_name": history.injured_player_name,
        "result_note": history.result_note,
        "bracket_group_id": group_id,
        "group_name": group_name,
        "category": history.category or _bracket_category_from_group(group_name),
        "player1_sets": player1_sets,
        "player2_sets": player2_sets,
        "sets_history": sets_history,
        "score_text": _score_text(sets_history),
        "created_at": history.ended_ts,
        "updated_at": history.ended_ts,
    }


def _normalize_office_sets(data: Dict[str, Any], player1_name: str, player2_name: str) -> tuple[list[Dict[str, Any]], int, int]:
    if _normalize_bool(data.get('walkover', False)):
        winner_name = (data.get('winner_name') or '').strip()
        if winner_name not in {player1_name, player2_name}:
            raise ValueError('Winner is required for walkover')
        p1_wins = winner_name == player1_name
        return [
            {"set_number": 1, "player1_games": 4 if p1_wins else 0, "player2_games": 0 if p1_wins else 4},
            {"set_number": 2, "player1_games": 4 if p1_wins else 0, "player2_games": 0 if p1_wins else 4},
        ], 2 if p1_wins else 0, 0 if p1_wins else 2

    raw_sets = data.get('sets') or []
    sets_history = []
    player1_sets = 0
    player2_sets = 0
    for index, raw_set in enumerate(raw_sets, start=1):
        try:
            p1_games = int(raw_set.get('player1_games'))
            p2_games = int(raw_set.get('player2_games'))
        except (TypeError, ValueError):
            continue
        if p1_games < 0 or p2_games < 0:
            raise ValueError('Set scores cannot be negative')
        if p1_games == p2_games:
            raise ValueError('Set cannot end in a draw')
        if p1_games > p2_games:
            player1_sets += 1
        else:
            player2_sets += 1
        set_payload = {
            "set_number": index,
            "player1_games": p1_games,
            "player2_games": p2_games,
        }
        if raw_set.get('tiebreak_loser_points') not in (None, ''):
            set_payload['tiebreak_loser_points'] = int(raw_set.get('tiebreak_loser_points'))
        if _normalize_bool(raw_set.get('is_super_tiebreak', False)):
            set_payload['is_super_tiebreak'] = True
        sets_history.append(set_payload)

    if not sets_history:
        raise ValueError('At least one finished set is required')
    if player1_sets == player2_sets:
        raise ValueError('Match winner is required')
    return sets_history, player1_sets, player2_sets


def _sync_office_match_history(match: Match, group_name: str | None = None) -> None:
    sets_history = _json_loads(match.sets_history, [])
    score_a = [set_score.get('player1_games', 0) for set_score in sets_history]
    score_b = [set_score.get('player2_games', 0) for set_score in sets_history]
    history = MatchHistory.query.filter_by(match_id=match.id).first()
    if not history:
        history = MatchHistory(match_id=match.id, duration_seconds=0)
        db.session.add(history)

    history.kort_id = match.court_id or f"office-{match.tournament_id}"
    history.ended_ts = match.updated_at or utc_now_iso()
    history.player_a = match.player1_name
    history.player_b = match.player2_name
    history.score_a = json.dumps(score_a)
    history.score_b = json.dumps(score_b)
    history.category = _bracket_category_from_group(group_name)
    history.phase = match.phase or 'Grupowa'
    history.sets_history = match.sets_history
    history.tournament_id = match.tournament_id
    history.finish_reason = match.finish_reason or 'normal'
    history.winner_name = match.winner_name
    history.injured_player_name = match.injured_player_name
    history.result_note = match.result_note


def _office_match_payload(match: Match, group_lookup: Dict[int, str], player_groups: Dict[str, set[int]] | None = None) -> Dict[str, Any]:
    sets_history = _json_loads(match.sets_history, [])
    winner = match.player1_name if int(match.player1_sets or 0) > int(match.player2_sets or 0) else match.player2_name
    group_id = int(match.bracket_group_id) if match.bracket_group_id else None
    if not group_id and player_groups and match.phase == 'Grupowa':
        group_id = _infer_group_id_for_players(match.player1_name, match.player2_name, player_groups)
    group_name = group_lookup.get(group_id)
    return {
        "id": match.id,
        "source": "match",
        "match_id": match.id,
        "court_id": match.court_id,
        "player1_name": match.player1_name,
        "player2_name": match.player2_name,
        "winner_name": winner if match.status == 'finished' else None,
        "status": match.status,
        "phase": match.phase,
        "finish_reason": match.finish_reason or 'normal',
        "injured_player_name": match.injured_player_name,
        "result_note": match.result_note,
        "bracket_group_id": group_id,
        "group_name": group_name,
        "category": _bracket_category_from_group(group_name) or match.phase,
        "player1_sets": match.player1_sets,
        "player2_sets": match.player2_sets,
        "sets_history": sets_history,
        "score_text": _score_text(sets_history),
        "created_at": match.created_at,
        "updated_at": match.updated_at,
    }


def _office_knockout_item(slot: Dict[str, Any], schedule_entry: Dict[str, Any] | None, match_by_id: Dict[int, Match]) -> Dict[str, Any]:
    match = None
    match_id = _normalize_int((schedule_entry or {}).get('match_id'), 0)
    if match_id:
        match = match_by_id.get(match_id)

    sets_history = _json_loads(match.sets_history, []) if match else []
    winner_name = (slot.get('winner_name') or '').strip()
    if match and match.status == 'finished':
        winner_name = match.winner_name or (
            match.player1_name if int(match.player1_sets or 0) > int(match.player2_sets or 0) else match.player2_name
        )
    player1_name = (slot.get('player1_name') or (schedule_entry or {}).get('player1_name') or '').strip()
    player2_name = (slot.get('player2_name') or (schedule_entry or {}).get('player2_name') or '').strip()
    ready = bool(
        player1_name
        and player2_name
        and not _is_knockout_placeholder_name(player1_name)
        and not _is_knockout_placeholder_name(player2_name)
    )
    schedule_status = (schedule_entry or {}).get('status') or 'draft'
    status = 'completed' if winner_name else schedule_status
    phase = slot.get('phase') or (schedule_entry or {}).get('phase') or 'Pucharowa'
    return {
        "id": int(slot.get('id') or 0),
        "slot_id": int(slot.get('id') or 0),
        "source_type": "knockout",
        "source_ref_id": int(slot.get('id') or 0),
        "schedule_id": (schedule_entry or {}).get('id'),
        "match_id": match.id if match else ((schedule_entry or {}).get('match_id') or None),
        "phase": phase,
        "category": _bracket_category_from_group(phase),
        "position": int(slot.get('position') or 1),
        "player1_name": player1_name,
        "player2_name": player2_name,
        "winner_name": winner_name or None,
        "status": status,
        "schedule_status": schedule_status,
        "ready": ready,
        "finish_reason": (match.finish_reason if match else slot.get('finish_reason')) or 'normal',
        "result_note": (match.result_note if match else slot.get('result_note')),
        "score_text": _score_text(sets_history) if match else (slot.get('score_summary') or ''),
        "sets_history": sets_history,
        "day_date": (schedule_entry or {}).get('day_date') or '',
        "scheduled_time": (schedule_entry or {}).get('scheduled_time') or '',
        "court_id": (schedule_entry or {}).get('court_id') or '',
        "court_label": (schedule_entry or {}).get('court_label') or '',
        "notes_public": (schedule_entry or {}).get('notes_public') or '',
        "notes_internal": (schedule_entry or {}).get('notes_internal') or '',
    }


def _build_office_knockout_progress(
    tournament_id: int,
    schedule: list[Dict[str, Any]],
    match_by_id: Dict[int, Match],
) -> Dict[str, Any]:
    schedule_by_ref = {
        int(entry.get('source_ref_id') or 0): entry
        for entry in schedule
        if entry.get('source_type') == 'knockout' and entry.get('source_ref_id')
    }
    matches = [
        _office_knockout_item(slot, schedule_by_ref.get(int(slot.get('id') or 0)), match_by_id)
        for slot in fetch_bracket_knockout(tournament_id)
    ]
    matches.sort(key=lambda item: (str(item.get('category') or ''), str(item.get('phase') or ''), int(item.get('position') or 0)))
    expected = len(matches)
    finished = sum(1 for item in matches if item.get('winner_name'))
    ready = sum(1 for item in matches if item.get('ready') and not item.get('winner_name'))
    return {
        "expected_matches": expected,
        "finished_matches": finished,
        "remaining_matches": max(expected - finished, 0),
        "ready_matches": ready,
        "complete": expected > 0 and finished >= expected,
        "matches": matches,
    }


def _resolve_office_knockout_slot(tournament_id: int, data: Dict[str, Any]) -> tuple[Dict[str, Any], TournamentSchedule | None]:
    schedule_id = _normalize_int(data.get('schedule_id'), 0)
    slot_id = _normalize_int(data.get('knockout_slot_id') or data.get('slot_id') or data.get('source_ref_id'), 0)
    schedule_entry = None

    if schedule_id:
        schedule_entry = TournamentSchedule.query.filter_by(
            id=schedule_id,
            tournament_id=tournament_id,
            source_type='knockout',
        ).first()
        if not schedule_entry:
            raise OfficeWorkflowError('Knockout schedule entry not found', 404)
        if schedule_entry.match_id:
            raise OfficeWorkflowError('This knockout slot already has a linked match. Edit the existing result instead.', 409)
        slot_id = int(schedule_entry.source_ref_id or 0)

    if not slot_id:
        raise OfficeWorkflowError('Knockout schedule entry or slot is required')

    slot = next((item for item in fetch_bracket_knockout(tournament_id) if int(item.get('id') or 0) == slot_id), None)
    if not slot:
        raise OfficeWorkflowError('Knockout slot not found', 404)
    if slot.get('winner_name'):
        raise OfficeWorkflowError('This knockout slot already has a result. Edit the existing result instead.', 409)

    if not schedule_entry:
        schedule_entry = TournamentSchedule.query.filter_by(
            tournament_id=tournament_id,
            source_type='knockout',
            source_ref_id=slot_id,
        ).first()
    return slot, schedule_entry


def _create_office_knockout_match(tournament_id: int, data: Dict[str, Any]) -> tuple[Dict[str, Any], int]:
    slot, schedule_entry = _resolve_office_knockout_slot(tournament_id, data)
    player1_name = (slot.get('player1_name') or '').strip()
    player2_name = (slot.get('player2_name') or '').strip()
    if (
        not player1_name
        or not player2_name
        or _is_knockout_placeholder_name(player1_name)
        or _is_knockout_placeholder_name(player2_name)
    ):
        raise OfficeWorkflowError('Knockout slot does not have two confirmed players yet')

    requested_player1 = (data.get('player1_name') or player1_name).strip()
    requested_player2 = (data.get('player2_name') or player2_name).strip()
    if {requested_player1, requested_player2} != {player1_name, player2_name}:
        raise OfficeWorkflowError('Players must match the generated knockout slot')

    existing_match = Match.query.filter(
        Match.tournament_id == tournament_id,
        Match.phase == slot.get('phase'),
        Match.status == 'finished',
        (
            ((Match.player1_name == player1_name) & (Match.player2_name == player2_name))
            | ((Match.player1_name == player2_name) & (Match.player2_name == player1_name))
        ),
    ).first()
    if existing_match:
        raise OfficeWorkflowError('This knockout match already has a result. Edit the existing result instead.', 409)

    try:
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, player1_name, player2_name)
    except ValueError as exc:
        raise OfficeWorkflowError(str(exc)) from exc

    winner_name = (data.get('winner_name') or '').strip() if _normalize_bool(data.get('walkover', False)) else ''
    if not winner_name:
        winner_name = player1_name if player1_sets > player2_sets else player2_name

    now = utc_now_iso()
    match = Match(
        court_id=(data.get('court_id') or (schedule_entry.court_id if schedule_entry else '') or f"office-{tournament_id}"),
        player1_name=player1_name,
        player2_name=player2_name,
        status='finished',
        tournament_id=tournament_id,
        phase=slot.get('phase') or 'Pucharowa',
        finish_reason='walkover' if _normalize_bool(data.get('walkover', False)) else 'normal',
        winner_name=winner_name,
        result_note='Walkower' if _normalize_bool(data.get('walkover', False)) else None,
        player1_sets=player1_sets,
        player2_sets=player2_sets,
        sets_history=json.dumps(sets_history),
        created_at=data.get('ended_at') or now,
        updated_at=now,
    )
    db.session.add(match)
    db.session.flush()
    _sync_office_match_history(match, match.phase)
    db.session.commit()

    link_schedule_to_match(
        tournament_id,
        match.id,
        schedule_id=int(schedule_entry.id) if schedule_entry else None,
        player1_name=player1_name,
        player2_name=player2_name,
        phase=match.phase,
    )
    advance_knockout(match.id, tournament_id)

    groups = fetch_bracket_groups(tournament_id)
    group_lookup, player_groups = _group_players_index(groups)
    return {
        "message": "Knockout match added",
        "match": _office_match_payload(match, group_lookup, player_groups),
        "knockout_generation": None,
        "dashboard": _build_office_dashboard(tournament_id),
    }, 201


def _build_office_dashboard(tournament_id: int) -> Dict[str, Any]:
    tournament = fetch_tournament(tournament_id)
    ensure_group_schedule_entries(tournament_id)
    ensure_knockout_schedule_entries(tournament_id)
    groups = fetch_bracket_groups(tournament_id)
    group_lookup, player_groups = _group_players_index(groups)
    progress_groups = []
    expected_total = 0
    finished_total = 0

    group_finished_counts: Dict[int, int] = {int(group['id']): 0 for group in groups}

    match_rows = Match.query.filter_by(tournament_id=tournament_id).all()
    match_by_id = {int(match.id): match for match in match_rows}
    history_rows = MatchHistory.query.filter_by(tournament_id=tournament_id).all()
    schedule = fetch_tournament_schedule(tournament_id)

    for group in groups:
        group_id = int(group['id'])
        player_count = len(group.get('players') or [])
        expected = expected_group_matches_count(tournament_id, group_id, player_count)
        finished = count_finished_group_matches(tournament_id, group_id)
        expected_total += expected
        finished_total += finished
        progress_groups.append({
            **group,
            "category": _bracket_category_from_group(group.get('name')),
            "expected_matches": expected,
            "finished_matches": finished,
            "remaining_matches": max(expected - finished, 0),
            "complete": expected > 0 and finished >= expected,
        })

    office_matches = [_office_match_payload(match, group_lookup, player_groups) for match in match_rows]
    included_match_ids = {int(match['match_id']) for match in office_matches if match.get('match_id')}
    for history in history_rows:
        if history.match_id and int(history.match_id) in included_match_ids:
            continue
        office_matches.append(_office_history_payload(history, group_lookup, player_groups))
    office_matches.sort(key=lambda match: str(match.get('updated_at') or match.get('created_at') or ''), reverse=True)
    return {
        "tournament": tournament,
        "progress": {
            "expected_matches": expected_total,
            "finished_matches": finished_total,
            "remaining_matches": max(expected_total - finished_total, 0),
            "complete": expected_total > 0 and finished_total >= expected_total,
            "groups": progress_groups,
            "knockout": _build_office_knockout_progress(tournament_id, schedule, match_by_id),
        },
        "matches": office_matches[:300],
        "schedule": schedule,
        "courts": fetch_courts_for_tournament(tournament_id),
    }


@blueprint.route('/<int:tournament_id>/schedule', methods=['GET'])
def get_tournament_schedule(tournament_id: int):
    """Return tournament schedule entries for admin/office planning."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    ensure_group_schedule_entries(tournament_id)
    ensure_knockout_schedule_entries(tournament_id)
    return _json_no_cache({"schedule": fetch_tournament_schedule(tournament_id)})


@blueprint.route('/<int:tournament_id>/schedule', methods=['PUT', 'POST'])
def save_tournament_schedule(tournament_id: int):
    """Create or update one or more schedule entries."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    raw_entries = data.get('entries') if isinstance(data.get('entries'), list) else [data]
    try:
        schedule = upsert_tournament_schedule_entries(tournament_id, raw_entries)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return _json_no_cache({"schedule": schedule})


@blueprint.route('/<int:tournament_id>/schedule/generate', methods=['POST'])
def generate_tournament_schedule(tournament_id: int):
    """Regenerate missing schedule entries from groups and concrete knockout slots."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    ensure_group_schedule_entries(tournament_id)
    ensure_knockout_schedule_entries(tournament_id)
    return _json_no_cache({"schedule": fetch_tournament_schedule(tournament_id)})


@blueprint.route('/<int:tournament_id>/schedule/generate-rematch', methods=['POST'])
def generate_tournament_schedule_rematch(tournament_id: int):
    """Add a second group-stage round robin for selected bracket groups."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    group_ids = data.get('group_ids') or []
    if not isinstance(group_ids, list) or not group_ids:
        return jsonify({"error": "group_ids required"}), 400
    result = seed_knockout_rematch_for_groups(
        tournament_id,
        [int(group_id) for group_id in group_ids if group_id],
        schedule_day=(data.get('day_date') or None),
    )
    if result.get("error"):
        return jsonify(result), 400
    return _json_no_cache({
        "result": result,
        "schedule": fetch_tournament_schedule(tournament_id),
    })


@blueprint.route('/<int:tournament_id>/schedule/<int:schedule_id>', methods=['PUT', 'PATCH'])
def update_tournament_schedule(tournament_id: int, schedule_id: int):
    """Patch one schedule entry."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    entry = update_tournament_schedule_entry(tournament_id, schedule_id, request.get_json(silent=True) or {})
    if not entry:
        return jsonify({"error": "Schedule entry not found"}), 404
    return _json_no_cache({"schedule_entry": entry, "schedule": fetch_tournament_schedule(tournament_id)})


@blueprint.route('/<int:tournament_id>/schedule/<int:schedule_id>', methods=['DELETE'])
def delete_tournament_schedule(tournament_id: int, schedule_id: int):
    """Delete one schedule entry."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    if not delete_tournament_schedule_entry(tournament_id, schedule_id):
        return jsonify({"error": "Schedule entry not found"}), 404
    return _json_no_cache({"schedule": fetch_tournament_schedule(tournament_id)})


@blueprint.route('', methods=['GET'])
def get_tournaments():
    """Get all tournaments."""
    tournaments = fetch_tournaments()
    return jsonify(tournaments)


@blueprint.route('/<int:tournament_id>', methods=['GET'])
def get_tournament(tournament_id: int):
    """Get a single tournament."""
    tournament = fetch_tournament(tournament_id)
    if not tournament:
        return jsonify({"error": "Tournament not found"}), 404
    tournament['tournament_categories'] = fetch_tournament_categories(tournament_id)
    return jsonify(tournament)


@blueprint.route('/<int:tournament_id>/categories', methods=['GET'])
def list_tournament_categories(tournament_id: int):
    tournament = fetch_tournament(tournament_id)
    if not tournament:
        return jsonify({"error": "Tournament not found"}), 404
    categories = fetch_tournament_categories(tournament_id)
    if not categories and fetch_bracket_groups(tournament_id):
        categories = migrate_tournament_categories_from_legacy(tournament_id)
    return jsonify({"categories": categories})


@blueprint.route('/<int:tournament_id>/categories/confirm', methods=['POST'])
def confirm_tournament_categories_route(tournament_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    data = _request_payload()
    entries = data.get("categories") or data.get("entries") or []
    if not isinstance(entries, list) or not entries:
        return jsonify({"error": "categories required"}), 400
    try:
        categories = confirm_tournament_categories(
            tournament_id,
            entries,
            replace=bool(data.get("replace")),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    return jsonify({"categories": categories})


@blueprint.route('/<int:tournament_id>/categories', methods=['POST'])
def create_tournament_category_route(tournament_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    data = _request_payload()
    label = str(data.get("label") or "").strip()
    if not label:
        return jsonify({"error": "label required"}), 400
    category = insert_tournament_category(
        tournament_id,
        label=label,
        preset_key=str(data.get("preset_key") or ""),
        hint_bands=data.get("hint_bands") if isinstance(data.get("hint_bands"), list) else None,
    )
    if not category:
        return jsonify({"error": "Failed to create category"}), 500
    return jsonify({"category": category, "categories": fetch_tournament_categories(tournament_id)}), 201


@blueprint.route('/<int:tournament_id>/categories/<int:category_id>', methods=['PUT', 'PATCH'])
def update_tournament_category_route(tournament_id: int, category_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    data = _request_payload()
    category = update_tournament_category(
        category_id,
        label=(data.get("label") if "label" in data else None),
        hint_bands=data.get("hint_bands") if isinstance(data.get("hint_bands"), list) else None,
        sort_order=data.get("sort_order") if data.get("sort_order") is not None else None,
        is_active=data.get("is_active") if "is_active" in data else None,
    )
    if not category or int(category.get("tournament_id") or 0) != tournament_id:
        return jsonify({"error": "Category not found"}), 404
    return jsonify({
        "category": category,
        "categories": fetch_tournament_categories(tournament_id),
        "groups": fetch_bracket_groups(tournament_id),
        "schedule": fetch_tournament_schedule(tournament_id),
    })


@blueprint.route('/<int:tournament_id>/categories/<int:category_id>', methods=['DELETE'])
def delete_tournament_category_route(tournament_id: int, category_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    from ..database import fetch_tournament_category
    existing = fetch_tournament_category(category_id)
    if not existing or int(existing.get("tournament_id") or 0) != tournament_id:
        return jsonify({"error": "Category not found"}), 404
    if not delete_tournament_category(category_id):
        return jsonify({"error": "Failed to delete category"}), 500
    return jsonify({"categories": fetch_tournament_categories(tournament_id)})


@blueprint.route('', methods=['POST'])
def create_tournament():
    """Create a new tournament."""
    data = _request_payload()
    
    name = (data.get('name') or '').strip()
    start_date = (data.get('start_date') or '').strip()
    end_date = (data.get('end_date') or '').strip()
    active = _normalize_bool(data.get('active', False))
    city = (data.get('city') or '').strip()
    country = (data.get('country') or '').strip().upper()
    report_email = (data.get('report_email') or '').strip()
    court_count = _normalize_int(data.get('court_count'), 0)
    is_public, stats_enabled, is_simulation, access_key = _normalize_tournament_flags(data)
    office_password_hash = _normalize_office_password_hash(data.get('office_password'), is_simulation=is_simulation, is_create=True)
    logo_path = _save_tournament_logo(request.files.get('logo'), name)
    
    if not all([name, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400
    
    tournament_id = insert_tournament(
        name,
        start_date,
        end_date,
        active=active,
        city=city,
        country=country,
        logo_path=logo_path,
        report_email=report_email,
        is_public=is_public,
        stats_enabled=stats_enabled,
        is_simulation=is_simulation,
        access_key=access_key,
        office_password_hash=office_password_hash,
    )
    
    if tournament_id:
        created_courts = create_tournament_courts(tournament_id, court_count)
        if active:
            set_active_tournament(tournament_id)
        from ..services.court_manager import refresh_courts_from_db
        refresh_courts_from_db(fetch_courts(active_only=True))
        return jsonify({
            "id": tournament_id,
            "message": "Tournament created",
            "created_courts": created_courts,
        }), 201
    else:
        return jsonify({"error": "Failed to create tournament"}), 500


@blueprint.route('/<int:tournament_id>', methods=['PUT'])
def update_tournament_route(tournament_id: int):
    """Update a tournament."""
    existing = fetch_tournament(tournament_id)
    if not existing:
        return jsonify({"error": "Tournament not found"}), 404

    data = _request_payload()
    existing_row = db.session.get(Tournament, tournament_id)
    
    name = (data.get('name') or '').strip()
    start_date = (data.get('start_date') or '').strip()
    end_date = (data.get('end_date') or '').strip()
    active = _normalize_bool(data.get('active', False))
    city = (data.get('city') or '').strip()
    country = (data.get('country') or '').strip().upper()
    report_email = (data.get('report_email') or '').strip()
    requested_court_count = _normalize_int(data.get('court_count'), existing.get('court_count') or 0)
    is_public, stats_enabled, is_simulation, access_key = _normalize_tournament_flags(data)
    office_password_hash = _normalize_office_password_hash(
        data.get('office_password'),
        existing_hash=existing_row.office_password_hash if existing_row else '',
        is_simulation=is_simulation,
        is_create=False,
    )
    logo_path = existing.get('logo_path')
    if request.files.get('logo'):
        logo_path = _save_tournament_logo(request.files.get('logo'), name)
    
    if not all([name, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400

    if requested_court_count < 0:
        return jsonify({"error": "Court count cannot be negative"}), 400

    current_courts = fetch_courts_for_tournament(tournament_id)
    current_count = len(current_courts)
    if requested_court_count < current_count:
        from ..services.court_manager import get_court_state

        removable_candidates = sorted(
            current_courts,
            key=lambda court: (int(court.get('display_order') or 0), str(court.get('kort_id') or '')),
            reverse=True,
        )[: current_count - requested_court_count]
        busy_courts = []
        for court in removable_candidates:
            kort_id = str(court.get('kort_id') or '')
            state = get_court_state(kort_id)
            if state and state.get('match_status', {}).get('active'):
                busy_courts.append(kort_id)

        if busy_courts:
            return jsonify({
                "error": f"Cannot remove active courts: {', '.join(busy_courts)}",
            }), 400
    
    success = update_tournament(
        tournament_id,
        name,
        start_date,
        end_date,
        active,
        city=city,
        country=country,
        logo_path=logo_path,
        report_email=report_email,
        is_public=is_public,
        stats_enabled=stats_enabled,
        is_simulation=is_simulation,
        access_key=access_key,
        office_password_hash=office_password_hash,
    )
    
    if success:
        court_changes = sync_tournament_courts(tournament_id, requested_court_count)
        from ..services.court_manager import refresh_courts_from_db
        refresh_courts_from_db(fetch_courts(active_only=True))
        if active:
            set_active_tournament(tournament_id)
        return jsonify({
            "message": "Tournament updated",
            "created_courts": court_changes["created"],
            "deleted_courts": court_changes["deleted"],
        })
    else:
        return jsonify({"error": "Failed to update tournament"}), 500


@blueprint.route('/<int:tournament_id>', methods=['DELETE'])
def delete_tournament_route(tournament_id: int):
    """Delete a tournament."""
    success = delete_tournament(tournament_id)
    
    if success:
        from ..services.court_manager import refresh_courts_from_db
        refresh_courts_from_db(fetch_courts(active_only=True))
        return jsonify({"message": "Tournament deleted"})
    else:
        return jsonify({"error": "Failed to delete tournament"}), 500


@blueprint.route('/<int:tournament_id>/activate', methods=['POST'])
def activate_tournament(tournament_id: int):
    """Set a tournament as active."""
    success = set_active_tournament(tournament_id)
    
    if success:
        return jsonify({"message": "Tournament activated"})
    else:
        return jsonify({"error": "Failed to activate tournament"}), 500


@blueprint.route('/<int:tournament_id>/active', methods=['PUT'])
def update_tournament_active_state(tournament_id: int):
    """Toggle active state for a single tournament without affecting others."""
    data = request.get_json(silent=True) or {}
    active = _normalize_bool(data.get('active', False))
    success = set_tournament_active_state(tournament_id, active)

    if success:
        from ..services.court_manager import refresh_courts_from_db
        refresh_courts_from_db(fetch_courts(active_only=True))
        return jsonify({"message": "Tournament state updated", "active": active})
    return jsonify({"error": "Failed to update tournament state"}), 500


# ==================== TOURNAMENT OFFICE ====================

@blueprint.route('/<int:tournament_id>/office', methods=['GET'])
def get_tournament_office_dashboard(tournament_id: int):
    """Dashboard data for tournament office: progress and match history only."""
    _, error = _require_tournament(tournament_id)
    if error:
        return error
    return _json_no_cache(_build_office_dashboard(tournament_id))


@blueprint.route('/<int:tournament_id>/office/group-matches', methods=['POST'])
def create_office_group_match(tournament_id: int):
    """Add a finished group-stage result, including walkovers, from the office dashboard."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    group_id = _normalize_int(data.get('group_id'), 0)
    player1_name = (data.get('player1_name') or '').strip()
    player2_name = (data.get('player2_name') or '').strip()
    if not group_id or not player1_name or not player2_name or player1_name == player2_name:
        return jsonify({"error": "Group and two different players are required"}), 400

    groups = fetch_bracket_groups(tournament_id)
    group = next((item for item in groups if int(item['id']) == group_id), None)
    if not group:
        return jsonify({"error": "Group not found"}), 404
    group_player_names = {player['name'] for player in group.get('players', [])}
    if player1_name not in group_player_names or player2_name not in group_player_names:
        return jsonify({"error": "Both players must belong to the selected group"}), 400

    _, player_groups = _group_players_index(groups)
    pair_key = _player_pair_key(player1_name, player2_name)

    existing_match = Match.query.filter(
        Match.tournament_id == tournament_id,
        Match.bracket_group_id == group_id,
        Match.phase == 'Grupowa',
        Match.status == 'finished',
        (
            ((Match.player1_name == player1_name) & (Match.player2_name == player2_name))
            | ((Match.player1_name == player2_name) & (Match.player2_name == player1_name))
        ),
    ).first()
    if existing_match:
        return jsonify({"error": "This group match already has a result. Edit the existing result instead."}), 409

    for history in MatchHistory.query.filter_by(tournament_id=tournament_id, phase='Grupowa').all():
        if _infer_group_id_for_players(history.player_a, history.player_b, player_groups) != group_id:
            continue
        if _player_pair_key(history.player_a, history.player_b) == pair_key:
            return jsonify({"error": "This group match already has a result. Edit the existing result instead."}), 409

    try:
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, player1_name, player2_name)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    now = utc_now_iso()
    match = Match(
        court_id=(data.get('court_id') or f"office-{tournament_id}"),
        player1_name=player1_name,
        player2_name=player2_name,
        status='finished',
        tournament_id=tournament_id,
        bracket_group_id=group_id,
        phase='Grupowa',
        finish_reason='walkover' if _normalize_bool(data.get('walkover', False)) else 'normal',
        winner_name=(data.get('winner_name') or '').strip() if _normalize_bool(data.get('walkover', False)) else None,
        result_note='Walkower' if _normalize_bool(data.get('walkover', False)) else None,
        player1_sets=player1_sets,
        player2_sets=player2_sets,
        sets_history=json.dumps(sets_history),
        created_at=data.get('ended_at') or now,
        updated_at=now,
    )
    db.session.add(match)
    db.session.flush()
    _sync_office_match_history(match, group.get('name'))
    db.session.commit()
    link_schedule_to_match(
        tournament_id,
        match.id,
        player1_name=player1_name,
        player2_name=player2_name,
        phase='Grupowa',
        bracket_group_id=group_id,
    )

    generation = maybe_generate_knockout_from_completed_groups(tournament_id)
    return _json_no_cache({
        "message": "Group match added",
        "match": _office_match_payload(match, {group_id: group.get('name')}),
        "knockout_generation": generation,
        "dashboard": _build_office_dashboard(tournament_id),
    }, 201)


@blueprint.route('/<int:tournament_id>/office/knockout-matches', methods=['POST'])
def create_office_knockout_match(tournament_id: int):
    """Add a finished knockout result from a generated bracket/schedule slot."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error
    try:
        payload, status = _create_office_knockout_match(tournament_id, request.get_json(silent=True) or {})
    except OfficeWorkflowError as exc:
        return jsonify({"error": str(exc)}), exc.status_code
    return _json_no_cache(payload, status)


@blueprint.route('/<int:tournament_id>/office/matches/<int:match_id>', methods=['PUT'])
def update_office_match_result(tournament_id: int, match_id: int):
    """Edit an existing finished match result from the office dashboard."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    source = (data.get('source') or 'match').strip().lower()
    groups = fetch_bracket_groups(tournament_id)
    group_lookup, player_groups = _group_players_index(groups)

    if source == 'history':
        history = MatchHistory.query.filter_by(id=match_id, tournament_id=tournament_id).first()
        if not history:
            return jsonify({"error": "Match not found"}), 404
        try:
            sets_history, player1_sets, player2_sets = _normalize_office_sets(data, history.player_a, history.player_b)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        history.score_a = json.dumps([set_score.get('player1_games', 0) for set_score in sets_history])
        history.score_b = json.dumps([set_score.get('player2_games', 0) for set_score in sets_history])
        history.sets_history = json.dumps(sets_history)
        history.finish_reason = 'walkover' if _normalize_bool(data.get('walkover', False)) else 'normal'
        history.winner_name = (data.get('winner_name') or '').strip() if history.finish_reason == 'walkover' else None
        history.injured_player_name = None
        history.result_note = 'Walkower' if history.finish_reason == 'walkover' else None
        if history.match_id:
            match = Match.query.filter_by(id=history.match_id, tournament_id=tournament_id).first()
            if match:
                match.status = 'finished'
                match.finish_reason = history.finish_reason
                match.winner_name = history.winner_name
                match.injured_player_name = history.injured_player_name
                match.result_note = history.result_note
                match.player1_sets = player1_sets
                match.player2_sets = player2_sets
                match.sets_history = json.dumps(sets_history)
                match.updated_at = utc_now_iso()
                group_name = group_lookup.get(int(match.bracket_group_id)) if match.bracket_group_id else None
                _sync_office_match_history(match, group_name)
        db.session.commit()
        if history.match_id:
            link_schedule_to_match(
                tournament_id,
                history.match_id,
                player1_name=history.player_a,
                player2_name=history.player_b,
                phase=history.phase,
                bracket_group_id=_infer_group_id_for_players(history.player_a, history.player_b, player_groups) if history.phase == 'Grupowa' else None,
            )
        return _json_no_cache({
            "message": "Match result updated",
            "match": _office_history_payload(history, group_lookup, player_groups),
            "knockout_generation": None,
            "dashboard": _build_office_dashboard(tournament_id),
        })

    match = Match.query.filter_by(id=match_id, tournament_id=tournament_id).first()
    if not match:
        return jsonify({"error": "Match not found"}), 404

    try:
        sets_history, player1_sets, player2_sets = _normalize_office_sets(data, match.player1_name, match.player2_name)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    match.status = 'finished'
    match.finish_reason = 'walkover' if _normalize_bool(data.get('walkover', False)) else 'normal'
    match.winner_name = (data.get('winner_name') or '').strip() if match.finish_reason == 'walkover' else None
    match.injured_player_name = None
    match.result_note = 'Walkower' if match.finish_reason == 'walkover' else None
    match.player1_sets = player1_sets
    match.player2_sets = player2_sets
    match.sets_history = json.dumps(sets_history)
    match.updated_at = utc_now_iso()

    group_name = group_lookup.get(int(match.bracket_group_id)) if match.bracket_group_id else None
    _sync_office_match_history(match, group_name)
    db.session.commit()
    link_schedule_to_match(
        tournament_id,
        match.id,
        player1_name=match.player1_name,
        player2_name=match.player2_name,
        phase=match.phase,
        bracket_group_id=int(match.bracket_group_id) if match.bracket_group_id else None,
    )

    generation = None
    if match.phase == 'Grupowa':
        generation = maybe_generate_knockout_from_completed_groups(tournament_id)
    elif _is_knockout_phase(match.phase):
        advance_knockout(match.id, tournament_id)

    return _json_no_cache({
        "message": "Match result updated",
        "match": _office_match_payload(match, {match.bracket_group_id: group_name} if group_name else {}),
        "knockout_generation": generation,
        "dashboard": _build_office_dashboard(tournament_id),
    })


# ==================== PLAYERS ====================

@blueprint.route('/<int:tournament_id>/players', methods=['GET'])
def get_tournament_players(tournament_id: int):
    """Get all players for a tournament."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error
    players = fetch_players(tournament_id)
    return jsonify(players)


@blueprint.route('/<int:tournament_id>/players', methods=['POST'])
def create_player(tournament_id: int):
    """Add a player to a tournament."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    
    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()
    name = data.get('name', '').strip()
    
    # Backward compat: if only name provided, split it
    if not first_name and not last_name:
        if not name:
            return jsonify({"error": "Name is required"}), 400
        parts = name.rsplit(' ', 1)
        if len(parts) == 2:
            first_name, last_name = parts[0], parts[1]
        else:
            first_name, last_name = '', name
    
    if not name:
        name = f"{first_name} {last_name}".strip()
    
    category = data.get('category', '')
    country = data.get('country', '')
    gender = data.get('gender', '')
    
    player_id = insert_player(tournament_id, name, category, country,
                              first_name=first_name, last_name=last_name,
                              gender=gender)
    
    if player_id:
        return jsonify({"id": player_id, "message": "Player added"}), 201
    else:
        return jsonify({"error": "Failed to add player"}), 500


@blueprint.route('/<int:tournament_id>/players/<int:player_id>', methods=['PUT'])
def update_player_route(tournament_id: int, player_id: int):
    """Update a player."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    
    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()
    name = data.get('name', '').strip()
    
    if not first_name and not last_name:
        if not name:
            return jsonify({"error": "Name is required"}), 400
        parts = name.rsplit(' ', 1)
        if len(parts) == 2:
            first_name, last_name = parts[0], parts[1]
        else:
            first_name, last_name = '', name
    
    if not name:
        name = f"{first_name} {last_name}".strip()
    
    category = data.get('category', '')
    country = data.get('country', '')
    gender = data.get('gender', '')
    
    success = update_player(player_id, name, category, country,
                            first_name=first_name, last_name=last_name,
                            gender=gender, tournament_id=tournament_id)
    
    if success:
        return jsonify({"message": "Player updated"})
    else:
        return jsonify({"error": "Player not found in tournament"}), 404


@blueprint.route('/<int:tournament_id>/players/<int:player_id>', methods=['DELETE'])
def delete_player_route(tournament_id: int, player_id: int):
    """Delete a player."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    success = delete_player(player_id, tournament_id=tournament_id)
    
    if success:
        return jsonify({"message": "Player deleted"})
    else:
        return jsonify({"error": "Player not found in tournament"}), 404


@blueprint.route('/<int:tournament_id>/players/import', methods=['POST'])
def import_players(tournament_id: int):
    """Bulk import players from text format.
    
    Expected format (one per line):
    Name Category Country
    Example: John Doe B1 us
    """
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    text = data.get('text', '')
    
    if not text:
        return jsonify({"error": "No text provided"}), 400
    
    mixed_bands = get_planning_mixed_bands(tournament_id)
    players_data = _parse_import_players_text(text, mixed_bands)
    
    if not players_data:
        return jsonify({"error": "No valid players found"}), 400
    
    count = bulk_insert_players(tournament_id, players_data)
    
    return jsonify({
        "message": f"Imported {count} players",
        "count": count
    })


@blueprint.route('/<int:tournament_id>/players/parse-import', methods=['POST'])
def parse_import_players(tournament_id: int):
    """Parse free-form tournament player import text and return preview data."""
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    text = data.get('text', '')
    if not text:
        return jsonify({"error": "No text provided"}), 400

    mixed_bands = get_planning_mixed_bands(tournament_id)
    players_data = _parse_import_players_with_ai(text, mixed_bands)
    if not players_data:
        return jsonify({"error": "No valid players found"}), 400

    return _json_no_cache({
        'players': players_data,
        'tournament_categories': fetch_tournament_categories(tournament_id),
        'summary': _summarize_import_players(players_data),
        'needs_attention_count': sum(1 for player in players_data if player.get('warnings')),
        'count': len(players_data),
    })


@blueprint.route('/<int:tournament_id>/players/bulk', methods=['POST'])
def bulk_import_players(tournament_id: int):
    """Bulk import pre-parsed players from JSON array.
    
    Expected JSON: { "players": [{"name": "...", "category": "...", "country": "..."}] }
    """
    _, error = _require_tournament(tournament_id, active_only=True)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    players = data.get('players', [])
    
    if not players:
        return jsonify({"error": "No players provided"}), 400
    
    players_data = []
    for p in players:
        name = p.get('name', '').strip()
        first_name = p.get('first_name', '').strip()
        last_name = p.get('last_name', '').strip()
        if not first_name and not last_name:
            if not name:
                continue
            name_parts = name.rsplit(' ', 1)
            if len(name_parts) == 2:
                first_name, last_name = name_parts[0], name_parts[1]
            else:
                first_name, last_name = '', name
        if not name:
            name = f"{first_name} {last_name}".strip()
        
        players_data.append({
            "name": name,
            "first_name": first_name,
            "last_name": last_name,
            "category": _normalize_import_category(p.get('category', '')).strip(),
            "country": _normalize_import_country(p.get('country', '')).strip(),
            "gender": _normalize_import_gender(p.get('gender', '')).strip(),
        })
    
    if not players_data:
        return jsonify({"error": "No valid players found"}), 400
    
    count = bulk_insert_players(tournament_id, players_data)
    
    return jsonify({
        "message": f"Imported {count} players",
        "count": count
    })


# ==================== PUBLIC API ====================

players_public_bp = Blueprint('players_public', __name__, url_prefix='/api/players')


@blueprint.route('/active', methods=['GET'])
def get_active_tournaments_admin():
    """Get only active tournaments for admin integrations."""
    return _json_no_cache(fetch_active_tournaments())


tournaments_public_bp = Blueprint('tournaments_public', __name__, url_prefix='/api/tournaments')


@tournaments_public_bp.route('/active', methods=['GET'])
def get_active_tournaments_public():
    """Get active tournaments for the Android app selection screen."""
    return _json_no_cache(fetch_active_tournaments(public_only=True))


@players_public_bp.route('/active', methods=['GET'])
def get_active_players():
    """Get players from all active tournaments (for Umpire App)."""
    players = fetch_players_for_active_tournaments(public_only=True)
    
    # Format for Umpire mobile app
    result = [
        {
            "name": f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or p["name"],
            "first_name": p.get("first_name", ""),
            "last_name": p.get("last_name", ""),
            "surname": p.get("last_name", ""),
            "full_name": f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or p["name"],
            "category": p.get("category", ""),
            "country": p.get("country", "")
        }
        for p in players
    ]
    
    return jsonify(result)


@players_public_bp.route('/all', methods=['GET'])
def get_all_players():
    """Get all players across all tournaments with match stats.
    Deduplicates by global_player_id, aggregating stats across tournaments.
    """
    import json
    from wyniki.db_models import Player, Tournament, MatchHistory
    from sqlalchemy import func, or_
    
    # Query public, stats-enabled players only.
    players = (
        Player.query.join(Tournament)
        .filter(
            Tournament.is_public == 1,
            Tournament.stats_enabled == 1,
        )
        .order_by(Player.last_name, Player.first_name)
        .all()
    )
    
    # Deduplicate by global_player_id — aggregate stats across tournaments
    seen_global = {}
    result = []
    for p in players:
        gid = p.global_player_id
        full_name = p.full_name
        
        # Count matches where player appeared (as player_a or player_b)
        match_filter = or_(MatchHistory.player_a == full_name, MatchHistory.player_b == full_name)
        public_stats_matches = (
            MatchHistory.query.outerjoin(Tournament, MatchHistory.tournament_id == Tournament.id)
            .filter(
                match_filter,
                (MatchHistory.tournament_id.is_(None)) | ((Tournament.is_public == 1) & (Tournament.stats_enabled == 1)),
            )
        )
        match_count = public_stats_matches.count()
        
        # Count wins
        wins = 0
        matches = public_stats_matches.all()
        for m in matches:
            if not m.score_a or not m.score_b:
                continue
            try:
                sa = json.loads(m.score_a) if isinstance(m.score_a, str) else m.score_a
                sb = json.loads(m.score_b) if isinstance(m.score_b, str) else m.score_b
                sets_a = sum(1 for i in range(len(sa)) for _ in [1] if i < len(sb) and sa[i] > sb[i])
                sets_b = sum(1 for i in range(len(sb)) for _ in [1] if i < len(sa) and sb[i] > sa[i])
                if m.player_a == full_name and sets_a > sets_b:
                    wins += 1
                elif m.player_b == full_name and sets_b > sets_a:
                    wins += 1
            except (json.JSONDecodeError, TypeError):
                pass
        
        if gid and gid in seen_global:
            # Already seen this global player — skip (stats are same since same full_name)
            continue
        
        if gid:
            seen_global[gid] = True
        
        result.append({
            'id': p.id,
            'global_player_id': gid,
            'name': full_name,
            'first_name': p.first_name or '',
            'last_name': p.last_name or '',
            'gender': p.gender or '',
            'category': p.category or '',
            'country': (p.country or '').upper(),
            'tournament_id': p.tournament_id,
            'tournament_name': p.tournament.name if p.tournament else '',
            'matches_played': match_count,
            'wins': wins,
            'losses': match_count - wins
        })
    
    return jsonify(result)


@players_public_bp.route('/<int:player_id>/profile', methods=['GET'])
def get_player_profile(player_id: int):
    """Get full player profile: info, tournament history, matches, medals.
    Accepts either a Player id (tournament entry) or a GlobalPlayer id via ?global=1
    """
    import json
    from wyniki.db_models import Player, GlobalPlayer, Tournament, MatchHistory
    from wyniki.database import get_full_bracket
    from sqlalchemy import or_

    is_global = request.args.get('global', '0') == '1'

    if is_global:
        gp = db.session.get(GlobalPlayer, player_id)
        if not gp:
            return jsonify({'error': 'Player not found'}), 404
        full_name = gp.full_name
        last_name = (gp.last_name or '').strip()
        first_name_val = gp.first_name or ''
        gender_val = gp.gender or ''
        category_val = gp.category or ''
        country_val = (gp.country or '').upper()
        photo_url = gp.photo_url or ''
        birth_date = gp.birth_date or ''
        age_val = gp.age
        siblings = Player.query.join(Tournament).filter(
            Player.global_player_id == gp.id,
            Tournament.is_public == 1,
            Tournament.stats_enabled == 1,
        ).all()
        if not siblings and last_name:
            siblings = Player.query.join(Tournament).filter(
                Player.last_name == last_name,
                Player.first_name == gp.first_name,
                Tournament.is_public == 1,
                Tournament.stats_enabled == 1,
            ).all()
    else:
        player = db.session.get(Player, player_id)
        if not player:
            return jsonify({'error': 'Player not found'}), 404
        if player.tournament and (int(player.tournament.is_public or 0) != 1 or int(player.tournament.stats_enabled or 0) != 1):
            return jsonify({'error': 'Player not found'}), 404
        full_name = player.full_name
        last_name = (player.last_name or '').strip()
        first_name_val = player.first_name or ''
        gender_val = player.gender or ''
        category_val = player.category or ''
        country_val = (player.country or '').upper()
        photo_url = ''
        birth_date = ''
        age_val = None

        # If player has global_player_id, use it for cross-tournament lookup
        if player.global_player_id:
            gp = db.session.get(GlobalPlayer, player.global_player_id)
            if gp:
                photo_url = gp.photo_url or ''
                birth_date = gp.birth_date or ''
                age_val = gp.age
            siblings = Player.query.join(Tournament).filter(
                Player.global_player_id == player.global_player_id,
                Tournament.is_public == 1,
                Tournament.stats_enabled == 1,
            ).all()
        elif last_name:
            siblings = Player.query.join(Tournament).filter(
                Player.last_name == last_name,
                Player.first_name == player.first_name,
                Tournament.is_public == 1,
                Tournament.stats_enabled == 1,
            ).all()
        else:
            siblings = [player]

    if not siblings:
        return jsonify({'error': 'Player not found'}), 404

    tournament_ids = list({s.tournament_id for s in siblings if s.tournament_id})

    # Fetch all matches for this player across all tournaments
    public_stats_filter = (MatchHistory.tournament_id.is_(None)) | ((Tournament.is_public == 1) & (Tournament.stats_enabled == 1))
    all_matches = (
        MatchHistory.query.outerjoin(Tournament, MatchHistory.tournament_id == Tournament.id)
        .filter(
            or_(MatchHistory.player_a == full_name, MatchHistory.player_b == full_name),
            public_stats_filter,
        )
        .order_by(MatchHistory.ended_ts.desc())
        .all()
    )

    # Also try matching by last_name alone (match_history stores surnames)
    if last_name and last_name != full_name:
        surname_matches = (
            MatchHistory.query.outerjoin(Tournament, MatchHistory.tournament_id == Tournament.id)
            .filter(
                or_(MatchHistory.player_a == last_name, MatchHistory.player_b == last_name),
                public_stats_filter,
            )
            .order_by(MatchHistory.ended_ts.desc())
            .all()
        )
        existing_ids = {m.id for m in all_matches}
        for sm in surname_matches:
            if sm.id not in existing_ids:
                all_matches.append(sm)

    match_phase_lookup = {}
    match_ids = sorted({m.match_id for m in all_matches if getattr(m, 'match_id', None)})
    if match_ids:
        match_phase_lookup = {
            row.id: (row.phase or '')
            for row in Match.query.filter(Match.id.in_(match_ids)).all()
        }

    def parse_sets_history(m):
        """Parse sets_history from a MatchHistory entry."""
        sets = []
        if m.sets_history:
            try:
                sh = json.loads(m.sets_history) if isinstance(m.sets_history, str) else m.sets_history
                for s in sh:
                    sets.append({
                        'g1': s.get('player1_games', 0),
                        'g2': s.get('player2_games', 0),
                        'tb': s.get('tiebreak_loser_points'),
                        'stb': bool(s.get('is_super_tiebreak', False))
                    })
            except (json.JSONDecodeError, TypeError):
                pass
        if not sets and m.score_a and m.score_b:
            try:
                sa = json.loads(m.score_a) if isinstance(m.score_a, str) else m.score_a
                sb = json.loads(m.score_b) if isinstance(m.score_b, str) else m.score_b
                for i in range(max(len(sa), len(sb))):
                    sets.append({
                        'g1': sa[i] if i < len(sa) else 0,
                        'g2': sb[i] if i < len(sb) else 0,
                        'tb': None, 'stb': False
                    })
            except (json.JSONDecodeError, TypeError):
                pass
        return sets

    def determine_winner(m):
        """Determine winner of a MatchHistory entry."""
        try:
            sa = json.loads(m.score_a) if isinstance(m.score_a, str) else (m.score_a or [])
            sb = json.loads(m.score_b) if isinstance(m.score_b, str) else (m.score_b or [])
            sets_a = sum(1 for i in range(min(len(sa), len(sb))) if sa[i] > sb[i])
            sets_b = sum(1 for i in range(min(len(sa), len(sb))) if sb[i] > sa[i])
            if sets_a > sets_b:
                return m.player_a
            elif sets_b > sets_a:
                return m.player_b
        except (json.JSONDecodeError, TypeError):
            pass
        return None

    def is_semifinal_phase_label(phase_name):
        phase_lc = str(phase_name or '').lower()
        return 'półfinał' in phase_lc or 'semifinal' in phase_lc

    def is_final_phase_label(phase_name):
        phase_lc = str(phase_name or '').lower()
        return ('finał' in phase_lc or 'final' in phase_lc) and not is_semifinal_phase_label(phase_name)

    def resolve_match_phase(m):
        phase_name = (m.phase or '').strip()
        mapped_phase = (match_phase_lookup.get(m.match_id) or '').strip()
        if mapped_phase:
            if not phase_name or phase_name.lower() == 'pucharowa':
                return mapped_phase
        return phase_name

    def is_this_player(name):
        """Check if a name refers to this player."""
        if not name:
            return False
        return name == full_name or name == last_name

    # Build per-tournament data
    tournaments_data = []
    for tid in tournament_ids:
        tourn = db.session.get(Tournament, tid)
        if not tourn:
            continue

        # Get bracket data for this tournament
        bracket = get_full_bracket(tid)

        # Find player's group placement
        group_name = None
        group_position = None
        group_total = None
        if bracket and 'groups' in bracket:
            for g in bracket['groups']:
                for si, st in enumerate(g.get('standings', [])):
                    sname = st.get('name', '')
                    if sname == last_name or sname == full_name:
                        group_name = g['name']
                        group_position = si + 1
                        group_total = len(g['standings'])
                        break
                if group_name:
                    break

        # Find knockout placement (medals)
        medal = None  # '🥇','🥈','🥉' or None
        knockout_phase = None
        if bracket and 'knockout' in bracket:
            for phase, slots in bracket['knockout'].items():
                for slot in slots:
                    winner = slot.get('winner') or ''
                    p1 = slot.get('player1') or ''
                    p2 = slot.get('player2') or ''
                    is_participant = (last_name and (last_name in p1 or last_name in p2)) or \
                                    (full_name and (full_name in p1 or full_name in p2))
                    if not is_participant:
                        continue
                    is_winner = bool(winner and (
                        (last_name and last_name in winner) or
                        (full_name and full_name in winner)
                    ))
                    phase_lc = phase.lower()
                    if is_semifinal_phase_label(phase):
                        knockout_phase = knockout_phase or phase
                    elif is_final_phase_label(phase):
                        knockout_phase = phase
                        if winner:
                            medal = 'gold' if is_winner else 'silver'
                    elif '3.' in phase or 'trzecie' in phase_lc or 'third' in phase_lc:
                        knockout_phase = phase
                        if winner and is_winner:
                            medal = medal or 'bronze'
                    elif '5.' in phase or 'piąte' in phase_lc or 'fifth' in phase_lc:
                        if winner and is_winner and not medal:
                            medal = '5th'
                        if not knockout_phase:
                            knockout_phase = phase

        # Filter matches for this tournament
        tourn_matches = [m for m in all_matches if m.tournament_id == tid]
        matches_detail = []
        wins = 0
        losses = 0
        for m in sorted(tourn_matches, key=lambda x: x.ended_ts or ''):
            winner = determine_winner(m)
            is_player_a = is_this_player(m.player_a)
            opponent = m.player_b if is_player_a else m.player_a
            won = (is_player_a and winner == m.player_a) or \
                  (not is_player_a and winner == m.player_b)
            if won:
                wins += 1
            else:
                losses += 1

            raw_sets = parse_sets_history(m)
            # Flip scores when profile player is player_b
            if not is_player_a:
                raw_sets = [{'g1': s['g2'], 'g2': s['g1'], 'tb': s.get('tb'), 'stb': s.get('stb', False)} for s in raw_sets]

            matches_detail.append({
                'opponent': opponent,
                'score': raw_sets,
                'won': won,
                'phase': resolve_match_phase(m),
                'category': m.category or '',
                'date': m.ended_ts or '',
                'duration': m.duration_seconds or 0
            })

        tournaments_data.append({
            'tournament_id': tid,
            'tournament_name': tourn.name,
            'start_date': tourn.start_date or '',
            'end_date': tourn.end_date or '',
            'group_name': group_name,
            'group_position': group_position,
            'group_total': group_total,
            'medal': medal,
            'knockout_phase': knockout_phase,
            'matches_played': len(matches_detail),
            'wins': wins,
            'losses': losses,
            'matches': matches_detail
        })

    # Career totals
    total_matches = sum(t['matches_played'] for t in tournaments_data)
    total_wins = sum(t['wins'] for t in tournaments_data)
    medals = {'gold': 0, 'silver': 0, 'bronze': 0}
    for t in tournaments_data:
        if t['medal'] in medals:
            medals[t['medal']] += 1

    return jsonify({
        'player': {
            'id': player_id,
            'first_name': first_name_val,
            'last_name': last_name,
            'full_name': full_name,
            'gender': gender_val,
            'category': category_val,
            'country': country_val,
            'photo_url': photo_url,
            'birth_date': birth_date,
            'age': age_val,
        },
        'career': {
            'tournaments': len(tournaments_data),
            'matches': total_matches,
            'wins': total_wins,
            'losses': total_matches - total_wins,
            'medals': medals
        },
        'tournaments': sorted(tournaments_data, key=lambda t: t.get('start_date', ''), reverse=True)
    })
