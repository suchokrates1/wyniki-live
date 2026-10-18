"""Court 1 lector: hybrid sentences, and speech only after the score sits still."""
from pathlib import Path

from wyniki.services.court_lector import Playback, sentences_for_court


def _court(name_a, name_b, serve, points_a, points_b, sets, current):
    state = {
        "A": {"full_name": name_a, "surname": name_a.split()[-1], "points": points_a},
        "B": {"full_name": name_b, "surname": name_b.split()[-1], "points": points_b},
        "serve": serve,
        "current_set": current,
        "super_tiebreak_active": False,
        "tie": {"A": 0, "B": 0, "visible": False},
    }
    for number in (1, 2, 3):
        left, right = sets.get(number, (0, 0))
        state["A"][f"set{number}"] = left
        state["B"][f"set{number}"] = right
    return state


MARTA = "Marta Jędrzejczyk"
EMIL = "Emil Stopierzyński"


def test_three_score_states_use_the_hybrid_sentences():
    opening = sentences_for_court(_court(MARTA, EMIL, "A", "0", "0", {1: (0, 0)}, 1))
    middle = sentences_for_court(_court(MARTA, EMIL, "A", "30", "15", {1: (3, 2)}, 1))
    later = sentences_for_court(_court(MARTA, EMIL, "B", "40", "30", {1: (4, 2), 2: (1, 0)}, 2))

    assert opening == [
        "Kort jeden.",
        "Marta Jędrzejczyk, serwuje, kontra Emil Stopierzyński.",
        "Zero do zera.",
        "Set jeden, aktywny, zero do zera.",
    ]
    assert middle == [
        "Kort jeden.",
        "Marta Jędrzejczyk, serwuje, kontra Emil Stopierzyński.",
        "Trzydzieści do piętnastu.",
        "Set jeden, aktywny, trzy do dwóch.",
    ]
    assert later == [
        "Kort jeden.",
        "Emil Stopierzyński, serwuje, kontra Marta Jędrzejczyk.",
        "Czterdzieści do trzydziestu.",
        "Set jeden, cztery do dwóch.",
        "Set dwa, aktywny, jeden do zera.",
    ]


def test_an_empty_court_says_nothing():
    assert sentences_for_court({"A": {"surname": "-"}, "B": {"surname": "-"}, "serve": None}) is None


def test_only_the_settled_score_is_spoken_and_it_repeats():
    built: list[list[str]] = []

    def speaker(text, previous, following):
        return f"{previous}|{text}|{following}".encode()

    def build(sentences, *, speaker, court="1", language="pl"):
        built.append(list(sentences))
        return Path("announcement.mp3")

    playback = Playback(quiet=20, repeat=300, speaker=speaker)
    playback_build = build

    opening = sentences_for_court(_court(MARTA, EMIL, "A", "0", "0", {1: (0, 0)}, 1))
    middle = sentences_for_court(_court(MARTA, EMIL, "A", "30", "15", {1: (3, 2)}, 1))

    # Patch the builder the playback calls.
    import wyniki.services.court_lector as module
    original = module.build_announcement
    module.build_announcement = playback_build
    try:
        playback.observe(opening, 0)
        playback.observe(middle, 10)
        assert built == []
        playback.observe(middle, 29)
        assert built == []
        playback.observe(middle, 30)
        assert built == [middle]
        first = playback.token
        playback.observe(middle, 329)
        assert built == [middle]
        assert playback.token == first
        playback.observe(middle, 330)
        assert playback.token != first
        assert built == [middle]
    finally:
        module.build_announcement = original


def test_score_bricks_are_shared_and_do_not_say_punkty():
    from wyniki.services.court_lector import chunk_path
    from wyniki.services.lector_lines import score_shelf

    same = chunk_path("Zero do zera.", "Kort jeden.", "Set jeden, aktywny, zero do zera.", shared=True)
    other = chunk_path("Zero do zera.", "Inna para.", "Set dwa, aktywny, jeden do zera.", shared=True)
    assert same == other
    name = "Marta Jędrzejczyk, serwuje, kontra Emil Stopierzyński."
    first_name = chunk_path(name, "Kort jeden.", "Zero do zera.", shared=True)
    later_name = chunk_path(name, "Kort dwa.", "Trzydzieści do piętnastu.", shared=True)
    assert first_name == later_name

    shelf = set(score_shelf())
    assert "Kort jeden." in shelf
    assert "Przewaga do czterdziestu." in shelf
    assert "Czterdzieści do przewagi." in shelf
    assert all("Punkty" not in line for line in shelf)
    for line in sentences_for_court(_court(MARTA, EMIL, "B", "40", "30", {1: (4, 2), 2: (1, 0)}, 2)):
        if "serwuje" in line:
            continue
        assert line in shelf


def test_warming_skips_a_brick_that_exists_and_stops_at_the_budget(tmp_path, monkeypatch):
    from wyniki.services import court_lector

    monkeypatch.setattr(court_lector, "_data_root", lambda: tmp_path)
    calls = []

    def speaker(text, previous, following):
        calls.append((text, previous))
        return b"mp3-bytes"

    first = court_lector.warm_shelf(
        ["Kort jeden.", "Zero do zera."],
        speaker=speaker,
        character_budget=12,
    )
    assert first == {"created": 1, "skipped": 0, "spent": 11, "left": 1}
    second = court_lector.warm_shelf(
        ["Kort jeden.", "Zero do zera."],
        speaker=speaker,
        character_budget=100,
    )
    assert second["skipped"] == 1
    assert second["created"] == 1
    assert second["left"] == 0
    assert calls == [("Kort jeden.", None), ("Zero do zera.", "Kort jeden.")]


