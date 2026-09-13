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


def build_elimination(
    prefix: str,
    lines: Sequence[Source],
    *,
    label: str = "",
    all_places: bool = True,
    third_place: bool = True,
) -> List[Dict[str, Any]]:
    """Single elimination with byes collapsed.

    ``prefix`` is the category ("B2 Men"), ``label`` an optional draw name
    ("Pocieszenie"). With ``all_places`` every place is played out; without it only the
    title and the 3rd place are. Returns bracket_knockout slot dicts with feed targets.
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
        if all_places or (third_place and place_from == 1 and size == 4):
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


PLACES = ("all", "third", "none")


def places_flags(places: str) -> Tuple[bool, bool]:
    """(every place played out, 3rd-place match) for "all" / "third" / "none"."""
    value = places if places in PLACES else "all"
    return value == "all", value != "none"


def swap_lines(lines: Sequence[Any], swaps: Optional[Sequence[Sequence[int]]]) -> List[Any]:
    """Apply manual swaps of first-round lines, in order; invalid pairs are ignored."""
    result = list(lines)
    for pair in swaps or []:
        try:
            left, right = int(pair[0]), int(pair[1])
        except (TypeError, ValueError, IndexError):
            continue
        if 0 <= left < len(result) and 0 <= right < len(result) and left != right:
            result[left], result[right] = result[right], result[left]
    return result


def _tiers(groups: Sequence[Dict[str, Any]], first_rank: int, last_rank: Optional[int]) -> List[List[Tuple[str, str]]]:
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


def group_draw_lines(
    groups: Sequence[Dict[str, Any]],
    *,
    qualifiers: int = 2,
    consolation: bool = True,
) -> Dict[str, Optional[List[Optional[Tuple[str, str]]]]]:
    """First-round lines of the main draw and the consolation draw, before manual swaps."""
    result: Dict[str, Optional[List[Optional[Tuple[str, str]]]]] = {"main": None, "consolation": None}
    main = _tiers(groups, 1, qualifiers)
    if sum(len(tier) for tier in main) >= 2:
        result["main"] = place_entrants(main)
    if consolation:
        rest = _tiers(groups, qualifiers + 1, None)
        if sum(len(tier) for tier in rest) >= 2:
            result["consolation"] = place_entrants(rest)
    return result


def build_group_draws(
    prefix: str,
    groups: Sequence[Dict[str, Any]],
    *,
    qualifiers: int = 2,
    places: str = "all",
    consolation: bool = True,
    swaps: Optional[Dict[str, Sequence[Sequence[int]]]] = None,
) -> List[Dict[str, Any]]:
    """Main draw (top ``qualifiers`` of each group) plus, optionally, a consolation draw for
    the rest. ``groups`` are ``{"name", "ranking": [names or placeholders in order]}``."""
    all_places, third_place = places_flags(places)
    lines = group_draw_lines(groups, qualifiers=qualifiers, consolation=consolation)
    slots: List[Dict[str, Any]] = []
    for key, label in (("main", ""), ("consolation", CONSOLATION)):
        draw = lines.get(key)
        if not draw:
            continue
        draw = swap_lines(draw, (swaps or {}).get(key))
        sources: List[Source] = [("seed", entrant[1]) if entrant else DEAD for entrant in draw]
        slots.extend(build_elimination(prefix, sources, label=label, all_places=all_places, third_place=third_place))
    return slots


def direct_draw_lines(names: Sequence[str]) -> List[Optional[str]]:
    """First-round lines of a straight knockout in seeding order (byes to the top seeds)."""
    entrants = [str(name) for name in names if str(name or "").strip()]
    if len(entrants) < 2:
        return []
    size = _next_power_of_two(len(entrants))
    return [entrants[seed - 1] if seed <= len(entrants) else None for seed in seed_lines(size)]


def build_direct_draw(
    prefix: str,
    names: Sequence[str],
    *,
    places: str = "third",
    swaps: Optional[Sequence[Sequence[int]]] = None,
) -> List[Dict[str, Any]]:
    """Straight knockout for a list in seeding order: byes to the top seeds."""
    lines = swap_lines(direct_draw_lines(names), swaps)
    if not lines:
        return []
    all_places, third_place = places_flags(places)
    sources: List[Source] = [("seed", name) if name else DEAD for name in lines]
    return build_elimination(prefix, sources, all_places=all_places, third_place=third_place)


def cross_draw_lines(groups: Sequence[Dict[str, Any]]) -> List[Tuple[str, str]]:
    """Semifinal lines for two groups: 1A-2B, 1B-2A."""
    first, second = groups[0], groups[1]
    return [
        (str(first["name"]), str(first["ranking"][0])),
        (str(second["name"]), str(second["ranking"][1])),
        (str(second["name"]), str(second["ranking"][0])),
        (str(first["name"]), str(first["ranking"][1])),
    ]


def build_cross_draw(
    prefix: str,
    groups: Sequence[Dict[str, Any]],
    *,
    places: str = "all",
    swaps: Optional[Sequence[Sequence[int]]] = None,
) -> List[Dict[str, Any]]:
    """Two groups: crossed semifinals, final, 3rd place; with every place also 3rd v 3rd for
    5th and 4th v 4th for 7th."""
    if len(groups) < 2 or any(len(group["ranking"]) < 2 for group in groups[:2]):
        return []
    _, third_place = places_flags(places)
    lines = swap_lines(cross_draw_lines(groups), swaps)
    sources: List[Source] = [("seed", entrant[1]) for entrant in lines]
    slots = build_elimination(prefix, sources, all_places=False, third_place=third_place)
    if places == "all":
        first, second = groups[0]["ranking"], groups[1]["ranking"]
        for rank, place in ((3, 5), (4, 7)):
            if len(first) >= rank and len(second) >= rank:
                slots.append({
                    "phase": f"{prefix} — o {place}. miejsce", "position": 1,
                    "player1_name": first[rank - 1], "player2_name": second[rank - 1],
                    "winner_to": None, "loser_to": None,
                })
    return slots


def build_table_final(prefix: str, ranking: Sequence[str], *, places: str = "third") -> List[Dict[str, Any]]:
    """One group: 1st v 2nd for the title and, with 4 or more players, 3rd v 4th."""
    if len(ranking) < 2:
        return []
    slots = [{"phase": f"{prefix} — Finał", "position": 1, "player1_name": ranking[0], "player2_name": ranking[1], "winner_to": None, "loser_to": None}]
    if places != "none" and len(ranking) >= 4:
        slots.append({"phase": f"{prefix} — o 3. miejsce", "position": 1, "player1_name": ranking[2], "player2_name": ranking[3], "winner_to": None, "loser_to": None})
    return slots
