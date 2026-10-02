"""Report mail: what is sent, to whom, and when the summary is marked as sent."""

import secrets
from types import SimpleNamespace

import pytest

from wyniki.services import email_reports
from wyniki.services.email_reports import (
    _render_score_line,
    _resolve_tournament_winner,
    _smtp_ready,
    get_email_settings,
    maybe_send_tournament_summary,
    save_email_settings,
    send_match_report,
)

SMTP_OK = {
    "smtp_host": "smtp.example.com",
    "smtp_port": "587",
    "smtp_username": "biuro@example.com",
    "smtp_password": "pw-" + secrets.token_urlsafe(12),  # made up: a literal reads as a credential
    "smtp_use_tls": "true",
    "smtp_from_email": "biuro@example.com",
    "smtp_from_name": "Wyniki Live",
}


@pytest.fixture
def sent(monkeypatch):
    """Catches what would go out instead of opening a connection."""
    outbox = []

    def fake_send(subject, html_body, recipients):
        outbox.append({"subject": subject, "html": html_body, "to": list(recipients)})
        return True

    monkeypatch.setattr(email_reports, "_send_email", fake_send)
    return outbox


def _match(**kwargs):
    base = {"court_id": "t32-1", "player1_name": "Kowalski", "player2_name": "Nowak", "phase": "Ćwierćfinał"}
    base.update(kwargs)
    return SimpleNamespace(**base)


def _state(**kwargs):
    base = {
        "court_name": "Kort 1",
        "A": {"full_name": "ktoś inny", "set1": 4, "set2": 4, "set3": 0},
        "B": {"full_name": "ktoś inny", "set1": 1, "set2": 2, "set3": 0},
        "match_time": {"seconds": 1860},
        "history_meta": {"category": "B2 Mężczyźni"},
    }
    base.update(kwargs)
    return base


def test_settings_come_back_with_sane_defaults(monkeypatch):
    monkeypatch.setattr(email_reports, "fetch_app_settings", lambda keys: {})
    config = get_email_settings()
    assert config["smtp_port"] == 587
    assert config["smtp_use_tls"] is True, "TLS stays on unless it is turned off"
    assert config["smtp_from_name"] == "Wyniki Live"
    assert not _smtp_ready(config), "no host and no sender means nothing can be sent"

    monkeypatch.setattr(
        email_reports,
        "fetch_app_settings",
        lambda keys: {**SMTP_OK, "smtp_use_tls": "off", "smtp_from_name": "  "},
    )
    config = get_email_settings()
    assert config["smtp_use_tls"] is False
    assert config["smtp_from_name"] == "Wyniki Live", "a blank name falls back, it does not send an empty From"
    assert _smtp_ready(config)


def test_saving_settings_trims_and_keeps_the_flag_as_text(monkeypatch):
    saved = {}
    monkeypatch.setattr(email_reports, "upsert_app_settings", saved.update)
    save_email_settings({"smtp_host": "  smtp.ovh.net ", "smtp_port": "", "smtp_use_tls": False, "smtp_from_name": ""})
    assert saved["smtp_host"] == "smtp.ovh.net"
    assert saved["smtp_port"] == "587", "an empty port falls back instead of saving nothing"
    assert saved["smtp_use_tls"] == "false"
    assert saved["smtp_from_name"] == "Wyniki Live"


def test_the_score_line_pairs_the_sets_that_both_sides_have():
    assert _render_score_line([4, 4, 0], [1, 2, 0]) == "4:1 4:2 0:0"
    assert _render_score_line([4, 4], [1]) == "4:1", "a set only one side has is left out"
    assert _render_score_line([], []) == "-"


def test_a_match_report_goes_to_the_address_on_the_tournament(sent):
    assert send_match_report(_match(), _state(), {"name": "RAKIETY", "report_email": " biuro@atnis.pl "}) is True
    mail = sent[0]
    assert mail["to"] == ["biuro@atnis.pl"]
    assert mail["subject"] == "RAKIETY: raport meczu Kowalski vs Nowak"
    assert "4:1 4:2 0:0" in mail["html"]
    assert "Kort 1" in mail["html"]
    assert "B2 Mężczyźni" in mail["html"]
    assert "31.0 min" in mail["html"]


def test_nothing_is_sent_without_a_tournament_or_an_address(sent):
    assert send_match_report(_match(), _state(), None) is False
    assert send_match_report(_match(), _state(), {"name": "RAKIETY", "report_email": "  "}) is False
    assert sent == []


def test_the_report_names_the_players_of_the_match_that_just_ended(sent):
    """The overlay may already show the next pair, so the match row wins."""
    send_match_report(_match(), _state(), {"report_email": "biuro@atnis.pl"})
    assert "Kowalski" in sent[0]["html"] and "ktoś inny" not in sent[0]["html"]

    sent.clear()
    send_match_report(_match(player1_name=None, player2_name=None), _state(), {"report_email": "biuro@atnis.pl"})
    assert "ktoś inny" in sent[0]["html"], "with no names on the row the overlay is all there is"


def test_a_name_with_html_in_it_cannot_break_the_message(sent):
    send_match_report(
        _match(player1_name="<script>alert(1)</script>"),
        _state(),
        {"report_email": "biuro@atnis.pl"},
    )
    assert "<script>" not in sent[0]["html"]
    assert "&lt;script&gt;" in sent[0]["html"]


