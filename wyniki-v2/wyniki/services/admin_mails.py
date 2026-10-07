"""Mails to an administrator: the invitation to set a password and the new-password link.
In Polish, like the admin itself, on the organizers' mail layout."""
from __future__ import annotations

from html import escape

from flask import request

from .email_reports import _send_email
from .organizer_auth import INVITE_MAX_AGE_SECONDS, issue_invite_token
from .organizer_mails import P, RAIL, SENDER_EMAIL, SENDER_NAME, SMALL, _button, _facts, _layout

TEXTS = {
    "invite": {
        "subject": "blindtennis.app: konto administratora",
        "heading": "Masz konto administratora",
        "body": "Założyliśmy Ci konto w panelu administratora blindtennis.app. Ustaw hasło przyciskiem poniżej; potem logujesz się adresem e-mail i tym hasłem.",
        "button": "Ustaw hasło",
        "ignore": "Nie spodziewasz się tej wiadomości? Zignoruj ją – bez ustawienia hasła konto nie działa.",
    },
    "reset": {
        "subject": "blindtennis.app: nowe hasło administratora",
        "heading": "Ustaw nowe hasło",
        "body": "Ktoś (pewnie Ty) poprosił o nowe hasło do panelu administratora. Dotychczasowe działa, dopóki nie ustawisz nowego.",
        "button": "Ustaw nowe hasło",
        "ignore": "Nie prosiłeś o to? Zignoruj tę wiadomość – hasło się nie zmieni.",
    },
}


def admin_link(account_id: int) -> str:
    return f"{request.host_url.rstrip('/')}/admin/invite?token={issue_invite_token(account_id)}"


def admin_message(kind: str, account: dict, link: str, base_url: str) -> tuple[str, str]:
    t = TEXTS[kind]
    href = escape(link, quote=True)
    hello = f"Dzień dobry, {account['name']}!" if account.get("name") else "Dzień dobry!"
    body = f"""
      <p {P}>{escape(hello)}</p>
      <p {P}>{escape(t["body"])}</p>
      {_button(href, t["button"])}
      {_facts([("Login", account["email"]), ("Link ważny", f"{INVITE_MAX_AGE_SECONDS // 3600} godziny, jeden raz")])}
      <p {SMALL}>Przycisk nie działa? Skopiuj ten adres do przeglądarki:<br><a href="{href}" style="color:{RAIL};word-break:break-all">{escape(link)}</a></p>
      <p {SMALL}>{escape(t["ignore"])}</p>"""
    html = _layout("pl", title=t["heading"], preheader=t["heading"], kicker="Panel administratora",
                   heading=t["heading"], body=body, base_url=base_url)
    return t["subject"], html


def send_admin_mail(kind: str, account: dict) -> tuple[bool, str]:
    """(mailed, link): the link is also shown to the admin who invited, when no mail went out."""
    link = admin_link(account["id"])
    subject, html = admin_message(kind, account, link, request.host_url)
    return _send_email(subject, html, [account["email"]], from_name=SENDER_NAME, from_email=SENDER_EMAIL), link
