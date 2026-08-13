import json

import pytest

from wyniki.services.office_workflow import OfficeWorkflowError, _create_office_group_match, _normalize_office_sets
from wyniki.services.teams import is_team_display_name


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "office-doubles.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


@pytest.fixture()
def full_app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "office-doubles-full.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app


def _insert_person(db, tournament_id: int, first: str, last: str, *, category: str = "B1") -> int:
    player_id = db.insert_player(
        tournament_id,
        name=f"{first} {last}",
        first_name=first,
        last_name=last,
        category=category,
        country="PL",
        gender="K" if first.endswith("a") else "M",
    )
    assert player_id
    return int(player_id)


def _seed_doubles_group(db):
    tournament_id = db.insert_tournament(
        "Doubles Office Cup",
        "2026-08-13",
        "2026-08-15",
        active=True,
        city="Test",
        country="PL",
    )
    doubles = db.confirm_tournament_categories(
        tournament_id, [{"label": "B1 Double", "is_doubles": True}]
    )[0]
    p1 = _insert_person(db, tournament_id, "Anna", "Kowalska")
    p2 = _insert_person(db, tournament_id, "Ewa", "Nowak")
    p3 = _insert_person(db, tournament_id, "Jan", "Lewandowski")
    p4 = _insert_person(db, tournament_id, "Piotr", "Wiśniewski")
    team_a = db.insert_tournament_team(tournament_id, doubles["id"], p1, p2)
    team_b = db.insert_tournament_team(tournament_id, doubles["id"], p3, p4)
    assert db.save_bracket_groups(
        tournament_id,
        [{
            "name": "B1 Double — Grupa A",
            "tournament_category_id": doubles["id"],
            "play_format": "round_robin",
            "teams": [team_a["id"], team_b["id"]],
        }],
    )
    group = db.fetch_bracket_groups(tournament_id)[0]
    return tournament_id, group, team_a, team_b


def test_is_team_display_name_detects_pair_label():
    assert is_team_display_name("Anna Kowalska / Ewa Nowak") is True
    assert is_team_display_name("Anna Kowalska") is False


def test_player_surname_does_not_use_second_partner(db):
    from wyniki.database.players import _player_surname

    assert _player_surname("Jan Kowalski") == "kowalski"
    assert _player_surname("Anna Kowalska / Ewa Nowak") == ""


def test_find_group_matches_does_not_use_surname_token_from_pair_label(db):
    tournament_id, group, team_a, team_b = _seed_doubles_group(db)
    with db.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO matches (
                court_id, tournament_id, status, phase, player1_name, player2_name,
                player1_sets, player2_sets, winner_name, sets_history, finish_reason, created_at
            ) VALUES (?, ?, 'finished', 'Grupowa', ?, ?, 2, 0, ?, ?, 'normal', ?)
            """,
            (
                f"t{tournament_id}-1",
                tournament_id,
                "Ewa Nowak",
                "Jan Lewandowski",
                "Ewa Nowak",
                json.dumps([
                    {"player1_games": 4, "player2_games": 1},
                    {"player1_games": 4, "player2_games": 2},
                ]),
                "2026-08-13T12:00:00",
            ),
        )
        conn.commit()
        matches = db._find_group_matches(
            cursor,
            [team_a["display_name"], team_b["display_name"]],
            "2026-08-13",
            "2026-08-15",
            tournament_id,
        )
    assert matches == []


def test_find_group_matches_accepts_reversed_partner_order(db):
    tournament_id, group, team_a, team_b = _seed_doubles_group(db)
    reversed_a = " / ".join(reversed(team_a["display_name"].split(" / ", 1)))
    reversed_b = " / ".join(reversed(team_b["display_name"].split(" / ", 1)))
    with db.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO matches (
                court_id, tournament_id, status, phase, player1_name, player2_name,
                player1_sets, player2_sets, winner_name, sets_history, finish_reason, created_at
            ) VALUES (?, ?, 'finished', 'Grupowa', ?, ?, 2, 0, ?, ?, 'normal', ?)
            """,
            (
                f"t{tournament_id}-1",
                tournament_id,
                reversed_a,
                reversed_b,
                reversed_a,
                json.dumps([
                    {"player1_games": 4, "player2_games": 1},
                    {"player1_games": 4, "player2_games": 2},
                ]),
                "2026-08-13T12:00:00",
            ),
        )
        conn.commit()
        matches = db._find_group_matches(
            cursor,
            [team_a["display_name"], team_b["display_name"]],
            "2026-08-13",
            "2026-08-15",
            tournament_id,
        )
    assert len(matches) == 1
    assert matches[0]["player1_name"] == reversed_a
    assert matches[0]["player2_name"] == reversed_b


def test_normalize_office_sets_walkover_accepts_team_names():
    team_a = "Anna Kowalska / Ewa Nowak"
    team_b = "Jan Lewandowski / Piotr Wiśniewski"
    sets, player1_sets, player2_sets = _normalize_office_sets(
        {"walkover": True, "winner_name": team_a},
        team_a,
        team_b,
    )
    assert player1_sets == 2
    assert player2_sets == 0
    assert sets[0]["player1_games"] == 4
    with pytest.raises(ValueError, match="Winner is required"):
        _normalize_office_sets(
            {"walkover": True, "winner_name": "Ewa Nowak"},
            team_a,
            team_b,
        )