def test_the_winner_comes_from_the_final_or_from_a_single_group():
    assert _resolve_tournament_winner({"knockout": {"final": [{"winner": "Kowalski"}]}}) == "Kowalski"
    assert _resolve_tournament_winner({"groups": [{"standings": [{"player": "Nowak"}]}]}) == "Nowak"
    assert _resolve_tournament_winner({"groups": [{"standings": []}, {"standings": [{"player": "X"}]}]}) is None
    assert _resolve_tournament_winner({}) is None


@pytest.fixture
def summary(monkeypatch):
    """A tournament with a winner, one group table and some history."""
    marked = []
    monkeypatch.setattr(
        email_reports,
        "fetch_tournament",
        lambda tid: {"name": "RAKIETY", "report_email": "biuro@atnis.pl", "summary_sent_at": None},
    )
    monkeypatch.setattr(
        email_reports,
        "get_full_bracket",
        lambda tid: {
            "knockout": {"final": [{"winner": "Kowalski"}]},
            "groups": [{"name": "A", "standings": [{"player": "Kowalski", "wins": 2, "losses": 0}]}],
        },
    )
    monkeypatch.setattr(
        email_reports,
        "fetch_match_history",
        lambda **kwargs: [
            {
                "court_name": "Kort 1",
                "player_a": "Kowalski",
                "player_b": "Nowak",
                "score_a": [4, 4],
                "score_b": [1, 2],
            }
        ],
    )
    monkeypatch.setattr(email_reports, "mark_tournament_summary_sent", lambda tid: marked.append(tid) or True)
    return marked


def test_the_summary_is_sent_once_and_only_then_marked(summary, sent):
    assert maybe_send_tournament_summary(32) is True
    assert summary == [32], "the tournament is marked only after the mail went out"
    mail = sent[0]
    assert mail["subject"] == "RAKIETY: podsumowanie turnieju"
    assert "Kowalski" in mail["html"] and "Grupa A" in mail["html"] and "4:1 4:2" in mail["html"]


def test_a_failed_send_leaves_the_tournament_unmarked(summary, monkeypatch):
    monkeypatch.setattr(email_reports, "_send_email", lambda *args: False)
    assert maybe_send_tournament_summary(32) is False
    assert summary == [], "a failed send must stay retryable"


def test_the_summary_waits_for_a_winner_and_never_goes_out_twice(monkeypatch, sent):
    state = {"summary_sent_at": None, "bracket": {"knockout": {"final": [{}]}}}
    monkeypatch.setattr(
        email_reports,
        "fetch_tournament",
        lambda tid: {
            "name": "RAKIETY",
            "report_email": "biuro@atnis.pl",
            "summary_sent_at": state["summary_sent_at"],
        },
    )
    monkeypatch.setattr(email_reports, "get_full_bracket", lambda tid: state["bracket"])
    monkeypatch.setattr(email_reports, "fetch_match_history", lambda **kwargs: [])
    monkeypatch.setattr(email_reports, "mark_tournament_summary_sent", lambda tid: True)

    assert maybe_send_tournament_summary(32) is False, "no winner yet"
    state["bracket"] = {"knockout": {"final": [{"winner": "Kowalski"}]}}
    assert maybe_send_tournament_summary(32) is True
    state["summary_sent_at"] = "2026-09-27T18:00:00Z"
    assert maybe_send_tournament_summary(32) is False, "already sent"
    assert len(sent) == 1

    state["summary_sent_at"] = None
    state["bracket"] = {"error": "brak drabinki"}
    assert maybe_send_tournament_summary(32) is False
    monkeypatch.setattr(email_reports, "fetch_tournament", lambda tid: None)
    assert maybe_send_tournament_summary(99) is False


def test_without_smtp_or_a_recipient_the_mail_is_not_even_built(monkeypatch):
    monkeypatch.setattr(email_reports, "fetch_app_settings", lambda keys: SMTP_OK)
    assert email_reports._send_email("temat", "<p>treść</p>", ["  ", None]) is False

    monkeypatch.setattr(email_reports, "fetch_app_settings", lambda keys: {})
    assert email_reports._send_email("temat", "<p>treść</p>", ["biuro@atnis.pl"]) is False


def test_the_message_is_html_with_a_plain_text_fallback_and_logs_in_on_tls(monkeypatch):
    monkeypatch.setattr(email_reports, "fetch_app_settings", lambda keys: SMTP_OK)
    steps = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            steps.append(("connect", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def ehlo(self):
            steps.append(("ehlo",))

        def starttls(self):
            steps.append(("starttls",))

        def login(self, user, password):
            steps.append(("login", user))

        def send_message(self, message):
            steps.append(("send", message["To"], message["From"], message.get_content_type()))

    monkeypatch.setattr(email_reports.smtplib, "SMTP", FakeSMTP)
    assert email_reports._send_email("temat", "<p>treść</p>", ["biuro@atnis.pl"]) is True
    assert ("connect", "smtp.example.com", 587) in steps
    assert ("starttls",) in steps
    assert ("login", "biuro@example.com") in steps
    send = next(step for step in steps if step[0] == "send")
    assert send[1] == "biuro@atnis.pl"
    assert send[2] == "Wyniki Live <biuro@example.com>"
    assert send[3] == "multipart/alternative", "HTML with a plain-text part beside it"


def test_a_broken_connection_is_reported_as_a_failure_not_an_exception(monkeypatch):
    monkeypatch.setattr(email_reports, "fetch_app_settings", lambda keys: SMTP_OK)

    def explode(*args, **kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr(email_reports.smtplib, "SMTP", explode)
    assert email_reports._send_email("temat", "<p>treść</p>", ["biuro@atnis.pl"]) is False
