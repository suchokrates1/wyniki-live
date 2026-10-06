"""The public player profile, pinned down before it moved out of the admin module.

One career spread over two public tournaments and one private one: a group, a final
won, a third place won, a fifth place, results stored under the full name and under
the surname alone, a set lost on a tie-break, a knockout match whose phase is only
known from the live match it came from. Every number on the profile follows from
these rows, so a refactor that changes one shows up here.
"""
from __future__ import annotations

import pytest


def _history(database, tournament_id, ended, a, b, score_a, score_b, **extra):
    database.insert_match_history({
        "kort_id": "k1",
        "ended_ts": ended,
        "duration_seconds": 1800,
        "player_a": a,
        "player_b": b,
        "score_a": score_a,
        "score_b": score_b,
        "category": "B1",
        "tournament_id": tournament_id,
        **extra,
    })


@pytest.fixture()
def career(full_app_with_temp_db):
    from wyniki import database
    from wyniki.database.classifications import record_classification_change
    from wyniki.db_models import Match, db

    spring = database.insert_tournament("Spring Open", "2026-05-01", "2026-05-02", active=True)
    winter = database.insert_tournament("Winter Cup", "2025-12-01", "2025-12-02", active=False)
    hidden = database.insert_tournament(
        "Closed Camp", "2026-06-01", "2026-06-02", active=False, is_public=False, stats_enabled=False,
    )

    ada = database.insert_player(spring, "Ada Nowak", "B1", "PL", first_name="Ada", last_name="Nowak", gender="K")
    ewa = database.insert_player(spring, "Ewa Lis", "B1", "PL", first_name="Ewa", last_name="Lis", gender="K")
    ola = database.insert_player(spring, "Ola Kot", "B1", "CZ", first_name="Ola", last_name="Kot", gender="K")
    database.insert_player(spring, "Iza Bak", "B1", "DE", first_name="Iza", last_name="Bak", gender="K")
    database.insert_player(winter, "Ada Nowak", "B2", "PL", first_name="Ada", last_name="Nowak", gender="K")
    hidden_ada = database.insert_player(hidden, "Ada Nowak", "B1", "PL", first_name="Ada", last_name="Nowak", gender="K")

    database.save_bracket_groups(spring, [{"name": "B1 — Grupa A", "players": [ada, ewa, ola]}])
    database.save_bracket_knockout(spring, [
        {"phase": "B1 — Finał", "position": 1, "player1_name": "Ada Nowak", "player2_name": "Iza Bak", "winner_name": "Ada Nowak"},
    ])
    database.save_bracket_knockout(winter, [
        {"phase": "B2 — Półfinał", "position": 1, "player1_name": "Ada Nowak", "player2_name": "Rita Zur", "winner_name": "Rita Zur"},
        {"phase": "B2 — o 3. miejsce", "position": 1, "player1_name": "Ada Nowak", "player2_name": "Kim Lee", "winner_name": "Ada Nowak"},
    ])

    with full_app_with_temp_db.app_context():
        final = Match(
            court_id="k1", player1_name="Ada Nowak", player2_name="Iza Bak", status="finished",
            tournament_id=spring, phase="B1 — Finał", player1_sets=2, player2_sets=1,
            created_at="2026-05-02T15:00:00Z", updated_at="2026-05-02T16:00:00Z",
        )
        db.session.add(final)
        db.session.commit()
        final_id = final.id

    _history(database, spring, "2026-05-01T10:00:00Z", "Ada Nowak", "Ewa Lis", [4, 4], [1, 2], phase="Grupowa")
    # stored under the surname alone, with Ada second: her score has to be flipped
    _history(
        database, spring, "2026-05-01T12:00:00Z", "Kot", "Nowak", [4, 2, 10], [2, 4, 8], phase="Grupowa",
        sets_history=[
            {"player1_games": 4, "player2_games": 2},
            {"player1_games": 4, "player2_games": 5, "tiebreak_loser_points": 3},
            {"player1_games": 10, "player2_games": 8, "is_super_tiebreak": True},
        ],
    )
    _history(
        database, spring, "2026-05-02T16:00:00Z", "Ada Nowak", "Iza Bak", [4, 2, 10], [1, 4, 6],
        phase="Pucharowa", match_id=final_id,
    )
    _history(database, winter, "2025-12-02T11:00:00Z", "Rita Zur", "Ada Nowak", [4, 4], [0, 1], phase="B2 — Półfinał")
    _history(database, winter, "2025-12-02T14:00:00Z", "Ada Nowak", "Kim Lee", [4, 4], [3, 3], phase="B2 — o 3. miejsce")
    _history(database, hidden, "2026-06-01T10:00:00Z", "Ada Nowak", "Secret Rival", [4, 4], [0, 0], phase="Grupowa")

    entry = next(p for p in database.fetch_players(spring) if p["id"] == ada)
    gid = entry["global_player_id"]
    record_classification_change(gid, "B2", source="tournament", tournament_id=winter)
    record_classification_change(gid, "B1", source="tournament", tournament_id=hidden)
    return {"client": full_app_with_temp_db.test_client(), "entry": ada, "global": gid, "hidden_entry": hidden_ada}


