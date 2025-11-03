from wyniki import state


def _time_generator(values):
    iterator = iter(values)
    last = values[-1]

    def _next():
        return next(iterator, last)

    return _next


def _fresh_court_state():
    court_state = state._empty_court_state()
    court_state["A"]["set1"] = 1
    court_state["B"]["set1"] = 0
    return court_state


def test_manual_pause_prevents_auto_restart(monkeypatch):
    court_state = _fresh_court_state()
    times = [
        "2025-11-03T10:00:00+00:00",
        "2025-11-03T10:06:00+00:00",
        "2025-11-03T10:06:00+00:00",
    ]
    monkeypatch.setattr(state, "now_iso", _time_generator(times))

    state.maybe_start_match(court_state)
    state.pause_match_timer(court_state, manual=True)

    match_time = court_state["match_time"]
    assert match_time["seconds"] == 360
    assert match_time["running"] is False
    assert match_time["auto_resume"] is False
    assert match_time["resume_ts"] is None

    state.maybe_start_match(court_state)
    assert court_state["match_time"]["running"] is False
    assert court_state["match_time"]["resume_ts"] is None


def test_resume_timer_excludes_paused_interval(monkeypatch):
    court_state = _fresh_court_state()
    times = [
        "2025-11-03T10:00:00+00:00",
        "2025-11-03T10:06:00+00:00",
        "2025-11-03T10:10:00+00:00",
        "2025-11-03T10:15:00+00:00",
        "2025-11-03T10:15:00+00:00",
    ]
    monkeypatch.setattr(state, "now_iso", _time_generator(times))

    state.maybe_start_match(court_state)
    state.pause_match_timer(court_state, manual=True)

    match_time = court_state["match_time"]
    assert match_time["seconds"] == 360

    changed, _ = state.apply_local_command(court_state, "PlayMatchTime", None, None)
    assert changed is True
    assert court_state["match_time"]["running"] is True
    assert court_state["match_time"]["auto_resume"] is True
    assert court_state["match_time"]["resume_ts"] is not None

    state.update_match_timer(court_state)
    assert court_state["match_time"]["seconds"] == 660

    state.pause_match_timer(court_state, manual=True)
    assert court_state["match_time"]["offset_seconds"] == 660


def test_reset_match_time_restores_defaults():
    court_state = _fresh_court_state()
    match_time = court_state["match_time"]
    match_time.update(
        {
            "seconds": 90,
            "offset_seconds": 45,
            "running": True,
            "started_ts": "2025-11-03T10:00:00+00:00",
            "finished_ts": "2025-11-03T10:05:00+00:00",
            "resume_ts": "2025-11-03T10:04:00+00:00",
            "auto_resume": False,
        }
    )
    court_state["A"]["set1"] = 0
    court_state["B"]["set1"] = 0

    changed, _ = state.apply_local_command(court_state, "ResetMatchTime", None, None)
    assert changed is True
    assert match_time["seconds"] == 0
    assert match_time["offset_seconds"] == 0
    assert match_time["running"] is False
    assert match_time["started_ts"] is None
    assert match_time["finished_ts"] is None
    assert match_time["resume_ts"] is None
    assert match_time["auto_resume"] is True
