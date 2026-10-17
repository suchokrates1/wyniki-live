"""Polish sentences for the court lector. No audio lives here."""
from __future__ import annotations

_NOMINATIVE = {
    0: "zero",
    1: "jeden",
    2: "dwa",
    3: "trzy",
    4: "cztery",
    5: "pięć",
    6: "sześć",
    7: "siedem",
    8: "osiem",
    9: "dziewięć",
    10: "dziesięć",
    11: "jedenaście",
    12: "dwanaście",
    13: "trzynaście",
    14: "czternaście",
    15: "piętnaście",
    30: "trzydzieści",
    40: "czterdzieści",
}
_GENITIVE = {
    0: "zera",
    1: "jednego",
    2: "dwóch",
    3: "trzech",
    4: "czterech",
    5: "pięciu",
    6: "sześciu",
    7: "siedmiu",
    8: "ośmiu",
    9: "dziewięciu",
    10: "dziesięciu",
    11: "jedenastu",
    12: "dwunastu",
    13: "trzynastu",
    14: "czternastu",
    15: "piętnastu",
    30: "trzydziestu",
    40: "czterdziestu",
}
_SET_WORD = {1: "jeden", 2: "dwa", 3: "trzy"}
_TEENS = {
    16: ("szesnaście", "szesnastu"),
    17: ("siedemnaście", "siedemnastu"),
    18: ("osiemnaście", "osiemnastu"),
    19: ("dziewiętnaście", "dziewiętnastu"),
}


def _spell(number: int, *, genitive: bool) -> str | None:
    table = _GENITIVE if genitive else _NOMINATIVE
    if number in table:
        return table[number]
    pair = _TEENS.get(number)
    if pair:
        return pair[1] if genitive else pair[0]
    if number == 20:
        return "dwudziestu" if genitive else "dwadzieścia"
    if 21 <= number <= 29:
        unit = _spell(number - 20, genitive=genitive)
        if unit:
            head = "dwudziestu" if genitive else "dwadzieścia"
            return f"{head} {unit}"
    return None


def court_sentence(court_name: object) -> str | None:
    """'Kort dwa.' for a court whose name is its number. Anything else is silent."""
    text = str(court_name or "").strip()
    if not text.isdigit() or text == "0":
        return None
    word = _spell(int(text), genitive=False)
    if not word:
        return None
    return f"Kort {word}."


def _name(player: dict | None) -> str:
    player = player or {}
    text = " ".join(str(player.get("full_name") or player.get("surname") or "").split())
    if not text or text == "-":
        return ""
    return text


def _pair(left: int, right: int) -> str | None:
    spoken_left = _spell(left, genitive=False)
    spoken_right = _spell(right, genitive=True)
    if not spoken_left or not spoken_right:
        return None
    return f"{spoken_left} do {spoken_right}"


def _point_word(raw: object, *, side: str) -> str | None:
    text = str(raw or "0").strip().upper()
    if text in {"ADV", "AD", "A"}:
        return "przewaga"
    try:
        number = int(text)
    except ValueError:
        return None
    words = _NOMINATIVE if side == "left" else _GENITIVE
    return words.get(number)


def _points_sentence(state: dict) -> str | None:
    tie = state.get("tie") or {}
    if tie.get("visible"):
        try:
            left = int(tie.get("A") or 0)
            right = int(tie.get("B") or 0)
        except (TypeError, ValueError):
            return None
        pair = _pair(left, right)
        if pair is None:
            return None
        label = "Super tie-break" if state.get("super_tiebreak_active") else "Tie-break"
        return f"{label}, {pair}."

    player_a = state.get("A") or {}
    player_b = state.get("B") or {}
    left_word = _point_word(player_a.get("points"), side="left")
    right_word = _point_word(player_b.get("points"), side="right")
    if left_word == "przewaga" and right_word:
        return "Przewaga do czterdziestu."
    if right_word == "przewaga" and left_word:
        return "Czterdzieści do przewagi."
    if not left_word or not right_word:
        return None
    spoken = f"{left_word} do {right_word}."
    return spoken[:1].upper() + spoken[1:]


def _set_sentence(number: int, left: int, right: int, *, active: bool) -> str | None:
    word = _SET_WORD.get(number)
    score = _pair(left, right)
    if word is None or score is None:
        return None
    if active:
        return f"Set {word}, aktywny, {score}."
    return f"Set {word}, {score}."


def score_shelf() -> list[str]:
    """Closed Polish score lines. Names are not here; those are made on demand."""
    lines = ["Kort jeden."]
    for left in (0, 15, 30, 40):
        for right in (0, 15, 30, 40):
            spoken = f"{_spell(left, genitive=False)} do {_spell(right, genitive=True)}."
            lines.append(spoken[:1].upper() + spoken[1:])
    lines.extend(["Przewaga do czterdziestu.", "Czterdzieści do przewagi."])
    for number in (1, 2, 3):
        for active in (True, False):
            for left in range(8):
                for right in range(8):
                    if not active and left == 0 and right == 0:
                        continue
                    line = _set_sentence(number, left, right, active=active)
                    if line:
                        lines.append(line)
    return lines


def tiebreak_shelf() -> list[str]:
    lines = []
    for super_break in (False, True):
        label = "Super tie-break" if super_break else "Tie-break"
        for left in range(11):
            for right in range(11):
                pair = _pair(left, right)
                if pair:
                    lines.append(f"{label}, {pair}.")
    return lines


def court_state_for_lector(court_name: str = "1") -> dict | None:
    """The live state of the court with this name.

    Several tournaments can each have a court called 1. The one that currently
    has two names is the match being read. If more than one does, the latest
    update wins.
    """
    from .court_manager import serialize_all_states

    named = []
    for state in serialize_all_states().values():
        if str(state.get("court_name") or "").strip() != str(court_name):
            continue
        if sentences_for_court(state):
            named.append(state)
    if not named:
        return None
    named.sort(key=lambda state: str(state.get("updated") or ""))
    return named[-1]


def sentences_for_court(state: dict | None) -> list[str] | None:
    """The hybrid sentences for court 1, or None when the court has no match."""
    if not state:
        return None
    name_a = _name(state.get("A"))
    name_b = _name(state.get("B"))
    opening = court_sentence(state.get("court_name") or "1")
    if not opening or not name_a or not name_b:
        return None
    server = state.get("serve")
    if server == "A":
        names = f"{name_a}, serwuje, kontra {name_b}."
    elif server == "B":
        names = f"{name_b}, serwuje, kontra {name_a}."
    else:
        names = f"{name_a}, kontra {name_b}."

    points = _points_sentence(state)
    if not points:
        return None

    try:
        current = int(state.get("current_set") or 1)
    except (TypeError, ValueError):
        current = 1
    current = min(3, max(1, current))
    sets: list[str] = []
    for number in range(1, current + 1):
        try:
            left = int((state.get("A") or {}).get(f"set{number}") or 0)
            right = int((state.get("B") or {}).get(f"set{number}") or 0)
        except (TypeError, ValueError):
            return None
        if number != current and left == 0 and right == 0:
            continue
        spoken = _set_sentence(number, left, right, active=number == current)
        if not spoken:
            return None
        sets.append(spoken)
    if not sets:
        return None
    return [opening, names, points, *sets]
