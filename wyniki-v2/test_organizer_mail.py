"""Every organizer mail text exists in every language, with the same placeholders."""
import re
import string

from wyniki.database.accounts import LANGUAGES
from wyniki.i18n.organizer_mail import TEXTS


def _fields(text):
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


def test_every_language_has_every_text_with_the_same_placeholders():
    assert set(TEXTS) == set(LANGUAGES)
    for language, texts in TEXTS.items():
        assert set(texts) == set(TEXTS["pl"]), language
        for key, text in texts.items():
            assert text.strip(), f"{language}.{key} is empty"
            assert _fields(text) == _fields(TEXTS["pl"][key]), f"{language}.{key}"


def test_the_invite_and_both_notices_render_in_every_language():
    from wyniki.services.organizer_mails import invite_mail, plan_mail

    for language in LANGUAGES:
        subject, html = invite_mail(language, name="", email="a@example.org", series_names=["TWT"], link="https://x/i?token=t",
                                    base_url="https://x", contact="c@example.org", hours=72)
        assert "TWT" in subject and f'lang="{language}"' in html and "72" in html
        assert not re.search(r"\{\w+\}", html), language
        for kind in ("ending", "ended"):
            subject, html = plan_mail(language, kind, series="TWT", valid_until="2027-10-31", base_url="https://x", contact="c@example.org")
            assert "TWT" in subject and "2027" in html and "mailto:c@example.org" in html
            assert not re.search(r"\{\w+\}", subject + html), (language, kind)


def test_links_in_a_mail_open_the_page_in_the_mails_language():
    from wyniki.services.organizer_mails import invite_mail, plan_mail

    _, html = invite_mail("en", name="", email="a@example.org", series_names=["TWT"], link="https://x/organizer/invite?token=t",
                          base_url="https://x", contact="c@example.org", hours=72)
    assert 'href="https://x/organizer/invite?token=t&amp;lang=en"' in html
    assert ">https://x/organizer/invite?token=t&amp;lang=en<" in html, "the link written out as text too"
    _, html = plan_mail("de", "ending", series="TWT", valid_until="2027-10-31", base_url="https://x", contact="c@example.org")
    assert 'href="https://x/organizer/login?lang=de"' in html


def test_the_sender_name_is_quoted_so_mail_clients_show_it(monkeypatch):
    """A bare 'blindtennis.app <noreply@…>' is not a valid header (the dot): Gmail showed 'noreply'."""
    from wyniki.services import email_reports

    sent = []

    class FakeSMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *exc): return False
        def ehlo(self): pass
        def starttls(self): pass
        def login(self, *args): pass
        def send_message(self, message): sent.append(message)

    monkeypatch.setattr(email_reports, "get_email_settings", lambda: {
        "smtp_host": "smtp.example.org", "smtp_port": 587, "smtp_username": "", "smtp_password": "",
        "smtp_use_tls": False, "smtp_from_email": "reports@example.org", "smtp_from_name": "Wyniki Live"})
    monkeypatch.setattr(email_reports.smtplib, "SMTP", FakeSMTP)
    assert email_reports._send_email("s", "<p>x</p>", ["a@example.org"], from_name="blindtennis.app", from_email="noreply@blindtennis.app")
    assert sent[0]["From"] == '"blindtennis.app" <noreply@blindtennis.app>'