def test_office_doubles_result_standings_walkover_edit_and_conflict(full_app_with_temp_db):
    from wyniki import database

    with full_app_with_temp_db.app_context():
        tournament_id, group, team_a, team_b = _seed_doubles_group(database)
        group_id = group["id"]
        schedule = [
            entry for entry in database.fetch_tournament_schedule(tournament_id)
            if entry.get("source_type") == "group"
        ]
        assert len(schedule) == 1
        schedule_id = schedule[0]["id"]

        created, status = _create_office_group_match(
            tournament_id,
            {
                "group_id": group_id,
                "schedule_id": schedule_id,
                "player1_name": team_a["display_name"],
                "player2_name": team_b["display_name"],
                "walkover": True,
                "winner_name": team_a["display_name"],
            },
        )
        assert status == 201
        assert created["match"]["player1_name"] == team_a["display_name"]
        assert created["match"]["winner_name"] == team_a["display_name"]
        assert created["match"]["finish_reason"] == "walkover"

        bracket = database.get_full_bracket(tournament_id)
        standings = {row["name"]: row for row in bracket["groups"][0]["standings"]}
        assert standings[team_a["display_name"]]["wins"] == 1
        assert standings[team_b["display_name"]]["losses"] == 1

        with pytest.raises(OfficeWorkflowError) as duplicate:
            _create_office_group_match(
                tournament_id,
                {
                    "group_id": group_id,
                    "schedule_id": schedule_id,
                    "player1_name": team_a["display_name"],
                    "player2_name": team_b["display_name"],
                    "sets": [
                        {"player1_games": 4, "player2_games": 1},
                        {"player1_games": 4, "player2_games": 2},
                    ],
                },
            )
        assert duplicate.value.status_code == 409

        from wyniki.db_models import Match, db

        match = db.session.get(Match, created["match"]["match_id"])
        sets_history, player1_sets, player2_sets = _normalize_office_sets(
            {
                "sets": [
                    {"player1_games": 1, "player2_games": 4},
                    {"player1_games": 2, "player2_games": 4},
                ]
            },
            team_a["display_name"],
            team_b["display_name"],
        )
        match.finish_reason = "normal"
        match.winner_name = team_b["display_name"]
        match.result_note = None
        match.player1_sets = player1_sets
        match.player2_sets = player2_sets
        match.sets_history = json.dumps(sets_history)
        db.session.commit()

        bracket = database.get_full_bracket(tournament_id)
        standings = {row["name"]: row for row in bracket["groups"][0]["standings"]}
        assert standings[team_b["display_name"]]["wins"] == 1
        assert standings[team_a["display_name"]]["losses"] == 1
        assert bracket["groups"][0]["standings"][0]["name"] == team_b["display_name"]
        assert all(" / " in row["name"] for row in bracket["groups"][0]["standings"])


def test_office_doubles_knockout_walkover_uses_team_names(full_app_with_temp_db):
    from wyniki import database

    with full_app_with_temp_db.app_context():
        tournament_id = database.insert_tournament(
            "Doubles KO Cup", "2026-08-13", "2026-08-15", active=True, city="Test", country="PL",
        )
        doubles = database.confirm_tournament_categories(
            tournament_id, [{"label": "B1 Double", "is_doubles": True}]
        )[0]
        p1 = _insert_person(database, tournament_id, "Anna", "Kowalska")
        p2 = _insert_person(database, tournament_id, "Ewa", "Nowak")
        p3 = _insert_person(database, tournament_id, "Jan", "Lewandowski")
        p4 = _insert_person(database, tournament_id, "Piotr", "Wiśniewski")
        team_a = database.insert_tournament_team(tournament_id, doubles["id"], p1, p2)
        team_b = database.insert_tournament_team(tournament_id, doubles["id"], p3, p4)
        assert database.save_bracket_groups(
            tournament_id,
            [{
                "name": "B1 Double",
                "tournament_category_id": doubles["id"],
                "play_format": "knockout",
                "teams": [team_a["id"], team_b["id"]],
            }],
        )
        slots = database.fetch_bracket_knockout(tournament_id)
        assert len(slots) == 1
        assert slots[0]["player1_name"] == team_a["display_name"]
        assert slots[0]["player2_name"] == team_b["display_name"]
        schedule = [
            entry for entry in database.fetch_tournament_schedule(tournament_id)
            if entry.get("source_type") == "knockout"
        ]
        assert schedule

        from wyniki.services.office_workflow import _create_office_knockout_match

        created, status = _create_office_knockout_match(
            tournament_id,
            {
                "schedule_id": schedule[0]["id"],
                "player1_name": team_a["display_name"],
                "player2_name": team_b["display_name"],
                "walkover": True,
                "winner_name": team_b["display_name"],
            },
        )
        assert status == 201
        assert created["match"]["winner_name"] == team_b["display_name"]
        refreshed = database.fetch_bracket_knockout(tournament_id)[0]
        assert refreshed["winner_name"] == team_b["display_name"]

        with pytest.raises(OfficeWorkflowError) as duplicate:
            _create_office_knockout_match(
                tournament_id,
                {
                    "schedule_id": schedule[0]["id"],
                    "player1_name": team_a["display_name"],
                    "player2_name": team_b["display_name"],
                    "sets": [
                        {"player1_games": 4, "player2_games": 1},
                        {"player1_games": 4, "player2_games": 2},
                    ],
                },
            )
        assert duplicate.value.status_code == 409
