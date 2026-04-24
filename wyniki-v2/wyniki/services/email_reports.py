"""Email reporting for completed matches and tournaments."""
from __future__ import annotations

import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from html import escape
from typing import Any, Dict, Iterable, List, Optional

from ..config import logger
from ..database import (
    fetch_app_settings,
    fetch_match_history,
    fetch_tournament,
    get_full_bracket,
    mark_tournament_summary_sent,
    upsert_app_settings,
)

SMTP_SETTING_KEYS = [
    "smtp_host",
    "smtp_port",
    "smtp_username",
    "smtp_password",
    "smtp_use_tls",
    "smtp_from_email",
    "smtp_from_name",
]


def get_email_settings() -> Dict[str, Any]:
    """Return SMTP settings with normalized defaults."""
    raw = fetch_app_settings(SMTP_SETTING_KEYS)
    return {
        "smtp_host": (raw.get("smtp_host") or "").strip(),
        "smtp_port": int(raw.get("smtp_port") or 587),
        "smtp_username": (raw.get("smtp_username") or "").strip(),
        "smtp_password": raw.get("smtp_password") or "",
        "smtp_use_tls": str(raw.get("smtp_use_tls") or "true").lower() in {"1", "true", "yes", "on"},
        "smtp_from_email": (raw.get("smtp_from_email") or "").strip(),
        "smtp_from_name": (raw.get("smtp_from_name") or "Wyniki Live").strip() or "Wyniki Live",
    }


def save_email_settings(settings_dict: Dict[str, Any]) -> None:
    """Persist SMTP settings."""
    payload = {
        "smtp_host": (settings_dict.get("smtp_host") or "").strip(),
        "smtp_port": str(settings_dict.get("smtp_port") or "587").strip(),
        "smtp_username": (settings_dict.get("smtp_username") or "").strip(),
        "smtp_password": settings_dict.get("smtp_password") or "",
        "smtp_use_tls": "true" if settings_dict.get("smtp_use_tls", True) else "false",
        "smtp_from_email": (settings_dict.get("smtp_from_email") or "").strip(),
        "smtp_from_name": (settings_dict.get("smtp_from_name") or "Wyniki Live").strip(),
    }
    upsert_app_settings(payload)


def _smtp_ready(config: Dict[str, Any]) -> bool:
    return bool(config.get("smtp_host") and config.get("smtp_from_email"))


def _send_email(subject: str, html_body: str, recipients: Iterable[str]) -> bool:
    config = get_email_settings()
    recipient_list = [address.strip() for address in recipients if address and address.strip()]

    if not recipient_list:
        return False
    if not _smtp_ready(config):
        logger.warning("smtp_not_configured", subject=subject)
        return False

    message = EmailMessage()
    from_name = config["smtp_from_name"]
    from_email = config["smtp_from_email"]
    message["Subject"] = subject
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = ", ".join(recipient_list)
    message.set_content("This message contains HTML content. Please use an HTML-capable email client.")
    message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(config["smtp_host"], config["smtp_port"], timeout=20) as smtp:
            smtp.ehlo()
            if config["smtp_use_tls"]:
                smtp.starttls()
                smtp.ehlo()
            if config["smtp_username"]:
                smtp.login(config["smtp_username"], config["smtp_password"])
            smtp.send_message(message)
        logger.info("email_sent", subject=subject, recipients=recipient_list)
        return True
    except Exception as exc:
        logger.error("email_send_failed", subject=subject, error=str(exc))
        return False


def _render_score_line(score_a: List[Any], score_b: List[Any]) -> str:
    pairs = []
    for index, score in enumerate(score_a):
        if index >= len(score_b):
            break
        pairs.append(f"{score}:{score_b[index]}")
    return " ".join(pairs) if pairs else "-"


