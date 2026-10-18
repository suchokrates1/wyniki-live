"""Spoken score for one court, built from hybrid sentences.

Each sentence is generated once, with the neighbouring sentences as context,
and stored next to the database. The court hears one stitched mp3. A new
playback token is issued only after the score has stayed still, and again
while that same score is still on the court.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from ..config import logger, settings
from .lector_lines import court_state_for_lector, sentences_for_court
from .lector_shelf import stitch_chunks, warm_shelf as warm_shelf

COURT_ID = "1"
QUIET_SECONDS = 20
REPEAT_SECONDS = 300


def _data_root() -> Path:
    return Path(settings.database_path).parent


def _shared_sentence(text: str) -> bool:
    """One recording per sentence. Neighbours are heard only on the first take."""
    return bool(text)


def chunk_path(
    text: str,
    previous: str | None,
    following: str | None,
    *,
    shared: bool = False,
    language: str = "pl",
) -> Path:
    parts = [
        settings.elevenlabs_voice_id,
        settings.elevenlabs_model,
        language or "pl",
        text,
    ]
    if not shared:
        parts.extend([previous or "", following or ""])
    identity = "\n".join(parts)
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    return _data_root() / "lector-chunks" / f"{digest}.mp3"


def announcement_path(court: str = "1") -> Path:
    return _data_root() / "lector" / f"court-{court}.mp3"


def speak_sentence(
    text: str,
    previous: str | None,
    following: str | None,
    language: str = "pl",
) -> bytes:
    """One hybrid sentence from ElevenLabs. The key is never written to the log."""
    if not settings.elevenlabs_api_key:
        raise RuntimeError("lector voice is not configured")
    body: dict = {
        "text": text,
        "model_id": settings.elevenlabs_model,
        "language_code": language or "pl",
        "voice_settings": {"stability": 0.55, "similarity_boost": 0.8},
    }
    if previous:
        body["previous_text"] = previous
    if following:
        body["next_text"] = following
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "xi-api-key": settings.elevenlabs_api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read(240).decode("utf-8", "replace")
        raise RuntimeError(f"lector voice failed ({exc.code}): {detail}") from None
    if not payload:
        raise RuntimeError("lector voice returned an empty clip")
    return payload


def ensure_chunk(
    text: str,
    previous: str | None,
    following: str | None,
    *,
    speaker=speak_sentence,
    shared: bool = False,
    language: str = "pl",
) -> Path:
    path = chunk_path(text, previous, following, shared=shared, language=language)
    if path.is_file() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _invoke(speaker, text, previous, following, language)
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)
    return path


def _invoke(speaker, text: str, previous: str | None, following: str | None, language: str) -> bytes:
    if speaker is speak_sentence:
        return speak_sentence(text, previous, following, language=language)
    return speaker(text, previous, following)


def prepare(sentences: list[str], *, speaker=speak_sentence, language: str = "pl") -> list[Path]:
    """Generate any missing chunks for this exact line. Neighbours are part of the clip."""
    paths = []
    for index, sentence in enumerate(sentences):
        previous = sentences[index - 1] if index else None
        following = sentences[index + 1] if index + 1 < len(sentences) else None
        paths.append(
            ensure_chunk(
                sentence,
                previous,
                following,
                speaker=speaker,
                shared=_shared_sentence(sentence),
                language=language,
            )
        )
    return paths


def build_announcement(
    sentences: list[str],
    *,
    speaker=speak_sentence,
    court: str = "1",
    language: str = "pl",
) -> Path:
    paths = prepare(sentences, speaker=speaker, language=language)
    dest = announcement_path(court)
    stitch_chunks(paths, dest)
    return dest


class Playback:
    """Decides when court 1 may be heard.

    A score that is still moving is not spoken. After it has been still for the
    quiet interval, the latest line is published. The same line is offered
    again after the repeat interval, without building it a second time.
    """

    def __init__(
        self,
        *,
        quiet: float = QUIET_SECONDS,
        repeat: float = REPEAT_SECONDS,
        speaker=speak_sentence,
        court: str = "1",
    ):
        self.court = str(court)
        self.quiet = quiet
        self.repeat = repeat
        self.speaker = speaker
        self._lock = threading.Lock()
        self.token = ""
        self.sentences: list[str] = []
        self.url = ""
        self._published = ""
        self._pending = ""
        self._pending_since = 0.0
        self._published_at = 0.0

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "court": self.court,
                "token": self.token,
                "url": self.url,
                "sentences": list(self.sentences),
            }

    def observe(self, sentences: list[str] | None, now: float, language: str = "pl") -> None:
        text = "\n".join(sentences or [])
        with self._lock:
            if not text:
                return
            if text != self._published:
                if text != self._pending:
                    self._pending = text
                    self._pending_since = now
                    pending_sentences = list(sentences or [])
                    should_build = False
                else:
                    pending_sentences = list(sentences or [])
                    should_build = (now - self._pending_since) >= self.quiet
            else:
                self._pending = ""
                pending_sentences = []
                should_build = False
                should_repeat = bool(self.token) and (now - self._published_at) >= self.repeat
                if should_repeat:
                    self._published_at = now
                    self.token = uuid.uuid4().hex
                    self.url = f"/data/lector/court-{self.court}.mp3?v={self.token}"
                return

        if not should_build:
            return
        try:
            build_announcement(
                pending_sentences,
                speaker=self.speaker,
                court=self.court,
                language=language,
            )
        except Exception as exc:  # noqa: BLE001 - a failed clip must not kill the loop
            logger.warning("lector_build_failed", error=str(exc))
            return
        with self._lock:
            if "\n".join(pending_sentences) != self._pending:
                return
            self._published = self._pending
            self._pending = ""
            self._published_at = now
            self.sentences = pending_sentences
            self.token = uuid.uuid4().hex
            self.url = f"/data/lector/court-{self.court}.mp3?v={self.token}"

    def tick(self, now: float | None = None) -> None:
        state = court_state_for_lector(self.court)
        language = str((state or {}).get("tournament_language") or "pl")
        self.observe(
            sentences_for_court(state),
            time.monotonic() if now is None else now,
            language=language,
        )

_playbacks: dict[str, Playback] = {}


def playback_for(court: str) -> Playback:
    key = str(court)
    found = _playbacks.get(key)
    if found is None:
        found = Playback(
            quiet=settings.lector_quiet_seconds,
            repeat=settings.lector_repeat_seconds,
            court=key,
        )
        _playbacks[key] = found
    return found

playback = playback_for("1")
