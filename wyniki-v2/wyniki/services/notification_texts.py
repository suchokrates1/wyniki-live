"""Notification wording, in the language each subscription asked for.

The text is rendered here rather than in the service worker because only the
server knows a subscription's language; a worker can only guess from the device.
Missing languages fall back to Polish, which is what the rest of the site does.
"""

from __future__ import annotations

DEFAULT_LANGUAGE = "pl"

TEXTS: dict[str, dict[str, str]] = {
    "pl": {
        "match_started_title": "Kort {court}",
        "match_started_body": "Mecz się rozpoczął",
        "plan_published_title": "Twój mecz jest w planie",
        "fixture_changed_title": "Zmiana w Twoim meczu",
        "court": "kort {court}",
    },
    "en": {
        "match_started_title": "Court {court}",
        "match_started_body": "The match has started",
        "plan_published_title": "Your match is in the schedule",
        "fixture_changed_title": "Your match has changed",
        "court": "court {court}",
    },
    "de": {
        "match_started_title": "Platz {court}",
        "match_started_body": "Das Spiel hat begonnen",
        "plan_published_title": "Dein Spiel steht im Plan",
        "fixture_changed_title": "Änderung bei deinem Spiel",
        "court": "Platz {court}",
    },
    "it": {
        "match_started_title": "Campo {court}",
        "match_started_body": "La partita è iniziata",
        "plan_published_title": "La tua partita è in programma",
        "fixture_changed_title": "Cambio nella tua partita",
        "court": "campo {court}",
    },
    "es": {
        "match_started_title": "Pista {court}",
        "match_started_body": "El partido ha empezado",
        "plan_published_title": "Tu partido está en el calendario",
        "fixture_changed_title": "Cambio en tu partido",
        "court": "pista {court}",
    },
    "fr": {
        "match_started_title": "Court {court}",
        "match_started_body": "Le match a commencé",
        "plan_published_title": "Votre match est au programme",
        "fixture_changed_title": "Changement pour votre match",
        "court": "court {court}",
    },
    "lt": {
        "match_started_title": "Aikštelė {court}",
        "match_started_body": "Mačas prasidėjo",
        "plan_published_title": "Jūsų mačas yra tvarkaraštyje",
        "fixture_changed_title": "Jūsų mačo pakeitimas",
        "court": "aikštelė {court}",
    },
}


def text(lang: str, key: str, **kwargs) -> str:
    table = TEXTS.get((lang or "").lower()[:2]) or TEXTS[DEFAULT_LANGUAGE]
    template = table.get(key) or TEXTS[DEFAULT_LANGUAGE].get(key, "")
    try:
        return template.format(**kwargs)
    except (KeyError, IndexError):
        return template


def join_details(*parts: str) -> str:
    return " · ".join(part for part in parts if part)
