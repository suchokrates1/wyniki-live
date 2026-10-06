"""A player's public profile: who they are, each tournament they played, and the career sum.

The profile is reached either through one tournament entry or through the global player.
Results are found by name, because match history stores names and, from older umpire
apps, sometimes the surname alone; so "this player" means either form of the name.
Only tournaments the public may see count, and a class change made at a private
tournament is shown without naming it.
"""
from __future__ import annotations

import re
from typing import Any

from ..database import classifications as classification_db
from ..database import (
    counting_history_for,
    counting_tournament_ids,
    get_full_bracket,
    get_row,
    phases_of_matches,
)
from ..db_models import Tournament
from .categories import normalize_player_classification
from .history_results import result_sets, result_winner
from .profile_subject import ProfileSubject, subject_from_entry, subject_from_global_player

MEDALS = ('gold', 'silver', 'bronze')


def _career_results(subject: ProfileSubject) -> list:
    """Every counting result under the full name, plus those stored under the surname alone."""
    results = counting_history_for(subject.full_name)
    if subject.last_name and subject.last_name != subject.full_name:
        seen = {m.id for m in results}
        results.extend(m for m in counting_history_for(subject.last_name) if m.id not in seen)
    return results


def _is_semifinal(phase: str) -> bool:
    phase_lc = str(phase or '').lower()
    return 'półfinał' in phase_lc or 'semifinal' in phase_lc


def _is_final(phase: str) -> bool:
    phase_lc = str(phase or '').lower()
    return ('finał' in phase_lc or 'final' in phase_lc) and not _is_semifinal(phase)


def _is_side_draw(phase: str) -> bool:
    phase_lc = str(phase or '').lower()
    return 'consolation' in phase_lc or 'pocieszeni' in phase_lc or bool(re.search(r'\d+\s*[-–]\s*\d+', phase_lc))


def _group_placement(bracket: dict, subject: ProfileSubject) -> tuple[str | None, int | None, int | None]:
    """The group they played in, their place in it, and how many played there."""
    for group in (bracket or {}).get('groups', []):
        standings = group.get('standings', [])
        for index, row in enumerate(standings):
            if subject.is_named(row.get('name', '')):
                return group['name'], index + 1, len(standings)
    return None, None, None


def _knockout_finish(bracket: dict, subject: ProfileSubject) -> tuple[str | None, str | None]:
    """The medal won, if any, and the furthest knockout round reached."""
    medal = None
    knockout_phase = None
    for phase, slots in (bracket or {}).get('knockout', {}).items():
        phase_lc = phase.lower()
        # medals are the main draw's; a consolation final or a 9-16 semifinal decides lower places
        if _is_side_draw(phase):
            continue
        for slot in slots:
            winner = slot.get('winner') or ''
            if not (subject.named_in(slot.get('player1') or '') or subject.named_in(slot.get('player2') or '')):
                continue
            won = bool(winner) and subject.named_in(winner)
            if _is_semifinal(phase):
                knockout_phase = knockout_phase or phase
            elif _is_final(phase):
                knockout_phase = phase
                if winner:
                    medal = 'gold' if won else 'silver'
            elif '3.' in phase or 'trzecie' in phase_lc or 'third' in phase_lc:
                knockout_phase = phase
                if won:
                    medal = medal or 'bronze'
            elif '5.' in phase or 'piąte' in phase_lc or 'fifth' in phase_lc:
                if won and not medal:
                    medal = '5th'
                knockout_phase = knockout_phase or phase
    return medal, knockout_phase


def _match_rows(results: list, subject: ProfileSubject, live_phases: dict[int, str]) -> list[dict[str, Any]]:
    """One tournament's results, oldest first, each told from the profile player's side."""
    rows = []
    for result in sorted(results, key=lambda r: r.ended_ts or ''):
        winner = result_winner(result)
        is_a = subject.is_named(result.player_a)
        sets = result_sets(result)
        if not is_a:
            sets = [{'g1': s['g2'], 'g2': s['g1'], 'tb': s.get('tb'), 'stb': s.get('stb', False)} for s in sets]
        # a knockout result saved as "Pucharowa" takes the round name of the live match it came from
        phase = (result.phase or '').strip()
        live_phase = (live_phases.get(result.match_id) or '').strip()
        if live_phase and (not phase or phase.lower() == 'pucharowa'):
            phase = live_phase
        rows.append({
            'opponent': result.player_b if is_a else result.player_a,
            'score': sets,
            'won': winner == (result.player_a if is_a else result.player_b),
            'phase': phase,
            'category': result.category or '',
            'date': result.ended_ts or '',
            'duration': result.duration_seconds or 0,
        })
    return rows


