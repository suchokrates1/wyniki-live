import json

import pytest

from wyniki.services.teams import DEFAULT_PLAY_FORMAT


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "play-format.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def _create_tournament(db) -> int:
    tournament_id = db.insert_tournament(
        "Play Format Cup",
        "2026-08-13",
        "2026-08-15",
        active=True,
        city="Test",
        country="PL",
    )
    assert tournament_id
    return int(tournament_id)


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


def _player_name(db, player_id: int) -> str:
    with db.db_conn() as conn:
        row = conn.execute("SELECT name FROM players WHERE id = ?", (player_id,)).fetchone()
    return str(row["name"])


def _insert_finished_group_match(db, tournament_id: int, group_id: int, player1: str, player2: str, created_at: str) -> None:
    with db.db_conn() as conn:
        conn.execute(
            """
            INSERT INTO matches (
                court_id, player1_name, player2_name, status, tournament_id, bracket_group_id, phase,
                player1_sets, player2_sets, sets_history, created_at, updated_at
            ) VALUES (?, ?, ?, 'finished', ?, ?, 'Grupowa', 2, 0, ?, ?, ?)
            """,
            (
                f"t{tournament_id}-1",
                player1,
                player2,
                tournament_id,
                group_id,
                json.dumps([
                    {"set_number": 1, "player1_games": 4, "player2_games": 1},
                    {"set_number": 2, "player1_games": 4, "player2_games": 2},
                ]),
                created_at,
                created_at,
            ),
        )
        conn.commit()


def test_knockout_group_gets_no_round_robin_schedule(db):
    tournament_id = _create_tournament(db)
    players = [
        _insert_person(db, tournament_id, "Anna", "A1"),
        _insert_person(db, tournament_id, "Ewa", "A2"),
        _insert_person(db, tournament_id, "Iga", "A3"),
        _insert_person(db, tournament_id, "Ola", "A4"),
    ]
    assert db.save_bracket_groups(
        tournament_id,
        [{"name": "B1 Kobiety", "play_format": "knockout", "players": players}],
    )
    schedule = db.fetch_tournament_schedule(tournament_id)
    group_rows = [row for row in schedule if row.get("source_type") == "group" or row.get("phase") == "Grupowa"]
    knockout_rows = [row for row in schedule if row.get("source_type") == "knockout"]
    assert group_rows == []
    assert knockout_rows
    assert db.expected_group_matches_count(
        tournament_id,
        db.fetch_bracket_groups(tournament_id)[0]["id"],
        4,
    ) == 0


def test_knockout_group_rematch_is_skipped(db):
    tournament_id = _create_tournament(db)
    players = [
        _insert_person(db, tournament_id, "Jan", "Kowalski"),
        _insert_person(db, tournament_id, "Piotr", "Nowak"),
    ]
    assert db.save_bracket_groups(
        tournament_id,
        [{"name": "B2 Mężczyźni", "play_format": "knockout", "players": players}],
    )
    group_id = db.fetch_bracket_groups(tournament_id)[0]["id"]
    result = db.ensure_group_rematch_schedule_entries(tournament_id, [group_id])
    assert result["skipped"] == [{"group_id": group_id, "reason": "knockout_format"}]
    schedule = db.fetch_tournament_schedule(tournament_id)
    assert all(row.get("source_type") != "group_rematch" for row in schedule)


def test_round_robin_group_does_not_wait_or_block_groups_knockout_cup(db):
    tournament_id = _create_tournament(db)
    rr_players = [
        _insert_person(db, tournament_id, "Adam", "RR1", category="B4"),
        _insert_person(db, tournament_id, "Bartek", "RR2", category="B4"),
    ]
    a_players = [
        _insert_person(db, tournament_id, "Anna", "A1"),
        _insert_person(db, tournament_id, "Ewa", "A2"),
    ]
    b_players = [
        _insert_person(db, tournament_id, "Iga", "B1"),
        _insert_person(db, tournament_id, "Ola", "B2"),
    ]
    assert db.save_bracket_groups(
        tournament_id,
        [
            {"name": "B4 Mixed", "play_format": "round_robin", "players": rr_players},
            {"name": "B1 Kobiety — Grupa A", "play_format": "groups_knockout", "players": a_players},
            {"name": "B1 Kobiety — Grupa B", "play_format": "groups_knockout", "players": b_players},
        ],
    )
    groups = {group["name"]: group for group in db.fetch_bracket_groups(tournament_id)}
    _insert_finished_group_match(
        db, tournament_id, groups["B1 Kobiety — Grupa A"]["id"],
        _player_name(db, a_players[0]), _player_name(db, a_players[1]), "2026-08-13T09:00:00",
    )
    _insert_finished_group_match(
        db, tournament_id, groups["B1 Kobiety — Grupa B"]["id"],
        _player_name(db, b_players[0]), _player_name(db, b_players[1]), "2026-08-13T10:00:00",
    )

    generated = db.maybe_generate_knockout_from_completed_groups(tournament_id)
    assert generated["status"] == "ok"
    knockout = db.fetch_bracket_knockout(tournament_id)
    phases = [slot["phase"] for slot in knockout]
    assert all(not phase.startswith("B4 Mixed") for phase in phases)
    semis = [slot for slot in knockout if slot["phase"] == "B1 Kobiety — Półfinał"]
    assert len(semis) == 2
    assert {(slot["player1_name"], slot["player2_name"]) for slot in semis} == {
        (_player_name(db, a_players[0]), _player_name(db, b_players[1])),
        (_player_name(db, b_players[0]), _player_name(db, a_players[1])),
    }


