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
        "reminder_title": "Twój mecz za chwilę",
        "reminder_body": "za około {minutes} min",
        "delay_title": "Twój mecz się opóźni",
        "delay_body": "poprzedni mecz potrwa jeszcze około {minutes} min",
    },
    "en": {
        "match_started_title": "Court {court}",
        "match_started_body": "The match has started",
        "plan_published_title": "Your match is in the schedule",
        "fixture_changed_title": "Your match has changed",
        "court": "court {court}",
        "reminder_title": "Your match is coming up",
        "reminder_body": "in about {minutes} min",
        "delay_title": "Your match will be late",
        "delay_body": "the match before yours needs about {minutes} more min",
    },
    "de": {
        "match_started_title": "Platz {court}",
        "match_started_body": "Das Spiel hat begonnen",
        "plan_published_title": "Dein Spiel steht im Plan",
        "fixture_changed_title": "Änderung bei deinem Spiel",
        "court": "Platz {court}",
        "reminder_title": "Dein Spiel steht an",
        "reminder_body": "in etwa {minutes} Min",
        "delay_title": "Dein Spiel verspätet sich",
        "delay_body": "das Spiel davor braucht noch etwa {minutes} Min",
    },
    "it": {
        "match_started_title": "Campo {court}",
        "match_started_body": "La partita è iniziata",
        "plan_published_title": "La tua partita è in programma",
        "fixture_changed_title": "Cambio nella tua partita",
        "court": "campo {court}",
        "reminder_title": "La tua partita si avvicina",
        "reminder_body": "tra circa {minutes} min",
        "delay_title": "La tua partita sarà in ritardo",
        "delay_body": "la partita precedente durerà ancora circa {minutes} min",
    },
    "es": {
        "match_started_title": "Pista {court}",
        "match_started_body": "El partido ha empezado",
        "plan_published_title": "Tu partido está en el calendario",
        "fixture_changed_title": "Cambio en tu partido",
        "court": "pista {court}",
        "reminder_title": "Tu partido se acerca",
        "reminder_body": "en unos {minutes} min",
        "delay_title": "Tu partido se retrasará",
        "delay_body": "el partido anterior durará unos {minutes} min más",
    },
    "fr": {
        "match_started_title": "Court {court}",
        "match_started_body": "Le match a commencé",
        "plan_published_title": "Votre match est au programme",
        "fixture_changed_title": "Changement pour votre match",
        "court": "court {court}",
        "reminder_title": "Votre match approche",
        "reminder_body": "dans environ {minutes} min",
        "delay_title": "Votre match sera en retard",
        "delay_body": "le match précédent durera encore environ {minutes} min",
    },
    "lt": {
        "match_started_title": "Aikštelė {court}",
        "match_started_body": "Mačas prasidėjo",
        "plan_published_title": "Jūsų mačas yra tvarkaraštyje",
        "fixture_changed_title": "Jūsų mačo pakeitimas",
        "court": "aikštelė {court}",
        "reminder_title": "Jūsų mačas netrukus",
        "reminder_body": "maždaug po {minutes} min",
        "delay_title": "Jūsų mačas vėluos",
        "delay_body": "ankstesnis mačas truks dar maždaug {minutes} min",
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