def _tournament_rows(subject: ProfileSubject, results: list) -> list[dict[str, Any]]:
    played_labels = classification_db.played_category_labels([e.id for e in subject.entries])
    entry_classes = {
        e.tournament_id: normalize_player_classification(e.category or '')
        for e in subject.entries if e.tournament_id
    }
    live_phases = phases_of_matches(sorted({m.match_id for m in results if getattr(m, 'match_id', None)}))
    rows = []
    for tournament_id in {e.tournament_id for e in subject.entries if e.tournament_id}:
        tournament = get_row(Tournament, tournament_id)
        if not tournament:
            continue
        bracket = get_full_bracket(tournament_id)
        group_name, group_position, group_total = _group_placement(bracket, subject)
        medal, knockout_phase = _knockout_finish(bracket, subject)
        matches = _match_rows([m for m in results if m.tournament_id == tournament_id], subject, live_phases)
        # who the opponent is, so the page can link the name and show the country
        directory = (bracket or {}).get('players') or {}
        for match in matches:
            known = directory.get(match['opponent']) or {}
            match['opponent_global_id'] = known.get('global_player_id')
            match['opponent_country'] = known.get('country') or ''
        wins = sum(1 for m in matches if m['won'])
        category_label = played_labels.get(tournament_id, '')
        rows.append({
            'tournament_id': tournament_id,
            'tournament_name': tournament.name,
            # the category played in and the class held then: results stay with them
            'category_label': category_label,
            'category_classes': sorted(classification_db.classes_in_label(category_label)),
            'player_class': entry_classes.get(tournament_id, ''),
            'city': tournament.city or '',
            'start_date': tournament.start_date or '',
            'end_date': tournament.end_date or '',
            'group_name': group_name,
            'group_position': group_position,
            'group_total': group_total,
            'medal': medal,
            'knockout_phase': knockout_phase,
            'matches_played': len(matches),
            'wins': wins,
            'losses': len(matches) - wins,
            'matches': matches,
        })
    return rows


def _career(tournaments: list[dict[str, Any]]) -> dict[str, Any]:
    matches = sum(t['matches_played'] for t in tournaments)
    wins = sum(t['wins'] for t in tournaments)
    medals = dict.fromkeys(MEDALS, 0)
    by_category: dict[str, dict[str, Any]] = {}
    for t in tournaments:
        if t['medal'] not in medals:
            continue
        medals[t['medal']] += 1
        key = '/'.join(t['category_classes']) or t['player_class'] or ''
        bucket = by_category.setdefault(key, {'category': key, **dict.fromkeys(MEDALS, 0)})
        bucket[t['medal']] += 1
    return {
        'tournaments': len(tournaments),
        'matches': matches,
        'wins': wins,
        'losses': matches - wins,
        'medals': medals,
        'medals_by_category': sorted(by_category.values(), key=lambda item: item['category']),
    }


def _class_history(global_id: int | None) -> list[dict[str, Any]]:
    if not global_id:
        return []
    public_ids = counting_tournament_ids()
    history = []
    for row in classification_db.fetch_classification_history(global_id):
        public = row.get('tournament_id') in public_ids
        history.append({
            'classification': row['classification'],
            'previous_classification': row.get('previous_classification') or '',
            'effective_date': row.get('effective_date') or '',
            'source': row.get('source') or 'initial',
            'status': row.get('status') or 'confirmed',
            'tournament_id': row.get('tournament_id') if public else None,
            'tournament_name': row.get('tournament_name') if public else None,
        })
    return history


def build_player_profile(player_id: int, *, is_global: bool) -> dict[str, Any] | None:
    """The profile behind /api/players/<id>/profile, or None when the public may not see one."""
    subject = subject_from_global_player(player_id) if is_global else subject_from_entry(player_id)
    if not subject or not subject.entries:
        return None
    tournaments = _tournament_rows(subject, _career_results(subject))
    return {
        'player': {
            'id': subject.id,
            'first_name': subject.first_name,
            'last_name': subject.last_name,
            'full_name': subject.full_name,
            'gender': subject.gender,
            'category': subject.category,
            'country': subject.country,
            'photo_url': subject.photo_url,
            'birth_date': subject.birth_date,
            'age': subject.age,
        },
        'career': _career(tournaments),
        'classification_history': _class_history(subject.global_id),
        'tournaments': sorted(tournaments, key=lambda t: t.get('start_date', ''), reverse=True),
    }