def _score(sets):
    return " ".join(f"{s['g1']}:{s['g2']}" + (f"({s['tb']})" if s["tb"] is not None else "") + ("s" if s["stb"] else "") for s in sets)


def test_the_career_adds_up_over_the_public_tournaments_only(career):
    profile = career["client"].get(f"/api/players/{career['global']}/profile?global=1").get_json()

    assert profile["player"] == {
        "id": career["global"], "first_name": "Ada", "last_name": "Nowak", "full_name": "Ada Nowak",
        "gender": "K", "category": "B1", "country": "PL", "photo_url": "", "birth_date": "", "age": None,
    }
    assert profile["career"] == {
        "tournaments": 2, "matches": 5, "wins": 3, "losses": 2,
        "medals": {"gold": 1, "silver": 0, "bronze": 1},
        "medals_by_category": [
            {"category": "B1", "gold": 1, "silver": 0, "bronze": 0},
            {"category": "B2", "gold": 0, "silver": 0, "bronze": 1},
        ],
    }


def test_each_tournament_shows_the_group_the_medal_and_every_match_from_her_side(career):
    profile = career["client"].get(f"/api/players/{career['global']}/profile?global=1").get_json()
    spring, winter = profile["tournaments"]

    summary = ("tournament_name", "player_class", "group_name", "group_position", "group_total",
               "medal", "knockout_phase", "matches_played", "wins", "losses")
    assert [spring[k] for k in summary] == ["Spring Open", "B1", "B1 — Grupa A", 1, 3, "gold", "B1 — Finał", 3, 2, 1]
    assert [winter[k] for k in summary] == ["Winter Cup", "B2", None, None, None, "bronze", "B2 — o 3. miejsce", 2, 1, 1]

    assert [(m["opponent"], m["won"], m["phase"], _score(m["score"])) for m in spring["matches"]] == [
        ("Ewa Lis", True, "Grupowa", "4:1 4:2"),
        # stored as "Kot" vs "Nowak": her side first, the tie-break and super tie-break kept
        ("Kot", False, "Grupowa", "2:4 5:4(3) 8:10s"),
        # "Pucharowa" is replaced by the phase of the live match it came from
        ("Iza Bak", True, "B1 — Finał", "4:1 2:4 10:6"),
    ]
    assert [(m["opponent"], m["won"], m["phase"], _score(m["score"])) for m in winter["matches"]] == [
        ("Rita Zur", False, "B2 — Półfinał", "0:4 1:4"),
        ("Kim Lee", True, "B2 — o 3. miejsce", "4:3 4:3"),
    ]
    first = spring["matches"][0]
    assert {k: v for k, v in first.items() if not k.startswith("opponent_")} == {
        "opponent": "Ewa Lis", "score": first["score"], "won": True, "phase": "Grupowa",
        "category": "B1", "date": "2026-05-01T10:00:00Z", "duration": 1800,
    }
    # the opponent's global profile and country come along, for a link and a tag
    assert first["opponent_country"] == "PL"
    assert first["opponent_global_id"] is not None
    assert spring["matches"][2]["opponent_country"] == "DE"
    assert spring["city"] is not None


def test_the_class_history_does_not_name_a_private_tournament(career):
    profile = career["client"].get(f"/api/players/{career['global']}/profile?global=1").get_json()
    assert [
        (row["classification"], row["previous_classification"], row["source"], row["tournament_name"])
        for row in profile["classification_history"]
    ] == [("B1", "", "initial", None), ("B2", "B1", "tournament", "Winter Cup"), ("B1", "B2", "tournament", None)]


def test_a_tournament_entry_opens_the_same_career(career):
    client = career["client"]
    by_entry = client.get(f"/api/players/{career['entry']}/profile").get_json()
    by_global = client.get(f"/api/players/{career['global']}/profile?global=1").get_json()
    assert by_entry["player"]["id"] == career["entry"]
    assert {k: v for k, v in by_entry.items() if k != "player"} == {k: v for k, v in by_global.items() if k != "player"}


def test_an_entry_in_a_private_tournament_has_no_profile(career):
    client = career["client"]
    assert client.get(f"/api/players/{career['hidden_entry']}/profile").status_code == 404
    assert client.get("/api/players/99999/profile").status_code == 404
    assert client.get("/api/players/99999/profile?global=1").status_code == 404
