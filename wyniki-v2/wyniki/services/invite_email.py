"""The invitation mail to a series organizer: Polish first, English under it.

Built for mail clients, not browsers: tables, inline styles, a PNG logo (Gmail drops
SVG), a button that is a link, and the link once more as text for clients that strip it.
"""
from __future__ import annotations

from html import escape

INK = "#10202B"
MUTED = "#4C5D69"
RAIL = "#0B2C36"
ACCENT = "#B23C00"
GROUND = "#EEF1F3"
FONT = "'Atkinson Hyperlegible Next','Atkinson Hyperlegible',Arial,Helvetica,sans-serif"


def _button(href: str, label: str) -> str:
    return f"""
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
        <tr><td bgcolor="{ACCENT}" style="border-radius:10px">
          <a href="{href}" style="display:inline-block;padding:15px 28px;font-family:{FONT};font-size:17px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:10px">{label}</a>
        </td></tr>
      </table>"""


def _facts(rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f'<tr><td style="padding:4px 16px 4px 0;font-family:{FONT};font-size:14px;color:{MUTED};white-space:nowrap">{label}</td>'
        f'<td style="padding:4px 0;font-family:{FONT};font-size:15px;color:{INK};font-weight:700">{value}</td></tr>'
        for label, value in rows
    )
    return f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">{cells}</table>'


def invite_html(*, name: str, email: str, series_names: list[str], link: str, base_url: str,
                contact: str, hours: int) -> str:
    who = escape(name or "")
    series_text = escape(", ".join(series_names) or "—")
    href = escape(link, quote=True)
    mail = escape(contact)
    base = base_url.rstrip("/")
    greeting_pl = f"Dzień dobry{', ' + who if who else ''}!"
    greeting_en = f"Hello{' ' + who if who else ''},"
    p = f'style="margin:0 0 14px;font-family:{FONT};font-size:16px;line-height:1.55;color:{INK}"'
    small = f'style="margin:0 0 10px;font-family:{FONT};font-size:13px;line-height:1.5;color:{MUTED}"'
    return f"""<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Panel organizatora — blindtennis.app</title></head>
<body style="margin:0;padding:0;background:{GROUND}">
<div style="display:none;max-height:0;overflow:hidden">Ustaw hasło do panelu organizatora serii {series_text}. Set your password for the organizer panel.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{GROUND}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td bgcolor="{RAIL}" style="padding:22px 28px;border-radius:16px 16px 0 0">
      <a href="{base}/"><img src="{base}/brand/blindtennis-logo-email.png" width="240" height="64" alt="blindtennis.app" style="display:block;border:0"></a>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="padding:32px 28px 8px">
      <p style="margin:0 0 6px;font-family:{FONT};font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:{ACCENT}">Panel organizatora</p>
      <h1 style="margin:0 0 18px;font-family:{FONT};font-size:26px;line-height:1.25;color:{INK}">Masz dostęp do serii {series_text}</h1>
      <p {p}>{greeting_pl}</p>
      <p {p}>Możesz teraz prowadzić turnieje serii w blindtennis.app: zakładać je, ustawiać kategorie i korty, zgłaszać zawodników i otwierać biuro turnieju. Zacznij od ustawienia hasła.</p>
      {_button(href, "Ustaw hasło i zaloguj się")}
      {_facts([("Login", escape(email)), ("Seria", series_text), ("Link ważny", f"{hours} godziny, jeden raz")])}
      <p {small}>Przycisk nie działa? Skopiuj ten adres do przeglądarki:<br><a href="{href}" style="color:{RAIL};word-break:break-all">{escape(link)}</a></p>
      <p {small}>Nie spodziewasz się tej wiadomości? Zignoruj ją, bez ustawienia hasła konto nie działa. Pytania: <a href="mailto:{mail}" style="color:{RAIL}">{mail}</a>.</p>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="padding:8px 28px 28px">
      <hr style="border:0;border-top:1px solid #D7DDE1;margin:8px 0 22px">
      <div lang="en">
        <h2 style="margin:0 0 12px;font-family:{FONT};font-size:20px;color:{INK}">You now have access to {series_text}</h2>
        <p {p}>{greeting_en}</p>
        <p {p}>You can now run the series' tournaments on blindtennis.app: create them, set categories and courts, enter players and open the tournament office. Start by setting your password.</p>
        {_button(href, "Set your password and sign in")}
        <p {small}>Your login is {escape(email)}. The link works once, for {hours} hours. Questions: <a href="mailto:{mail}" style="color:{RAIL}">{mail}</a>.</p>
      </div>
    </td></tr>
    <tr><td style="padding:18px 28px;border-radius:0 0 16px 16px" bgcolor="{RAIL}">
      <p style="margin:0;font-family:{FONT};font-size:13px;line-height:1.5;color:#CFDDE4">blindtennis.app · wyniki tenisa dla niewidomych na żywo · <a href="{base}/privacy?lang=pl" style="color:#C6E953">Polityka prywatności</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>"""