def test_a_new_court_gets_its_own_lector_and_odd_scores_are_queued(tmp_path, monkeypatch):
    from wyniki.services import court_lector, lector_fill

    second = _court(MARTA, EMIL, "A", "0", "0", {1: (0, 0)}, 1)
    second["court_name"] = "2"
    assert sentences_for_court(second)[0] == "Kort dwa."

    lines = lector_fill.bricks_for(
        courts=["1", "2", "boisko"],
        pairs=[
            ("Piotr Malicki", "Łukasz Chmielewski"),
            ("Zwycięzca grupy", "Jan Kowalski"),
        ],
        sets=[(1, 8, 6), (1, 6, 4)],
        ties=[(11, 9, False), (7, 5, False)],
    )
    assert "Kort dwa." in lines
    assert "Piotr Malicki, serwuje, kontra Łukasz Chmielewski." in lines
    assert "Łukasz Chmielewski, serwuje, kontra Piotr Malicki." in lines
    assert "Set jeden, osiem do sześciu." in lines
    assert "Tie-break, jedenaście do dziewięciu." in lines
    assert "Set jeden, sześć do czterech." not in lines
    assert all("Zwycięzca" not in line for line in lines)
    assert all("siedem do pięciu" not in line for line in lines)
    spoken = lector_fill.history_lines([
        {"player1_games": 10, "player2_games": 8, "is_super_tiebreak": True, "tiebreak_loser_points": 8},
        {"player1_games": 7, "player2_games": 6, "tiebreak_loser_points": 9},
        {"player1_games": 6, "player2_games": 7, "tiebreak_loser_points": 11},
        {"set_number": 1, "player1_games": 8, "player2_games": 6},
        {"player1_games": 12, "player2_games": 10, "is_super_tiebreak": True},
    ])
    assert "Set trzy, dziesięć do ośmiu." not in spoken
    assert "Tie-break, jedenaście do dziewięciu." in spoken
    assert "Tie-break, jedenaście do trzynastu." in spoken
    assert "Set jeden, osiem do sześciu." in spoken
    assert "Super tie-break, dwanaście do dziesięciu." in spoken

    monkeypatch.setattr(court_lector, "_data_root", lambda: tmp_path)
    monkeypatch.setattr(
        lector_fill,
        "lines_for_tournament",
        lambda tournament_id: ["Kort dwa.", "Piotr Malicki, serwuje, kontra Łukasz Chmielewski."],
    )
    calls = []

    def speaker(text, previous, following):
        calls.append(text)
        return b"mp3-bytes"

    first = lector_fill.fill_missing(7, speaker=speaker, limit=1)
    assert first["created"] == 1
    assert calls == ["Kort dwa."]
    second_pass = lector_fill.fill_missing(7, speaker=speaker)
    assert second_pass["created"] == 1
    assert calls[1] == "Piotr Malicki, serwuje, kontra Łukasz Chmielewski."


def test_english_tournament_is_spoken_in_english_and_polish_stays_polish():
    from wyniki.database.tournaments import tournament_language

    assert tournament_language("EN") == "en"
    assert tournament_language("nope") == "pl"
    english = _court(MARTA, EMIL, "B", "40", "30", {1: (4, 2)}, 1)
    english["court_name"] = "2"
    english["tournament_language"] = "en"
    assert sentences_for_court(english) == [
        "Court two.",
        "Emil Stopierzyński, serving, against Marta Jędrzejczyk.",
        "Forty to thirty.",
        "Set one, active, four to two.",
    ]
    assert "B1" not in " ".join(sentences_for_court(english) or [])


def test_the_slow_fill_leaves_the_live_reserve(monkeypatch):
    from wyniki.services import lector_fill

    monkeypatch.setattr(lector_fill, "_character_budget", lambda: 0)
    called = []
    monkeypatch.setattr(lector_fill, "fill_missing", lambda *a, **k: called.append(k))
    assert lector_fill.fill_next()["created"] == 0
    assert called == []


def test_the_page_plays_the_published_clip(full_app_with_temp_db, tmp_path, monkeypatch):
    from wyniki.database.courts import create_tournament_courts
    from wyniki.database.tournaments import insert_tournament
    from wyniki.services import court_lector

    tournament_id = insert_tournament("Lektor", "2026-10-17", "2026-10-18", active=True)
    create_tournament_courts(tournament_id, 2)
    audio = tmp_path / "court-1.mp3"
    audio.write_bytes(b"ID3lector")
    monkeypatch.setattr(court_lector, "announcement_path", lambda court="1": audio)
    court_lector.playback.token = "abc"
    court_lector.playback.url = "/data/lector/court-1.mp3?v=abc"
    court_lector.playback.sentences = ["Kort jeden."]

    client = full_app_with_temp_db.test_client()
    page = client.get("/lektor/1")
    assert page.status_code == 200
    assert b"/api/lektor/1" in page.data
    assert client.get("/lektor/2").status_code == 200
    assert b"/api/lektor/2" in client.get("/lektor/2").data
    assert client.get("/lektor/3").status_code == 404

    status = client.get("/api/lektor/1").get_json()
    assert status["token"] == "abc"
    assert status["url"].endswith("v=abc")
    assert client.get("/data/lector/court-1.mp3").status_code == 200