def send_match_report(match: Any, state: Dict[str, Any], tournament: Optional[Dict[str, Any]]) -> bool:
    """Send a completed match report email for a tournament if configured."""
    if not tournament:
        return False

    report_email = (tournament.get("report_email") or "").strip()
    if not report_email:
        return False

    court_name = state.get("court_name") or match.court_id
    tournament_name = tournament.get("name") or "Tournament"
    player_a = state.get("A", {}).get("full_name") or match.player1_name
    player_b = state.get("B", {}).get("full_name") or match.player2_name
    score_a = [state.get("A", {}).get(f"set{i}", 0) for i in [1, 2, 3]]
    score_b = [state.get("B", {}).get(f"set{i}", 0) for i in [1, 2, 3]]
    duration_seconds = state.get("match_time", {}).get("seconds", 0)
    duration_minutes = round(duration_seconds / 60, 1) if duration_seconds else 0
    phase = state.get("history_meta", {}).get("phase") or match.phase or "Grupowa"
    category = state.get("history_meta", {}).get("category") or "-"

    subject = f"{tournament_name}: raport meczu {player_a} vs {player_b}"
    html_body = f"""
    <html><body style=\"font-family:Arial,sans-serif;color:#111;\">
      <h2 style=\"margin-bottom:4px;\">Raport meczu</h2>
      <p style=\"margin-top:0;color:#555;\">{escape(tournament_name)} | Kort {escape(str(court_name))}</p>
      <table cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse;border:1px solid #ddd;\">
        <tr><td><strong>Zawodnik A</strong></td><td>{escape(str(player_a))}</td></tr>
        <tr><td><strong>Zawodnik B</strong></td><td>{escape(str(player_b))}</td></tr>
        <tr><td><strong>Wynik</strong></td><td>{escape(_render_score_line(score_a, score_b))}</td></tr>
        <tr><td><strong>Faza</strong></td><td>{escape(str(phase))}</td></tr>
        <tr><td><strong>Kategoria</strong></td><td>{escape(str(category))}</td></tr>
        <tr><td><strong>Czas</strong></td><td>{duration_minutes} min</td></tr>
        <tr><td><strong>Zakończono</strong></td><td>{escape(datetime.now(timezone.utc).isoformat())}</td></tr>
      </table>
    </body></html>
    """
    return _send_email(subject, html_body, [report_email])


def _resolve_tournament_winner(bracket_data: Dict[str, Any]) -> Optional[str]:
    final_slots = bracket_data.get("knockout", {}).get("final", [])
    for slot in final_slots:
        if slot.get("winner"):
            return slot["winner"]

    groups = bracket_data.get("groups", [])
    if len(groups) == 1:
        standings = groups[0].get("standings", [])
        if standings:
            return standings[0].get("player")
    return None


def maybe_send_tournament_summary(tournament_id: int) -> bool:
    """Send the tournament summary once a winner is known and it wasn't sent before."""
    tournament = fetch_tournament(tournament_id)
    if not tournament:
        return False

    report_email = (tournament.get("report_email") or "").strip()
    if not report_email or tournament.get("summary_sent_at"):
        return False

    bracket_data = get_full_bracket(tournament_id)
    if bracket_data.get("error"):
        return False

    winner = _resolve_tournament_winner(bracket_data)
    if not winner:
        return False

    history = fetch_match_history(limit=200, tournament_id=tournament_id)
    tournament_name = tournament.get("name") or "Tournament"

    group_sections = []
    for group in bracket_data.get("groups", []):
        rows = []
        for standing in group.get("standings", []):
            rows.append(
                f"<tr><td>{escape(str(standing.get('player', '-')))}</td>"
                f"<td>{standing.get('wins', 0)}</td><td>{standing.get('losses', 0)}</td></tr>"
            )
        if rows:
            group_sections.append(
                f"<h3>Grupa {escape(str(group.get('name', '-')))}</h3>"
                "<table cellpadding='6' cellspacing='0' style='border-collapse:collapse;border:1px solid #ddd;'>"
                "<tr><th align='left'>Zawodnik</th><th>W</th><th>P</th></tr>"
                + "".join(rows)
                + "</table>"
            )

    recent_matches = []
    for match in history[:12]:
        recent_matches.append(
            "<tr>"
            f"<td>{escape(str(match.get('court_name') or match.get('kort_id') or '-'))}</td>"
            f"<td>{escape(str(match.get('player_a') or '-'))}</td>"
            f"<td>{escape(str(match.get('player_b') or '-'))}</td>"
            f"<td>{escape(_render_score_line(match.get('score_a') or [], match.get('score_b') or []))}</td>"
            "</tr>"
        )

    subject = f"{tournament_name}: podsumowanie turnieju"
    html_body = f"""
    <html><body style=\"font-family:Arial,sans-serif;color:#111;\">
      <h2 style=\"margin-bottom:4px;\">Podsumowanie turnieju</h2>
      <p style=\"margin-top:0;color:#555;\">{escape(tournament_name)}</p>
      <p><strong>Zwycięzca:</strong> {escape(str(winner))}</p>
      {''.join(group_sections) if group_sections else '<p>Brak tabel grupowych do pokazania.</p>'}
      <h3>Przebieg turnieju</h3>
      <table cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;border:1px solid #ddd;\">
        <tr><th align=\"left\">Kort</th><th align=\"left\">Zawodnik A</th><th align=\"left\">Zawodnik B</th><th align=\"left\">Wynik</th></tr>
        {''.join(recent_matches) if recent_matches else '<tr><td colspan="4">Brak historii meczów.</td></tr>'}
      </table>
    </body></html>
    """

    if _send_email(subject, html_body, [report_email]):
        return mark_tournament_summary_sent(tournament_id)
    return False
