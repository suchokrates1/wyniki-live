"""Who a public profile is about, and which tournament entries are theirs.

A profile opens from a tournament entry or from the global player. Either way the
answer is one person with their names (results are matched by full name or surname),
their details, and their entries in the tournaments the public may see.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..database import counting_entries_named, counting_entries_of_global_player, get_row
from ..db_models import GlobalPlayer, Player
from .categories import normalize_player_classification


@dataclass
class ProfileSubject:
    """The person the profile is about, and their entries in the tournaments that count."""

    id: int
    full_name: str
    first_name: str
    last_name: str
    gender: str
    category: str
    country: str
    global_id: int | None
    entries: list = field(default_factory=list)
    photo_url: str = ''
    birth_date: str = ''
    age: int | None = None

    def is_named(self, name: str | None) -> bool:
        return bool(name) and name in (self.full_name, self.last_name)

    def named_in(self, label: str) -> bool:
        """Whether a bracket label, which may hold a pair or a seed note, mentions them."""
        return bool(
            (self.last_name and self.last_name in label)
            or (self.full_name and self.full_name in label)
        )


def subject_from_global_player(global_id: int) -> ProfileSubject | None:
    gp = get_row(GlobalPlayer, global_id)
    if not gp:
        return None
    last_name = (gp.last_name or '').strip()
    entries = counting_entries_of_global_player(gp.id)
    if not entries and last_name:
        entries = counting_entries_named(gp.first_name, last_name)
    return ProfileSubject(
        id=global_id,
        full_name=gp.full_name,
        first_name=gp.first_name or '',
        last_name=last_name,
        gender=gp.gender or '',
        category=normalize_player_classification(gp.category or ''),
        country=(gp.country or '').upper(),
        global_id=gp.id,
        entries=entries,
        photo_url=gp.photo_url or '',
        birth_date=gp.birth_date or '',
        age=gp.age,
    )


def subject_from_entry(player_id: int) -> ProfileSubject | None:
    player = get_row(Player, player_id)
    if not player:
        return None
    tournament = player.tournament
    if tournament and (
        int(tournament.is_public or 0) != 1
        or int(tournament.stats_enabled or 0) != 1
        or int(tournament.is_simulation or 0) == 1
    ):
        return None
    last_name = (player.last_name or '').strip()
    gp = get_row(GlobalPlayer, player.global_player_id) if player.global_player_id else None
    if player.global_player_id:
        entries = counting_entries_of_global_player(player.global_player_id)
    elif last_name:
        entries = counting_entries_named(player.first_name, last_name)
    else:
        entries = [player]
    category = normalize_player_classification(player.category or '')
    if not category and gp:
        category = normalize_player_classification(gp.category or '')
    return ProfileSubject(
        id=player_id,
        full_name=player.full_name,
        first_name=player.first_name or '',
        last_name=last_name,
        gender=player.gender or '',
        category=category,
        country=(player.country or '').upper(),
        global_id=player.global_player_id or None,
        entries=entries,
        photo_url=(gp.photo_url or '') if gp else '',
        birth_date=(gp.birth_date or '') if gp else '',
        age=gp.age if gp else None,
    )
