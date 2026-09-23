"""Parse a pasted start list into player rows."""
import json
import re
from typing import Any, Dict

import requests

from ..config import logger, settings
from ..services.categories import is_mixed_category, start_group_key
from ..services.office_workflow import _normalize_int

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
        'K' if raw.startswith('kob') else 'M' if raw.startswith(('męż', 'mez')) else '',
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
