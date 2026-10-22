"""Spoken score lines for every site language except Polish.

Polish stays in lector_lines, because those clips already exist. Tie-break
keeps its international name. B1 and B4 are categories, not words, so they
are never spoken here.
"""
from __future__ import annotations

_COUNT = {
    "en": "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty-one|twenty-two|twenty-three|twenty-four|twenty-five|twenty-six|twenty-seven|twenty-eight|twenty-nine",
    "de": "null|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig|einundzwanzig|zweiundzwanzig|dreiundzwanzig|vierundzwanzig|fünfundzwanzig|sechsundzwanzig|siebenundzwanzig|achtundzwanzig|neunundzwanzig",
    "it": "zero|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti|ventuno|ventidue|ventitré|ventiquattro|venticinque|ventisei|ventisette|ventotto|ventinove",
    "es": "cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciséis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidós|veintitrés|veinticuatro|veinticinco|veintiséis|veintisiete|veintiocho|veintinueve",
    "fr": "zéro|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt|vingt-et-un|vingt-deux|vingt-trois|vingt-quatre|vingt-cinq|vingt-six|vingt-sept|vingt-huit|vingt-neuf",
    "lt": "nulis|vienas|du|trys|keturi|penki|šeši|septyni|aštuoni|devyni|dešimt|vienuolika|dvylika|trylika|keturiolika|penkiolika|šešiolika|septyniolika|aštuoniolika|devyniolika|dvidešimt|dvidešimt vienas|dvidešimt du|dvidešimt trys|dvidešimt keturi|dvidešimt penki|dvidešimt šeši|dvidešimt septyni|dvidešimt aštuoni|dvidešimt devyni",
}
_ROUND = {
    "en": {30: "thirty", 40: "forty"},
    "de": {30: "dreißig", 40: "vierzig"},
    "it": {30: "trenta", 40: "quaranta"},
    "es": {30: "treinta", 40: "cuarenta"},
    "fr": {30: "trente", 40: "quarante"},
    "lt": {30: "trisdešimt", 40: "keturiasdešimt"},
}
_PHRASE = {
    "en": ("Court", "to", "advantage", "serving, against", "against", "Set", "active"),
    "de": ("Platz", "zu", "Vorteil", "Aufschlag, gegen", "gegen", "Satz", "aktiv"),
    "it": ("Campo", "a", "vantaggio", "al servizio, contro", "contro", "Set", "attivo"),
    "es": ("Pista", "a", "ventaja", "al servicio, contra", "contra", "Set", "activo"),
    "fr": ("Court", "à", "avantage", "au service, contre", "contre", "Set", "actif"),
    "lt": ("Kortas", "prieš", "pranašumas", "paduoda, prieš", "prieš", "Setas", "aktyvus"),
}


def _word(language: str, number: int) -> str | None:
    if number in _ROUND.get(language, {}):
        return _ROUND[language][number]
    parts = _COUNT.get(language, "").split("|")
    if 0 <= number < len(parts):
        return parts[number]
    return None


def _cap(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def court_line(court_name: object, language: str) -> str | None:
    text = str(court_name or "").strip()
    if not text.isdigit() or text == "0" or language not in _PHRASE:
        return None
    word = _word(language, int(text))
    if not word:
        return None
    return f"{_PHRASE[language][0]} {word}."


def name_line(left: str, right: str, language: str, *, serving: bool) -> str | None:
    phrase = _PHRASE.get(language)
    if not phrase or not left or not right:
        return None
    link = phrase[3] if serving else phrase[4]
    return f"{left}, {link} {right}."


def points_line(state: dict, language: str) -> str | None:
    phrase = _PHRASE.get(language)
    if not phrase:
        return None
    tie = state.get("tie") or {}
    if tie.get("visible"):
        try:
            left, right = int(tie.get("A") or 0), int(tie.get("B") or 0)
        except (TypeError, ValueError):
            return None
        pair = _pair(language, left, right)
        if not pair:
            return None
        label = "Super tie-break" if state.get("super_tiebreak_active") else "Tie-break"
        return f"{label}, {pair}."
    raw_a = str((state.get("A") or {}).get("points") or "0").strip().upper()
    raw_b = str((state.get("B") or {}).get("points") or "0").strip().upper()
    if raw_a in {"ADV", "AD", "A"}:
        other = _word(language, int(raw_b)) if raw_b.isdigit() else None
        return _cap(f"{phrase[2]} {phrase[1]} {other}.") if other else None
    if raw_b in {"ADV", "AD", "A"}:
        other = _word(language, int(raw_a)) if raw_a.isdigit() else None
        return _cap(f"{other} {phrase[1]} {phrase[2]}.") if other else None
    try:
        pair = _pair(language, int(raw_a), int(raw_b))
    except ValueError:
        return None
    return _cap(f"{pair}.") if pair else None


def _pair(language: str, left: int, right: int) -> str | None:
    spoken_left, spoken_right = _word(language, left), _word(language, right)
    if not spoken_left or not spoken_right:
        return None
    return f"{spoken_left} {_PHRASE[language][1]} {spoken_right}"


def tie_line(left: int, right: int, language: str, *, super_break: bool) -> str | None:
    pair = _pair(language, left, right)
    if not pair:
        return None
    label = "Super tie-break" if super_break else "Tie-break"
    return f"{label}, {pair}."


def set_line(number: int, left: int, right: int, language: str, *, active: bool) -> str | None:
    phrase = _PHRASE.get(language)
    word = _word(language, number)
    pair = _pair(language, left, right)
    if not phrase or not word or not pair:
        return None
    if active:
        return f"{phrase[5]} {word}, {phrase[6]}, {pair}."
    return f"{phrase[5]} {word}, {pair}."


def _player(player: dict | None) -> str:
    player = player or {}
    return " ".join(str(player.get("full_name") or player.get("surname") or "").split())


def sentences(state: dict | None, language: str) -> list[str] | None:
    """The same hybrid shape as the Polish lector, in this language."""
    if not state or language not in _PHRASE:
        return None
    name_a, name_b = _player(state.get("A")), _player(state.get("B"))
    opening = court_line(state.get("court_name") or "1", language)
    if not opening or len(name_a) < 3 or len(name_b) < 3 or name_a == "-" or name_b == "-":
        return None
    server = state.get("serve")
    if server == "A":
        names = name_line(name_a, name_b, language, serving=True)
    elif server == "B":
        names = name_line(name_b, name_a, language, serving=True)
    else:
        names = name_line(name_a, name_b, language, serving=False)
    points = points_line(state, language)
    if not names or not points:
        return None
    try:
        current = min(3, max(1, int(state.get("current_set") or 1)))
    except (TypeError, ValueError):
        current = 1
    sets: list[str] = []
    for number in range(1, current + 1):
        try:
            left = int((state.get("A") or {}).get(f"set{number}") or 0)
            right = int((state.get("B") or {}).get(f"set{number}") or 0)
        except (TypeError, ValueError):
            return None
        if number != current and left == 0 and right == 0:
            continue
        spoken = set_line(number, left, right, language, active=number == current)
        if not spoken:
            return None
        sets.append(spoken)
    return [opening, names, points, *sets] if sets else None
