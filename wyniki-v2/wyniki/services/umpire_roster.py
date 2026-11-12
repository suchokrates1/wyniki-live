"""Player, team, court-label, flag, and schedule-suggestion helpers for umpire devices."""
from __future__ import annotations

import re
from typing import Any

from ..database import (
    active_tournament_row,
    fetch_bracket_groups,
    fetch_tournament_category,
    fetch_tournament_teams,
    get_row,
    rows_where,
)
from ..db_models import Court, Player, Tournament
from .court_manager import normalize_kort_id
from .teams import (
    is_team_display_name,
    normalize_pair_key,
    person_full_name,
    split_team_display_name,
)


def _resolve_tournament_for_court(kort_id: str | None) -> Tournament | None:
    """Resolve tournament from court, with active tournament fallback."""
    normalized = normalize_kort_id(kort_id)
    if normalized:
        court = get_row(Court, normalized)
        if court and court.tournament_id:
            return get_row(Tournament, court.tournament_id)
    return active_tournament_row()


def _format_mobile_court_name(court: dict) -> str:
    """Return the short mobile label used on the court selection screen."""
    raw_name = str(court.get("name") or "").split("•")[-1].strip()
    if not raw_name:
        raw_name = str(court.get("display_order") or "").strip()
    if not raw_name:
        raw_name = str(court.get("kort_id") or "").strip()

    normalized = re.sub(r"^(kort|court)\s+", "", raw_name, flags=re.IGNORECASE).strip()
    match = re.fullmatch(r"t\d+-(\d+)", normalized, flags=re.IGNORECASE)
    if match:
        normalized = match.group(1)

    if normalized.isdigit():
        return f"Kort {normalized}"
    return raw_name


def _mobile_person_payload(
    *,
    player_id: Any,
    first_name: str | None,
    last_name: str | None,
    name: str | None,
    country: str | None,
    category: Any,
    gender: Any,
) -> dict:
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    full = f"{first} {last}".strip() or (name or "").strip()
    country_code = (country or "").strip() or None
    return {
        "id": player_id,
        "first_name": first,
        "last_name": last,
        "surname": last or name,
        "full_name": full,
        "name": full,
        "country_code": country_code,
        "category": category,
        "gender": gender,
        "flag_url": f"https://flagcdn.com/w80/{country_code.lower()}.png" if country_code else None,
    }


def _mobile_person_payload_from_mapping(player: dict) -> dict:
    return _mobile_person_payload(
        player_id=player.get("id"),
        first_name=player.get("first_name") or "",
        last_name=player.get("last_name") or "",
        name=player.get("name") or "",
        country=player.get("country"),
        category=player.get("category"),
        gender=player.get("gender"),
    )


def _find_team_for_label(tournament_id: int, player_name: str) -> dict | None:
    if not is_team_display_name(player_name):
        return None
    try:
        wanted = normalize_pair_key(player_name)
    except ValueError:
        return None
    for team in fetch_tournament_teams(tournament_id):
        display = team.get("display_name") or ""
        if display == player_name:
            return team
        try:
            if normalize_pair_key(display) == wanted:
                return team
        except ValueError:
            continue
    return None


def _mobile_team_side_payload(team: dict) -> dict | None:
    first = team.get("player1")
    second = team.get("player2")
    if not first or not second:
        return None
    left, right = first, second
    split = split_team_display_name(team.get("display_name"))
    if split:
        left_name, right_name = split
        first_name = person_full_name(first)
        if first_name == right_name or person_full_name(second) == left_name:
            left, right = second, first
    payload = _mobile_person_payload_from_mapping(left)
    payload["partner"] = _mobile_person_payload_from_mapping(right)
    return payload