def test_two_groups_knockout_still_cross_1a_2b(db):
    tournament_id = _create_tournament(db)
    a_players = [
        _insert_person(db, tournament_id, "Anna", "A1"),
        _insert_person(db, tournament_id, "Ewa", "A2"),
    ]
    b_players = [
        _insert_person(db, tournament_id, "Iga", "B1"),
        _insert_person(db, tournament_id, "Ola", "B2"),
    ]
    assert db.save_bracket_groups(
        tournament_id,
        [
            {"name": "B1 Kobiety — Grupa A", "play_format": DEFAULT_PLAY_FORMAT, "players": a_players},
            {"name": "B1 Kobiety — Grupa B", "play_format": DEFAULT_PLAY_FORMAT, "players": b_players},
        ],
    )
    groups = {group["name"]: group for group in db.fetch_bracket_groups(tournament_id)}
    _insert_finished_group_match(
        db, tournament_id, groups["B1 Kobiety — Grupa A"]["id"],
        _player_name(db, a_players[0]), _player_name(db, a_players[1]), "2026-08-13T09:00:00",
    )
    _insert_finished_group_match(
        db, tournament_id, groups["B1 Kobiety — Grupa B"]["id"],
        _player_name(db, b_players[0]), _player_name(db, b_players[1]), "2026-08-13T10:00:00",
    )
    generated = db.maybe_generate_knockout_from_completed_groups(tournament_id)
    assert generated["status"] == "ok"
    semis = [
        slot for slot in db.fetch_bracket_knockout(tournament_id)
        if slot["phase"] == "B1 Kobiety — Półfinał"
    ]
    assert {(slot["player1_name"], slot["player2_name"]) for slot in semis} == {
        (_player_name(db, a_players[0]), _player_name(db, b_players[1])),
        (_player_name(db, b_players[0]), _player_name(db, a_players[1])),
    }


def test_knockout_office_progress_tracks_cup_slots(db):
    tournament_id = _create_tournament(db)
    players = [
        _insert_person(db, tournament_id, "Jan", "Kowalski"),
        _insert_person(db, tournament_id, "Piotr", "Nowak"),
    ]
    assert db.save_bracket_groups(
        tournament_id,
        [{"name": "B2 Mężczyźni", "play_format": "knockout", "players": players}],
    )
    expected, finished = db.count_group_knockout_progress(tournament_id, "B2 Mężczyźni")
    assert expected == 1
    assert finished == 0
    group = db.fetch_bracket_groups(tournament_id)[0]
    assert db.expected_group_matches_count(tournament_id, group["id"], 2) == 0


def test_round_robin_schedule_exists_without_knockout_slots(db):
    tournament_id = _create_tournament(db)
    players = [
        _insert_person(db, tournament_id, "Adam", "RR1", category="B4"),
        _insert_person(db, tournament_id, "Bartek", "RR2", category="B4"),
        _insert_person(db, tournament_id, "Cezary", "RR3", category="B4"),
    ]
    assert db.save_bracket_groups(
        tournament_id,
        [{"name": "B4 Mixed", "play_format": "round_robin", "players": players}],
    )
    schedule = db.fetch_tournament_schedule(tournament_id)
    assert [row for row in schedule if row.get("source_type") == "group"]
    assert db.fetch_bracket_knockout(tournament_id) == []
    groups = db.fetch_bracket_groups(tournament_id)
    _insert_finished_group_match(
        db, tournament_id, groups[0]["id"],
        _player_name(db, players[0]), _player_name(db, players[1]), "2026-08-13T09:00:00",
    )
    _insert_finished_group_match(
        db, tournament_id, groups[0]["id"],
        _player_name(db, players[0]), _player_name(db, players[2]), "2026-08-13T10:00:00",
    )
    _insert_finished_group_match(
        db, tournament_id, groups[0]["id"],
        _player_name(db, players[1]), _player_name(db, players[2]), "2026-08-13T11:00:00",
    )
    generated = db.maybe_generate_knockout_from_completed_groups(tournament_id)
    assert generated.get("status") in {"skipped", "pending"}
    assert db.fetch_bracket_knockout(tournament_id) == []


def test_knockout_group_with_one_competitor_skips_tree(db):
    tournament_id = _create_tournament(db)
    player = _insert_person(db, tournament_id, "Anna", "Solo")
    assert db.save_bracket_groups(
        tournament_id,
        [{"name": "B1 Kobiety", "play_format": "knockout", "players": [player]}],
    )
    schedule = db.fetch_tournament_schedule(tournament_id)
    assert [row for row in schedule if row.get("phase") == "Grupowa"] == []
    assert db.fetch_bracket_knockout(tournament_id) == []
