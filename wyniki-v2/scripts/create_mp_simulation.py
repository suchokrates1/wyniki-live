from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from wyniki import database


SIMULATION_NAME = "Symulacja 3 MP"

DIVISIONS: list[dict[str, Any]] = [
    {
        "label": "B1 Mężczyźni",
        "gender": "M",
        "groups": {
            "": [
                ("Piotr", "Malicki"),
                ("Łukasz", "Chmielewski"),
                ("Rafał", "Sudoł"),
                ("Sławomir", "Tolak-Ciszewski"),
            ],
        },
    },
    {
        "label": "B1 Kobiety",
        "gender": "F",
        "groups": {
            "": [
                ("Justyna", "Szafranek"),
                ("Magdalena", "Kokot-Rybińska"),
                ("Magdalena", "Giecewicz"),
                ("Monika", "Dubiel"),
            ],
        },
    },
    {
        "label": "B2 Kobiety",
        "gender": "F",
        "groups": {
            "": [
                ("Katarzyna", "Pietruszyńska"),
                ("Natalia", "Marendziak-Kucza"),
                ("Małgorzata", "Ignasiak"),
            ],
        },
    },
    {
        "label": "B2 Mężczyźni",
        "gender": "M",
        "groups": {
            "A": [
                ("Mateusz", "Ciborowski"),
                ("Marian", "Wywiórski"),
                ("Łukasz", "Konklewski"),
                ("Emil", "Stopierzynski"),
            ],
            "B": [
                ("Mariusz", "Kowalski"),
                ("Michał", "Orchowski"),
                ("Tomasz", "Gawrych"),
            ],
        },
    },
    {
        "label": "B3 Kobiety",
        "gender": "F",
        "groups": {
            "": [
                ("Kamilla", "Malak"),
                ("Aleksandra", "Karakula"),
                ("Małgorzata", "Olkiewicz"),
            ],
        },
    },
    {
        "label": "B3 Mężczyźni",
        "gender": "M",
        "groups": {
            "A": [
                ("Michal", "Stypa"),
                ("Tomasz", "Błoński"),
                ("Piotr", "Kopyciński"),
            ],
            "B": [
                ("Damian", "Hortecki"),
                ("Jakub", "Maciejewski"),
                ("Marcin", "Błoński"),
            ],
        },
    },
    {
        "label": "B4 Kobiety",
        "gender": "F",
        "groups": {
            "": [
                ("Oliwia", "Marciniak"),
                ("Kinga", "Przewoźna"),
                ("Katarzyna", "Antczak"),
            ],
        },
    },
    {
        "label": "B4 Mężczyźni",
        "gender": "M",
        "groups": {
            "A": [
                ("Zbigniew", "Haftka"),
                ("Jarosław", "Skarżyński"),
                ("Adrian", "Kucza"),
                ("Miłosz", "Opoka"),
            ],
            "B": [
                ("Dmytro", "Skasyrskyy"),
                ("Kamil", "Szulc"),
                ("Mateusz", "Balwierz"),
                ("Michał", "Stanisławski"),
            ],
        },
    },
]


def _find_existing_tournament() -> dict[str, Any] | None:
    for tournament in database.fetch_tournaments():
        if tournament.get("name") == SIMULATION_NAME:
            return tournament
    return None


def _group_name(division_label: str, group_key: str) -> str:
    if not group_key:
        return division_label
    return f"{division_label} — Grupa {group_key}"


def _insert_simulation_players(tournament_id: int) -> dict[tuple[str, str, str], int]:
    player_ids: dict[tuple[str, str, str], int] = {}
    with database.db_conn() as conn:
        cursor = conn.cursor()
        for division in DIVISIONS:
            label = division["label"]
            gender = division["gender"]
            base_category = label.split()[0]
            for group_key, players in division["groups"].items():
                for first_name, last_name in players:
                    full_name = f"{first_name} {last_name}".strip()
                    cursor.execute(
                        """
                        INSERT INTO players (
                            tournament_id, name, first_name, last_name, category, country, gender, global_player_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
                        """,
                        (tournament_id, full_name, first_name, last_name, base_category, "PL", gender),
                    )
                    player_ids[(label, group_key, full_name)] = cursor.lastrowid
        conn.commit()
    return player_ids


