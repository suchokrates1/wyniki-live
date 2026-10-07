"""The invitation that lets a new person on a series set their password, in their language."""
from __future__ import annotations

from flask import request

from ..database import series as series_db
from ..database.series_plan import contact_email
from .email_reports import _send_email
from .organizer_auth import INVITE_MAX_AGE_SECONDS, issue_invite_token
from .organizer_mails import SENDER_EMAIL, SENDER_NAME, invite_mail, reset_mail


def invite_link(account_id: int) -> str:
    base = request.host_url.rstrip("/")
    return f"{base}/organizer/invite?token={issue_invite_token(account_id)}"


def invite_message(account: dict, link: str, base_url: str) -> tuple[str, str]:
    """Subject and HTML body; the series named are all those the person is on."""
    return invite_mail(
        account.get("language") or "en",
        name=account.get("name") or "",
        email=account["email"],
        series_names=[item["name"] for item in series_db.series_of_account(account["id"])],
        link=link,
        base_url=base_url,
        contact=contact_email(),
        hours=INVITE_MAX_AGE_SECONDS // 3600,
    )


def send_invite(account: dict, series_name: str, link: str) -> bool:
    """Mail the link; False when SMTP is not set up, and the admin passes the link on by hand."""
    subject, body = invite_message(account, link, request.host_url)
    return _send_email(subject, body, [account["email"]],
                       from_name=SENDER_NAME, from_email=SENDER_EMAIL, reply_to=contact_email())


def send_reset(account: dict) -> bool:
    """The person forgot their password: a fresh single-use link, in their language."""
    subject, body = reset_mail(
        account.get("language") or "en",
        name=account.get("name") or "",
        email=account["email"],
        link=invite_link(account["id"]),
        base_url=request.host_url,
        contact=contact_email(),
        hours=INVITE_MAX_AGE_SECONDS // 3600,
    )
    return _send_email(subject, body, [account["email"]],
                       from_name=SENDER_NAME, from_email=SENDER_EMAIL, reply_to=contact_email())

