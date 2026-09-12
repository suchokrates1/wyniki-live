"""Knockout draws for categories with three or more groups (pure, no DB).

The format follows the IBTA World Championships 2026 (Vilnius):

* the top two of every group play the main draw; group winners are seeded, runners-up
  are placed in the other half from their own group winner, the top seeds get the byes;
* everyone who loses keeps playing for places (quarterfinal losers for 5-8, round-of-16
  losers for 9-16, and so on down to the last place);
* the rest of each group (3rd, 4th, ...) plays a consolation draw built the same way.

A draw is a list of slots. Every slot knows where its winner and its loser go
(``winner_to`` / ``loser_to`` = ``(phase, position, side)``), so results can move players
forward without reading phase names. Byes are resolved when the draw is built: a match
with only one possible player is left out and that player goes straight to the next slot.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

Source = Tuple[str, Any]  # ("seed", name) | ("win", key) | ("lose", key) | ("dead", None)
DEAD: Source = ("dead", None)

CONSOLATION = "Pocieszenie"


def _next_power_of_two(value: int) -> int:
    size = 1
    while size < value:
        size *= 2
    return size


def seed_lines(size: int) -> List[int]:
    """Standard bracket order: ``lines[i]`` is the seed number on line ``i``."""
    order = [1, 2]
    while len(order) < size:
        span = len(order) * 2
        order = [line for seed in order for line in (seed, span + 1 - seed)]
    return order[:size] if size >= 2 else [1]


def _distance(line_a: int, line_b: int) -> int:
    """Round in which two lines can first meet (higher = later)."""
    return (line_a ^ line_b).bit_length()


def place_entrants(tiers: Sequence[Sequence[Tuple[str, str]]]) -> List[Optional[Tuple[str, str]]]:
    """Put ``(group, name)`` entrants on bracket lines.

    ``tiers[0]`` are the seeds (group winners) in seeding order; later tiers are placed as
    far as possible from players of their own group, preferring a line that faces a seed.
    Lines left empty (``None``) are byes, which always face the top seeds.
    """
    total = sum(len(tier) for tier in tiers)
    size = max(2, _next_power_of_two(total))
    lines: List[Optional[Tuple[str, str]]] = [None] * size
    order = seed_lines(size)
    line_of_seed = {seed: index for index, seed in enumerate(order)}

    seeds = list(tiers[0]) if tiers else []
    for number, entrant in enumerate(seeds, start=1):
        lines[line_of_seed[number]] = entrant

    byes = size - total
    reserved = set()
    for number in range(1, byes + 1):
        opponent = line_of_seed[number] ^ 1
        reserved.add(opponent)

    for tier in tiers[1:]:
        for entrant in tier:
            group = entrant[0]
            same_group = [index for index, other in enumerate(lines) if other and other[0] == group]
            free = [index for index, other in enumerate(lines) if other is None and index not in reserved]
            if not free:
                free = [index for index, other in enumerate(lines) if other is None]
            def score(index: int) -> Tuple[int, int, int]:
                nearest = min((_distance(index, other) for other in same_group), default=size.bit_length())
                faces_seed = 1 if lines[index ^ 1] is not None and lines[index ^ 1] in seeds else 0
                return (nearest, faces_seed, -index)
            lines[max(free, key=score)] = entrant
    _separate_groups(lines, set(seeds))
    return lines


def _group_penalty(lines: Sequence[Optional[Tuple[str, str]]]) -> int:
    """Lower is better: players of one group meeting early weigh the most."""
    top = len(lines).bit_length()
    penalty = 0
    for i, left in enumerate(lines):
        if not left:
            continue
        for j in range(i + 1, len(lines)):
            right = lines[j]
            if right and right[0] == left[0]:
                penalty += 4 ** (top - _distance(i, j))
    return penalty


def _separate_groups(lines: List[Optional[Tuple[str, str]]], seeds: set) -> None:
    """Swap non-seeded entrants while that keeps group mates further apart."""
    movable = [index for index, entrant in enumerate(lines) if entrant and entrant not in seeds]
    best = _group_penalty(lines)
    improved = True
    while improved:
        improved = False
        for a in movable:
            for b in movable:
                if b <= a:
                    continue
                lines[a], lines[b] = lines[b], lines[a]
                penalty = _group_penalty(lines)
                if penalty < best:
                    best = penalty
                    improved = True
                else:
                    lines[a], lines[b] = lines[b], lines[a]


def _round_name(place_from: int, size: int) -> str:
    if place_from == 1:
        return {2: "Finał", 4: "Półfinał", 8: "Ćwierćfinał"}.get(size, f"1/{size // 2} finału")
    if size == 2:
        return f"o {place_from}. miejsce"
    return f"o miejsca {place_from}–{place_from + size - 1}"


def build_elimination(prefix: str, lines: Sequence[Source], *, label: str = "") -> List[Dict[str, Any]]:
    """Single elimination with every place played out, byes collapsed.

    ``prefix`` is the category ("B2 Men"), ``label`` an optional draw name
    ("Pocieszenie"). Returns bracket_knockout slot dicts with feed targets.
    """
    nodes: List[Dict[str, Any]] = []

    def phase_name(place_from: int, size: int) -> str:
        name = _round_name(place_from, size)
        return f"{prefix} — {label} {name}" if label else f"{prefix} — {name}"

    def bracket(sources: List[Source], place_from: int) -> None:
        size = len(sources)
        if size < 2:
            return
        phase = phase_name(place_from, size)
        winners: List[Source] = []
        losers: List[Source] = []
        for index in range(size // 2):
            key = (phase, index + 1)
            nodes.append({"key": key, "inputs": [sources[2 * index], sources[2 * index + 1]]})
            winners.append(("win", key))
            losers.append(("lose", key))
        bracket(winners, place_from)
        bracket(losers, place_from + size // 2)

    bracket(list(lines), 1)

    alias: Dict[Source, Source] = {}

    def resolve(source: Source) -> Source:
        while source in alias:
            source = alias[source]
        return source

    kept: List[Dict[str, Any]] = []
    for node in nodes:
        left, right = (resolve(source) for source in node["inputs"])
        key = node["key"]
        if left == DEAD and right == DEAD:
            alias[("win", key)] = DEAD
            alias[("lose", key)] = DEAD
            continue
        if left == DEAD or right == DEAD:
            alias[("win", key)] = right if left == DEAD else left
            alias[("lose", key)] = DEAD
            continue
        kept.append({"key": key, "inputs": [left, right]})

    # Renumber positions inside each phase after byes removed matches.
    positions: Dict[Tuple[str, int], Tuple[str, int]] = {}
    per_phase: Dict[str, int] = {}
    for node in kept:
        phase, _ = node["key"]
        per_phase[phase] = per_phase.get(phase, 0) + 1
        positions[node["key"]] = (phase, per_phase[phase])

    slots: Dict[Tuple[str, int], Dict[str, Any]] = {}
    for node in kept:
        phase, position = positions[node["key"]]
        slots[node["key"]] = {
            "phase": phase,
            "position": position,
            "player1_name": None,
            "player2_name": None,
            "winner_to": None,
            "loser_to": None,
        }
    for node in kept:
        slot = slots[node["key"]]
        for side, source in enumerate(node["inputs"], start=1):
            kind, value = source
            field = "player1_name" if side == 1 else "player2_name"
            if kind == "seed":
                slot[field] = value
                continue
            origin = slots[value]
            target = (slot["phase"], slot["position"], side)
            short = origin["phase"].rsplit(" — ", 1)[-1]
            if kind == "win":
                origin["winner_to"] = target
                slot[field] = f"Zwycięzca: {short} {origin['position']}"
            else:
                origin["loser_to"] = target
                slot[field] = f"Przegrany: {short} {origin['position']}"
    return list(slots.values())


def build_group_draws(
    prefix: str,
    groups: Sequence[Dict[str, Any]],
    *,
    qualifiers: int = 2,
) -> List[Dict[str, Any]]:
    """Main draw (top ``qualifiers`` of each group) plus consolation draw for the rest.

    ``groups`` are ``{"name": group name, "ranking": [names or placeholders in finishing
    order]}`` in group order (A, B, C, ...).
    """
    def tiers_for(first_rank: int, last_rank: Optional[int]) -> List[List[Tuple[str, str]]]:
        tiers: List[List[Tuple[str, str]]] = []
        deepest = max((len(group["ranking"]) for group in groups), default=0)
        stop = deepest if last_rank is None else min(last_rank, deepest)
        for rank in range(first_rank, stop + 1):
            tier = [
                (str(group["name"]), str(group["ranking"][rank - 1]))
                for group in groups
                if len(group["ranking"]) >= rank
            ]
            if tier:
                tiers.append(tier)
        return tiers

    slots: List[Dict[str, Any]] = []
    for tiers, label in ((tiers_for(1, qualifiers), ""), (tiers_for(qualifiers + 1, None), CONSOLATION)):
        if sum(len(tier) for tier in tiers) < 2:
            continue
        lines = place_entrants(tiers)
        sources: List[Source] = [("seed", entrant[1]) if entrant else DEAD for entrant in lines]
        slots.extend(build_elimination(prefix, sources, label=label))
    return slots
