"""Player registration helpers shared by admin and umpire APIs."""
from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db_models import GlobalPlayer, Player


def split_player_name(name: str = "", first_name: str = "", last_name: str = "") -> tuple[str, str, str]:
    """Normalize player names and keep the legacy full-name field in sync."""
    first_name = (first_name or "").strip()
    last_name = (last_name or "").strip()
    name = (name or "").strip()

    if not first_name and not last_name and name:
        parts = name.rsplit(" ", 1)
        if len(parts) == 2:
            first_name, last_name = parts[0].strip(), parts[1].strip()
        else:
            last_name = name

    if not name:
        name = f"{first_name} {last_name}".strip()

    return name, first_name, last_name


def player_payload(data: dict[str, Any]) -> dict[str, str]:
    """Normalize a request payload into Player/GlobalPlayer fields."""
    surname = (data.get("surname") or "").strip()
    name = (data.get("name") or surname).strip()
    name, first_name, last_name = split_player_name(
        name=name,
        first_name=data.get("first_name", ""),
        last_name=data.get("last_name", ""),
    )
    return {
        "name": name,
        "first_name": first_name,
        "last_name": last_name,
        "gender": (data.get("gender") or "").strip(),
        "category": (data.get("category") or "").strip(),
        "country": (data.get("country") or data.get("country_code") or "").strip(),
    }


def find_or_create_global_player(
    session: Session,
    first_name: str,
    last_name: str,
    category: str = "",
    country: str = "",
    gender: str = "",
) -> GlobalPlayer | None:
    """Return a global player for a real person, creating one if needed."""
    first_name = (first_name or "").strip()
    last_name = (last_name or "").strip()
    category = (category or "").strip()
    country = (country or "").strip()
    gender = (gender or "").strip()

    if not first_name and not last_name:
        return None

    global_player = session.query(GlobalPlayer).filter(
        func.lower(func.trim(GlobalPlayer.first_name)) == first_name.lower(),
        func.lower(func.trim(GlobalPlayer.last_name)) == last_name.lower(),
    ).first()

    if global_player:
        if not (global_player.gender or "").strip() and gender:
            global_player.gender = gender
        if not (global_player.country or "").strip() and country:
            global_player.country = country
        if not (global_player.category or "").strip() and category:
            global_player.category = category
        return global_player

    global_player = GlobalPlayer(
        first_name=first_name,
        last_name=last_name,
        gender=gender,
        country=country,
        category=category,
    )
    session.add(global_player)
    session.flush()
    return global_player


def create_tournament_player(
    session: Session,
    tournament_id: int,
    name: str = "",
    first_name: str = "",
    last_name: str = "",
    category: str = "",
    country: str = "",
    gender: str = "",
    global_player: GlobalPlayer | None = None,
) -> Player:
    """Create a tournament entry and link it to the shared global player table."""
    name, first_name, last_name = split_player_name(name, first_name, last_name)
    if global_player is None:
        global_player = find_or_create_global_player(
            session,
            first_name=first_name,
            last_name=last_name,
            category=category,
            country=country,
            gender=gender,
        )

    player = Player(
        tournament_id=tournament_id,
        global_player_id=global_player.id if global_player else None,
        name=name,
        first_name=first_name,
        last_name=last_name,
        gender=gender or (global_player.gender if global_player else ""),
        category=category or (global_player.category if global_player else ""),
        country=country or (global_player.country if global_player else ""),
    )
    session.add(player)
    return player