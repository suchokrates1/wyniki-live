"""A WhatsApp message to the people who get the umpire's SOS, from outside the app.

The recording watch on the production laptop (scripts/recording_watch.py) calls it over SSH, so
the laptop needs no WAHA key: the message goes out through the server's WAHA set-up, to the SOS
recipients switched on in the admin.

    docker exec wyniki-tenis-v2 python -m wyniki.services.owner_alert "Kamera 4: plik nie rośnie od 3 min"
"""
from __future__ import annotations

import sys

from .panic import list_recipients
from .waha_client import send_text, waha_configured


def send_owner_alert(text: str) -> int:
    """How many recipients the message went to (0 when WAHA is not set up or nobody is on)."""
    message = text.strip()
    if not message or not waha_configured():
        return 0
    sent = 0
    for recipient in list_recipients():
        if recipient.get("enabled") and send_text(recipient["chat_id"], message):
            sent += 1
    return sent


def main(argv: list[str]) -> int:
    text = " ".join(argv).strip()
    if not text:
        print("usage: python -m wyniki.services.owner_alert <text>", file=sys.stderr)
        return 2
    sent = send_owner_alert(text)
    print(f"sent to {sent}")
    return 0 if sent else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
