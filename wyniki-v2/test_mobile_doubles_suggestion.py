import pytest


@pytest.fixture()
def umpire_app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-umpire-doubles.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from flask import Flask
    from wyniki import database
    from wyniki.db_models import db
    from wyniki.api.umpire_api import blueprint as umpire_blueprint

    database.init_db()

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)
    app.register_blueprint(umpire_blueprint)
    return app


def _insert_person(db, tournament_id: int, first: str, last: str) -> int:
    player_id = db.insert_player(
        tournament_id,
        name=f"{first} {last}",
        first_name=first,
        last_name=last,
        category="B1",
        country="PL",
        gender="K" if first.endswith("a") else "M",
    )
    assert player_id
    return int(player_id)


def _reverse_pair(label: str) -> str:
    left, right = label.split(" / ", 1)
    return f"{right} / {left}"


def _seed_doubles_suggestion(db):
    tournament_id = db.insert_tournament(
        "Doubles Suggestion Cup",
        "2026-08-13",
        "2026-08-15",
        active=True,
        city="Test",
        country="PL",
    )
    db.insert_court(
        f"t{tournament_id}-1",
        pin="1111",
        tournament_id=tournament_id,
        name="Kort 1",
        display_order=1,
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
    schedule = db.fetch_tournament_schedule(tournament_id)
    assert len(schedule) == 1
    entry = db.update_tournament_schedule_entry(
        tournament_id,
        schedule[0]["id"],
        {
            "day_date": "2026-08-13",
            "scheduled_time": "10:30",
            "court_id": f"t{tournament_id}-1",
            "status": "planned",
        },
    )
    assert entry
    return tournament_id, group, team_a, team_b, entry


def test_mobile_doubles_suggestion_includes_is_doubles_and_partners(umpire_app_with_temp_db):
    from wyniki import database

    app = umpire_app_with_temp_db
    with app.app_context():
        tournament_id, group, team_a, team_b, entry = _seed_doubles_suggestion(database)

    response = app.test_client().get(
        f"/api/courts/t{tournament_id}-1/suggested-match",
        query_string={"tournament_id": tournament_id, "at": "2026-08-13T10:20:00+00:00"},
    )
    assert response.status_code == 200
    suggestion = response.get_json()["suggestion"]
    assert suggestion["id"] == entry["id"]
    assert suggestion["is_doubles"] is True
    assert suggestion["player1_name"] == team_a["display_name"]
    assert suggestion["player2_name"] == team_b["display_name"]
    assert suggestion["player1"]["first_name"] == "Anna"
    assert suggestion["player1"]["last_name"] == "Kowalska"
    assert suggestion["player1"]["partner"]["first_name"] == "Ewa"
    assert suggestion["player1"]["partner"]["last_name"] == "Nowak"
    assert suggestion["player2"]["first_name"] == "Jan"
    assert suggestion["player2"]["last_name"] == "Lewandowski"
    assert suggestion["player2"]["partner"]["first_name"] == "Piotr"
    assert suggestion["player2"]["partner"]["last_name"] == "Wiśniewski"
    assert suggestion["player1"]["id"] == team_a["player1"]["id"] or suggestion["player1"]["id"] == team_a["player2"]["id"]
    assert suggestion["player1"]["partner"]["id"] != suggestion["player1"]["id"]


def test_mobile_player_payload_resolves_reversed_pair_label(umpire_app_with_temp_db):
    from wyniki import database
    from wyniki.api.umpire_api import _mobile_player_payload_for_name

    app = umpire_app_with_temp_db
    with app.app_context():
        tournament_id, _group, team_a, _team_b, _entry = _seed_doubles_suggestion(database)
        payload = _mobile_player_payload_for_name(tournament_id, _reverse_pair(team_a["display_name"]))

    assert payload is not None
    assert payload["first_name"] == "Anna"
    assert payload["partner"]["first_name"] == "Ewa"


def test_link_schedule_to_match_fallback_ignores_partner_order(umpire_app_with_temp_db):
    from wyniki import database

    app = umpire_app_with_temp_db
    with app.app_context():
        tournament_id, group, team_a, team_b, entry = _seed_doubles_suggestion(database)

        linked = database.link_schedule_to_match(
            tournament_id,
            501,
            player1_name=_reverse_pair(team_b["display_name"]),
            player2_name=_reverse_pair(team_a["display_name"]),
            phase="Grupowa",
            bracket_group_id=group["id"],
            status="in_progress",
        )

    assert linked is not None
    assert linked["id"] == entry["id"]
    assert linked["match_id"] == 501


def test_detect_bracket_context_matches_reversed_pair_labels(umpire_app_with_temp_db):
    from wyniki import database

    app = umpire_app_with_temp_db
    with app.app_context():
        tournament_id, group, team_a, team_b, _entry = _seed_doubles_suggestion(database)
        ctx = database.detect_bracket_context(
            _reverse_pair(team_a["display_name"]),
            _reverse_pair(team_b["display_name"]),
            tournament_id,
        )

    assert ctx["group_id"] == group["id"]
    assert ctx["warning"] is None


def test_detect_knockout_result_matches_reversed_pair_labels(umpire_app_with_temp_db):
    from wyniki import database

    app = umpire_app_with_temp_db
    with app.app_context():
        tournament_id, _group, team_a, team_b, _entry = _seed_doubles_suggestion(database)
        reversed_a = _reverse_pair(team_a["display_name"])
        reversed_b = _reverse_pair(team_b["display_name"])
        with database.db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO matches (
                    court_id, tournament_id, status, phase, player1_name, player2_name,
                    player1_sets, player2_sets, winner_name, sets_history, finish_reason, created_at
                ) VALUES (?, ?, 'finished', 'Finał', ?, ?, 2, 0, ?, ?, 'normal', ?)
                """,
                (
                    f"t{tournament_id}-1",
                    tournament_id,
                    reversed_a,
                    reversed_b,
                    reversed_a,
                    '[{"player1_games": 4, "player2_games": 1}, {"player1_games": 4, "player2_games": 2}]',
                    "2026-08-13T12:00:00",
                ),
            )
            conn.commit()
            result = database._detect_knockout_result(
                cursor,
                team_a["display_name"],
                team_b["display_name"],
                "2026-08-13",
                "2026-08-15",
                tournament_id,
                "Finał",
            )

    assert result is not None
    assert result["winner"] == team_a["display_name"]
    assert result["score"]
