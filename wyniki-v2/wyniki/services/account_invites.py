"""The invitation that lets a new person on a series set their password."""
from __future__ import annotations

from html import escape

from flask import request

from .email_reports import _send_email
from .organizer_auth import INVITE_MAX_AGE_SECONDS, issue_invite_token


def invite_link(account_id: int) -> str:
    base = request.host_url.rstrip("/")
    return f"{base}/organizer/invite?token={issue_invite_token(account_id)}"


def send_invite(account: dict, series_name: str, link: str) -> bool:
    """Mail the link; False when SMTP is not set up, and the admin passes the link on by hand."""
    hours = INVITE_MAX_AGE_SECONDS // 3600
    name = escape(account.get("name") or account.get("email") or "")
    body = f"""
    <html><body style="font-family:Arial,sans-serif;color:#111;font-size:16px;line-height:1.5">
      <p>Dzień dobry {name},</p>
      <p>masz dostęp do panelu organizatora serii <strong>{escape(series_name)}</strong> w blindtennis.app.</p>
      <p><a href="{escape(link)}">Ustaw hasło i zaloguj się</a></p>
      <p>Link działa {hours} godziny i tylko raz. Login to ten adres e-mail.</p>
      <hr>
      <p lang="en">You now have access to the organizer panel of <strong>{escape(series_name)}</strong> on blindtennis.app.
      <a href="{escape(link)}">Set your password and sign in</a>. The link works once, for {hours} hours. Your login is this e-mail address.</p>
    </body></html>
    """
    return _send_email(f"blindtennis.app: dostęp do serii {series_name}", body, [account["email"]])
