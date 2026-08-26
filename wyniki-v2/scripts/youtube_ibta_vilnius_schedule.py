#!/usr/bin/env python3
"""Schedule IBTA Vilnius 2026 live broadcasts on a YouTube channel.

Does not start the encoder. Creates (or reuses) one RTMP stream and one
scheduled live event per day, then binds them. enableAutoStart is on.

OAuth files live outside the repo:
  %USERPROFILE%\\.config\\youtube-ibta\\client_secret.json
  %USERPROFILE%\\.config\\youtube-ibta\\token.json

Install (once):
  pip install google-api-python-client google-auth-oauthlib google-auth

Usage:
  python youtube_ibta_vilnius_schedule.py whoami
  python youtube_ibta_vilnius_schedule.py plan
  python youtube_ibta_vilnius_schedule.py apply
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SCOPES = (
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
)
TZ = ZoneInfo("Europe/Vilnius")
CONFIG_DIR = Path.home() / ".config" / "youtube-ibta"
CLIENT_SECRET = CONFIG_DIR / "client_secret.json"
TOKEN_PATH = CONFIG_DIR / "token.json"
STREAM_TITLE = "IBTA 2026 Vilnius reusable RTMP"
EXPECTED_CHANNEL_HINTS = ("ibta", "tennis tv", "blind tennis")

EVENTS = [
    {
        "title": "IBTA World Blind Tennis Championships 2026 — Opening",
        "date": "2026-08-24",
        "start": "17:00",
        "end": "21:00",
    },
    {
        "title": "IBTA World Blind Tennis Championships 2026 — Day 1",
        "date": "2026-08-25",
        "start": "09:00",
        "end": "20:00",
    },
    {
        "title": "IBTA World Blind Tennis Championships 2026 — Day 2",
        "date": "2026-08-26",
        "start": "09:00",
        "end": "20:00",
    },
    {
        "title": "IBTA World Blind Tennis Championships 2026 — Day 3",
        "date": "2026-08-27",
        "start": "09:00",
        "end": "20:00",
    },
    {
        "title": "IBTA World Blind Tennis Championships 2026 — Day 4",
        "date": "2026-08-28",
        "start": "09:00",
        "end": "20:00",
    },
    {
        "title": "IBTA World Blind Tennis Championships 2026 — Day 5",
        "date": "2026-08-29",
        "start": "09:00",
        "end": "20:00",
    },
]

DESCRIPTION = (
    "IBTA World Blind Tennis Championships 2026, Vilnius, Lithuania.\n"
    "Live coverage from IBTA Tennis TV."
)


def _local(date: str, hhmm: str) -> datetime:
    hour, minute = (int(part) for part in hhmm.split(":", 1))
    year, month, day = (int(part) for part in date.split("-"))
    return datetime(year, month, day, hour, minute, tzinfo=TZ)


def _rfc3339(value: datetime) -> str:
    return value.isoformat(timespec="seconds")


def planned_events() -> list[dict]:
    rows = []
    for event in EVENTS:
        start = _local(event["date"], event["start"])
        end = _local(event["date"], event["end"])
        rows.append({**event, "start_dt": start, "end_dt": end})
    return rows


def _youtube():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    if not CLIENT_SECRET.exists():
        raise SystemExit(
            f"Brak {CLIENT_SECRET}\n"
            "Pobierz OAuth client (Desktop) z Google Cloud i zapisz ten plik."
        )
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
            print(
                "OAuth: wybierz admin@internationalblindtennis.org (IBTA Admin),\n"
                "nie Dawida ani Vest Media.",
                flush=True,
            )
            creds = flow.run_local_server(port=0, prompt="consent select_account")
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
        TOKEN_PATH.chmod(0o600)
    return build("youtube", "v3", credentials=creds)


def _channel(youtube) -> dict:
    response = youtube.channels().list(part="id,snippet", mine=True).execute()
    items = response.get("items") or []
    if not items:
        raise SystemExit(
            "OAuth nie zwraca kanału. W oknie zgody wybierz Brand Account "
            "IBTA Tennis TV, nie prywatne konto Google."
        )
    return items[0]


def _looks_like_ibta(title: str) -> bool:
    lowered = title.casefold()
    return any(hint in lowered for hint in EXPECTED_CHANNEL_HINTS)


def cmd_plan() -> int:
    print(f"Strefa: Europe/Vilnius")
    print(f"OAuth pliki: {CONFIG_DIR}")
    print()
    for row in planned_events():
        print(
            f"{row['date']}  {row['start']}–{row['end']}  {row['title']}"
        )
        utc = row["start_dt"].astimezone(ZoneInfo("UTC")).strftime("%H:%M")
        print(f"           {row['start_dt'].isoformat(timespec='minutes')}  ({utc} UTC)")
    return 0


def cmd_whoami() -> int:
    youtube = _youtube()
    channel = _channel(youtube)
    title = channel["snippet"]["title"]
    channel_id = channel["id"]
    print(f"Kanał: {title}")
    print(f"ID:    {channel_id}")
    print(f"URL:   https://www.youtube.com/channel/{channel_id}")
    if not _looks_like_ibta(title):
        print(
            "\nUWAGA: nazwa nie wygląda na IBTA Tennis TV. "
            "Usuń token i zaloguj się ponownie, wybierając Brand Account kanału:"
        )
        print(f"  del {TOKEN_PATH}")
        return 2
    print("OK — to wygląda na właściwy kanał.")
    return 0


def _existing_titles(youtube) -> set[str]:
    titles: set[str] = set()
    request = youtube.liveBroadcasts().list(
        part="snippet",
        mine=True,
        maxResults=50,
        broadcastType="all",
    )
    while request is not None:
        response = request.execute()
        for item in response.get("items") or []:
            titles.add(str(item.get("snippet", {}).get("title") or ""))
        request = youtube.liveBroadcasts().list_next(request, response)
    return titles


def _get_or_create_stream(youtube) -> dict:
    request = youtube.liveStreams().list(part="id,snippet,cdn", mine=True, maxResults=50)
    while request is not None:
        response = request.execute()
        for item in response.get("items") or []:
            if str(item.get("snippet", {}).get("title") or "") == STREAM_TITLE:
                return item
        request = youtube.liveStreams().list_next(request, response)
    created = youtube.liveStreams().insert(
        part="snippet,cdn,contentDetails",
        body={
            "snippet": {"title": STREAM_TITLE, "description": DESCRIPTION},
            "cdn": {
                "frameRate": "variable",
                "ingestionType": "rtmp",
                "resolution": "variable",
            },
            "contentDetails": {"isReusable": True},
        },
    ).execute()
    return created


def _print_ingest(stream: dict) -> None:
    info = ((stream.get("cdn") or {}).get("ingestionInfo") or {})
    address = info.get("ingestionAddress") or info.get("rtmpsIngestionAddress") or ""
    name = info.get("streamName") or ""
    print("\nKlucz RTMP (ten sam na wszystkie dni):")
    print(f"  server: {address}")
    print(f"  key:    {name}")


def cmd_apply(*, force_channel: bool) -> int:
    youtube = _youtube()
    channel = _channel(youtube)
    title = channel["snippet"]["title"]
    print(f"Kanał: {title} ({channel['id']})")
    if not force_channel and not _looks_like_ibta(title):
        raise SystemExit(
            "Zatrzymane: kanał nie wygląda na IBTA Tennis TV. "
            "Jeśli to na pewno ten kanał, uruchom z --force-channel."
        )
    stream = _get_or_create_stream(youtube)
    existing = _existing_titles(youtube)
    created = 0
    skipped = 0
    for row in planned_events():
        if row["title"] in existing:
            print(f"SKIP już jest: {row['title']}")
            skipped += 1
            continue
        broadcast = youtube.liveBroadcasts().insert(
            part="snippet,status,contentDetails",
            body={
                "snippet": {
                    "title": row["title"],
                    "description": DESCRIPTION,
                    "scheduledStartTime": _rfc3339(row["start_dt"]),
                    "scheduledEndTime": _rfc3339(row["end_dt"]),
                    "categoryId": "17",
                },
                "status": {
                    "privacyStatus": "public",
                    "selfDeclaredMadeForKids": False,
                },
                "contentDetails": {
                    "enableAutoStart": True,
                    "enableAutoStop": False,
                    "enableDvr": True,
                    "recordFromStart": True,
                    "enableEmbed": True,
                    "monitorStream": {"enableMonitorStream": True},
                },
            },
        ).execute()
        bound = youtube.liveBroadcasts().bind(
            part="id,snippet,status,contentDetails",
            id=broadcast["id"],
            streamId=stream["id"],
        ).execute()
        watch = f"https://www.youtube.com/watch?v={bound['id']}"
        print(f"OK  {row['date']} {row['start']}  {watch}")
        created += 1
    _print_ingest(stream)
    print(f"\nUtworzono {created}, pominięto {skipped}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Schedule IBTA Vilnius YouTube lives")
    parser.add_argument(
        "command",
        choices=("plan", "whoami", "apply"),
        help="plan = tylko godziny, whoami = który kanał, apply = utwórz eventy",
    )
    parser.add_argument(
        "--force-channel",
        action="store_true",
        help="Twórz eventy nawet gdy nazwa kanału nie zawiera IBTA/Tennis TV",
    )
    args = parser.parse_args()
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if args.command == "plan":
        return cmd_plan()
    if args.command == "whoami":
        return cmd_whoami()
    return cmd_apply(force_channel=args.force_channel)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:
        if "accessNotConfigured" in str(exc) or "YouTube Data API" in str(exc):
            print("Włącz YouTube Data API v3 w projekcie Google Cloud.", file=sys.stderr)
        raise
