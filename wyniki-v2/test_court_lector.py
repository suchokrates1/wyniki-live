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

    def build(sentences, *, speaker):
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
    first_name = chunk_path(
        "Marta Jędrzejczyk, serwuje, kontra Emil Stopierzyński.",
        "Kort jeden.",
        "Zero do zera.",
    )
    later_name = chunk_path(
        "Marta Jędrzejczyk, serwuje, kontra Emil Stopierzyński.",
        "Kort jeden.",
        "Trzydzieści do piętnastu.",
    )
    assert first_name != later_name

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


def test_the_page_plays_the_published_clip(full_app_with_temp_db, tmp_path, monkeypatch):
    from wyniki.services import court_lector

    audio = tmp_path / "court-1.mp3"
    audio.write_bytes(b"ID3lector")
    monkeypatch.setattr(court_lector, "announcement_path", lambda: audio)
    court_lector.playback.token = "abc"
    court_lector.playback.url = "/data/lector/court-1.mp3?v=abc"
    court_lector.playback.sentences = ["Kort jeden."]

    client = full_app_with_temp_db.test_client()
    page = client.get("/lektor/1")
    assert page.status_code == 200
    assert b"/api/lektor/1" in page.data
    assert client.get("/lektor/2").status_code == 404

    status = client.get("/api/lektor/1").get_json()
    assert status["token"] == "abc"
    assert status["url"].endswith("v=abc")
    assert client.get("/data/lector/court-1.mp3").status_code == 200