def _mobile_player_payload_for_name(tournament_id: int, player_name: str) -> dict | None:
    normalized_name = (player_name or "").strip()
    if not tournament_id or not normalized_name:
        return None
    players = rows_where(Player, tournament_id=tournament_id)
    player = next(
        (item for item in players if item.full_name == normalized_name or item.name == normalized_name),
        None,
    )
    if player:
        return _mobile_person_payload(
            player_id=player.id,
            first_name=player.first_name or "",
            last_name=player.last_name or "",
            name=player.name,
            country=player.country,
            category=player.category,
            gender=player.gender,
        )
    team = _find_team_for_label(tournament_id, normalized_name)
    if not team:
        return None
    return _mobile_team_side_payload(team)


def _schedule_entry_is_doubles(entry: dict, tournament_id: int) -> bool:
    group_id = entry.get("bracket_group_id")
    if group_id:
        for group in fetch_bracket_groups(tournament_id):
            if int(group.get("id") or 0) != int(group_id):
                continue
            category_id = group.get("tournament_category_id")
            if category_id:
                category = fetch_tournament_category(int(category_id))
                if category is not None:
                    return bool(category.get("is_doubles"))
            break
    return is_team_display_name(entry.get("player1_name")) or is_team_display_name(entry.get("player2_name"))


def _normalized_country_code(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z]{2}", raw):
        return None
    return raw.upper()


def _flag_cdn_url(country_code: str | None) -> str | None:
    if not country_code:
        return None
    return f"https://flagcdn.com/w80/{country_code.lower()}.png"


def _flag_fields_from_person_payload(
    payload: dict | None,
) -> tuple[str | None, str | None, str | None, str | None]:
    """Primary + partner flags from a mobile person/team payload."""
    if not isinstance(payload, dict):
        return None, None, None, None
    partner = payload.get("partner") if isinstance(payload.get("partner"), dict) else {}
    codes: list[str] = []
    for raw in (
        payload.get("country_code") or payload.get("flag_code"),
        (partner or {}).get("country_code")
        or (partner or {}).get("flag_code")
        or payload.get("flag_code_partner"),
    ):
        code = _normalized_country_code(raw)
        if code and code not in codes:
            codes.append(code)
    if not codes:
        return None, None, None, None
    primary = codes[0]
    partner_code = codes[1] if len(codes) > 1 else None
    return primary, _flag_cdn_url(primary), partner_code, _flag_cdn_url(partner_code)


def _apply_flag_fields_to_side(
    court_state: dict,
    side: str,
    payload: dict | None,
) -> None:
    code, url, partner_code, partner_url = _flag_fields_from_person_payload(payload)
    court_state[side]["flag_code"] = code
    court_state[side]["flag_url"] = url
    court_state[side]["flag_code_partner"] = partner_code
    court_state[side]["flag_url_partner"] = partner_url
    if isinstance(payload, dict) and payload.get("category"):
        court_state[side]["category"] = payload.get("category")


def _apply_db_flags_to_court_state(
    court_state: dict,
    tournament_id: int | None,
    player1_name: str | None,
    player2_name: str | None,
) -> None:
    """Set live player flags from tournament DB; kept for the whole match."""
    if not tournament_id:
        return
    for side, name in (("A", player1_name), ("B", player2_name)):
        payload = _mobile_player_payload_for_name(tournament_id, name or "")
        _apply_flag_fields_to_side(court_state, side, payload)


def _mobile_schedule_suggestion_payload(entry: dict | None, tournament_id: int) -> dict | None:
    if not entry:
        return None
    payload = dict(entry)
    is_doubles = _schedule_entry_is_doubles(payload, tournament_id)
    payload["is_doubles"] = is_doubles
    payload["player1"] = _mobile_player_payload_for_name(tournament_id, payload.get("player1_name") or "")
    payload["player2"] = _mobile_player_payload_for_name(tournament_id, payload.get("player2_name") or "")
    if not is_doubles:
        for side in ("player1", "player2"):
            person = payload.get(side)
            if isinstance(person, dict):
                person.pop("partner", None)
    return payload
