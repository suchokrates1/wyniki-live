"""A cap on wrong passwords for the admin's and the tournament office's sign-in.

Per client (the address Cloudflare names, else the socket's) and per door: five wrong
passwords in 15 minutes close that door to that client until the oldest one ages out.
Counted per client only, never per account: the admin has one password, and a cap on
it for everyone would let anyone lock the admin out. The organizer's sign-in has its
own cap (organizer_auth), per address and per client.

The counts live with the application, so every test app starts clean.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from flask import current_app, jsonify, request

WINDOW_SECONDS = 15 * 60
MAX_FAILURES = 5


def _store() -> defaultdict:
    return current_app.extensions.setdefault("login_throttle", defaultdict(deque))


def _key(door: str) -> str:
    client = request.headers.get("CF-Connecting-IP") or request.remote_addr or "?"
    return f"{door}:{client}"


def _recent(door: str) -> deque:
    stamps = _store()[_key(door)]
    cutoff = time.monotonic() - WINDOW_SECONDS
    while stamps and stamps[0] < cutoff:
        stamps.popleft()
    return stamps


def refusal(door: str):
    """A 429 answer when this client has used up its wrong passwords at this door, else None."""
    if len(_recent(door)) >= MAX_FAILURES:
        return jsonify({"error": "Too many attempts"}), 429
    return None


def note_failure(door: str) -> None:
    _recent(door).append(time.monotonic())


def forget(door: str) -> None:
    _store().pop(_key(door), None)