def _save_groups(tournament_id: int, player_ids: dict[tuple[str, str, str], int]) -> None:
    groups = []
    for division in DIVISIONS:
        label = division["label"]
        for group_key, players in division["groups"].items():
            groups.append(
                {
                    "name": _group_name(label, group_key),
                    "players": [player_ids[(label, group_key, f"{first} {last}".strip())] for first, last in players],
                }
            )
    if not database.save_bracket_groups(tournament_id, groups):
        raise RuntimeError("Failed to save bracket groups")


def _playoff_slots_for_division(label: str, has_fourth_place_match: bool) -> list[dict[str, Any]]:
    slots = [
        {
            "phase": f"{label} — Półfinał",
            "position": 1,
            "player1_name": "1A",
            "player2_name": "2B",
        },
        {
            "phase": f"{label} — Półfinał",
            "position": 2,
            "player1_name": "1B",
            "player2_name": "2A",
        },
        {
            "phase": f"{label} — Finał",
            "position": 1,
            "player1_name": "Zwycięzca PF1",
            "player2_name": "Zwycięzca PF2",
        },
        {
            "phase": f"{label} — o 3. miejsce",
            "position": 1,
            "player1_name": "Przegrany PF1",
            "player2_name": "Przegrany PF2",
        },
        {
            "phase": f"{label} — o 5. miejsce",
            "position": 1,
            "player1_name": "3A",
            "player2_name": "3B",
        },
    ]
    if has_fourth_place_match:
        slots.append(
            {
                "phase": f"{label} — o 7. miejsce",
                "position": 1,
                "player1_name": "4A",
                "player2_name": "4B",
            }
        )
    return slots


def _save_knockout_placeholders(tournament_id: int) -> None:
    slots = []
    for division in DIVISIONS:
        groups = division["groups"]
        if len(groups) != 2:
            continue
        has_fourth_place_match = all(len(players) >= 4 for players in groups.values())
        slots.extend(_playoff_slots_for_division(division["label"], has_fourth_place_match))
    if not database.save_bracket_knockout(tournament_id, slots):
        raise RuntimeError("Failed to save knockout placeholders")


def create_simulation(args: argparse.Namespace) -> int:
    database.init_db()

    existing = _find_existing_tournament()
    if existing and not args.replace:
        print(f"Tournament already exists: id={existing['id']} name={SIMULATION_NAME}")
        print("Use --replace to delete and recreate the simulation.")
        return 0
    if existing and args.replace:
        if int(existing.get("is_simulation") or 0) != 1:
            raise RuntimeError(f"Refusing to replace non-simulation tournament id={existing['id']}")
        database.delete_tournament(existing["id"])

    access_key = args.access_key or os.getenv("MP_SIMULATION_ACCESS_KEY") or secrets.token_urlsafe(12)
    tournament_id = database.insert_tournament(
        SIMULATION_NAME,
        args.start_date,
        args.end_date,
        active=False,
        city=args.city,
        country="PL",
        report_email=args.report_email,
        is_public=False,
        stats_enabled=False,
        is_simulation=True,
        access_key=access_key,
    )
    if not tournament_id:
        raise RuntimeError("Failed to create tournament")

    player_ids = _insert_simulation_players(tournament_id)
    _save_groups(tournament_id, player_ids)
    _save_knockout_placeholders(tournament_id)
    if args.courts > 0:
        database.create_tournament_courts(tournament_id, args.courts)

    print(f"Created private simulation tournament: {SIMULATION_NAME}")
    print(f"id={tournament_id}")
    print(f"players={len(player_ids)}")
    print(f"access_key={access_key}")
    print("public=0 stats_enabled=0 is_simulation=1 active=0")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the private MP simulation tournament.")
    parser.add_argument("--replace", action="store_true", help="Delete and recreate the existing simulation.")
    parser.add_argument("--start-date", default="2026-04-29")
    parser.add_argument("--end-date", default="2026-12-31")
    parser.add_argument("--city", default="")
    parser.add_argument("--report-email", default="")
    parser.add_argument("--access-key", default="")
    parser.add_argument("--courts", type=int, default=0)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(create_simulation(parse_args()))
