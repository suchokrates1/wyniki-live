"""The invitation that lets a new person on a series set their password."""
from __future__ import annotations

from flask import request

from ..database import series as series_db
from ..database.series_plan import contact_email
from .email_reports import _send_email
from .invite_email import invite_html
from .organizer_auth import INVITE_MAX_AGE_SECONDS, issue_invite_token


def invite_link(account_id: int) -> str:
    base = request.host_url.rstrip("/")
    return f"{base}/organizer/invite?token={issue_invite_token(account_id)}"


def invite_message(account: dict, link: str, base_url: str) -> tuple[str, str]:
    """Subject and HTML body; the series named are all those the person is on."""
    names = [item["name"] for item in series_db.series_of_account(account["id"])]
    subject = f"blindtennis.app: panel organizatora {', '.join(names)}".strip()
    body = invite_html(
        name=account.get("name") or "",
        email=account["email"],
        series_names=names,
        link=link,
        base_url=base_url,
        contact=contact_email(),
        hours=INVITE_MAX_AGE_SECONDS // 3600,
    )
    return subject, body


def send_invite(account: dict, series_name: str, link: str) -> bool:
    """Mail the link; False when SMTP is not set up, and the admin passes the link on by hand."""
    subject, body = invite_message(account, link, request.host_url)
    return _send_email(subject, body, [account["email"]])
