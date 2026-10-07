"""Mails to a series organizer, in the organizer's language: the invitation and the
subscription notices, on one layout.

Built for mail clients, not browsers: tables, inline styles, a PNG logo (Gmail drops
SVG), a button that is a link, and the link once more as text for clients that strip it.
They go out from noreply@ as "blindtennis.app"; a reply lands at the organizer contact.
"""
from __future__ import annotations

from html import escape

from ..i18n.organizer_mail import format_date, texts

SENDER_NAME = "blindtennis.app"
SENDER_EMAIL = "noreply@blindtennis.app"

INK = "#10202B"
MUTED = "#4C5D69"
RAIL = "#0B2C36"
ACCENT = "#B23C00"
GROUND = "#EEF1F3"
FONT = "'Atkinson Hyperlegible Next','Atkinson Hyperlegible',Arial,Helvetica,sans-serif"
P = f'style="margin:0 0 14px;font-family:{FONT};font-size:16px;line-height:1.55;color:{INK}"'
SMALL = f'style="margin:0 0 10px;font-family:{FONT};font-size:13px;line-height:1.5;color:{MUTED}"'


def _button(href: str, label: str) -> str:
    return f"""
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
        <tr><td bgcolor="{ACCENT}" style="border-radius:10px">
          <a href="{href}" style="display:inline-block;padding:15px 28px;font-family:{FONT};font-size:17px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:10px">{escape(label)}</a>
        </td></tr>
      </table>"""


def _facts(rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f'<tr><td style="padding:4px 16px 4px 0;font-family:{FONT};font-size:14px;color:{MUTED};white-space:nowrap">{escape(label)}</td>'
        f'<td style="padding:4px 0;font-family:{FONT};font-size:15px;color:{INK};font-weight:700">{escape(value)}</td></tr>'
        for label, value in rows
    )
    return f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">{cells}</table>'


def _contact_line(text: str, contact: str) -> str:
    """The sentence with {contact} turned into a mail link; the rest escaped."""
    before, _, after = text.partition("{contact}")
    mail = escape(contact)
    return f'{escape(before)}<a href="mailto:{mail}" style="color:{RAIL}">{mail}</a>{escape(after)}'


def _layout(language: str, *, title: str, preheader: str, kicker: str, heading: str, body: str, base_url: str) -> str:
    t = texts(language)
    base = base_url.rstrip("/")
    return f"""<!DOCTYPE html>
<html lang="{language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:{GROUND}">
<div style="display:none;max-height:0;overflow:hidden">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{GROUND}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td bgcolor="{RAIL}" style="padding:22px 28px;border-radius:16px 16px 0 0">
      <a href="{base}/"><img src="{base}/brand/blindtennis-logo-email.png" width="240" height="64" alt="blindtennis.app" style="display:block;border:0"></a>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="padding:32px 28px 20px">
      <p style="margin:0 0 6px;font-family:{FONT};font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:{ACCENT}">{escape(kicker)}</p>
      <h1 style="margin:0 0 18px;font-family:{FONT};font-size:26px;line-height:1.25;color:{INK}">{escape(heading)}</h1>
      {body}
    </td></tr>
    <tr><td style="padding:18px 28px;border-radius:0 0 16px 16px" bgcolor="{RAIL}">
      <p style="margin:0;font-family:{FONT};font-size:13px;line-height:1.5;color:#CFDDE4">blindtennis.app · {escape(t["tagline"])} · <a href="{base}/privacy?lang={language}" style="color:#C6E953">{escape(t["privacy"])}</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>"""


def with_language(link: str, language: str) -> str:
    """The page a mail links to opens in the mail's language (?lang= wins over the account's)."""
    return f"{link}{'&' if '?' in link else '?'}lang={language}"


def _hello(t: dict[str, str], name: str) -> str:
    return t["hello_named"].format(name=name) if name else t["hello"]


def invite_mail(language: str, *, name: str, email: str, series_names: list[str], link: str,
                base_url: str, contact: str, hours: int) -> tuple[str, str]:
    t = texts(language)
    series = ", ".join(series_names) or "—"
    link = with_language(link, language)
    href = escape(link, quote=True)
    body = f"""
      <p {P}>{escape(_hello(t, name))}</p>
      <p {P}>{escape(t["invite_body"])}</p>
      {_button(href, t["invite_button"])}
      {_facts([(t["label_login"], email), (t["label_series"], series), (t["label_valid"], t["valid_value"].format(hours=hours))])}
      <p {SMALL}>{escape(t["fallback"])}<br><a href="{href}" style="color:{RAIL};word-break:break-all">{escape(link)}</a></p>
      <p {SMALL}>{escape(t["ignore"])} {_contact_line(t["questions"], contact)}</p>"""
    html = _layout(language, title=t["kicker_panel"], preheader=t["invite_preheader"].format(series=series),
                   kicker=t["kicker_panel"], heading=t["invite_heading"].format(series=series), body=body, base_url=base_url)
    return t["invite_subject"].format(series=series), html


def plan_mail(language: str, kind: str, *, series: str, valid_until: str, base_url: str, contact: str) -> tuple[str, str]:
    """kind: 'ending' (before the end date) or 'ended' (after it)."""
    t = texts(language)
    when = format_date(valid_until, language)
    heading = t[f"{kind}_heading"].format(date=when)
    body = f"""
      <p {P}>{escape(t["hello"])}</p>
      <p {P}>{escape(t[f"{kind}_body"].format(series=series, date=when))}</p>
      <p {P}>{_contact_line(t["renew"], contact)}</p>
      {_button(escape(with_language(base_url.rstrip("/") + "/organizer/login", language), quote=True), t["panel_button"])}"""
    html = _layout(language, title=heading, preheader=heading, kicker=t["kicker_plan"], heading=heading, body=body, base_url=base_url)
    return t[f"{kind}_subject"].format(series=series, date=when), html
