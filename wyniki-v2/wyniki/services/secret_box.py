"""Secrets the app must read back (the SMTP password: Zoho wants the password itself, so it
cannot be hashed), kept encrypted in the database.

The key comes from SECRET_KEY, which lives in the server's configuration, not in the
database: a copy or a backup of the database alone does not give the password away, and
a value sealed on one server does not open on another. Should SECRET_KEY change, the
password reads as unset and has to be typed in again.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from ..config import logger, settings

PREFIX = "enc:v1:"


def _fernet() -> Fernet:
    digest = hashlib.sha256(f"stored-secret:{settings.secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def is_sealed(stored: str | None) -> bool:
    return str(stored or "").startswith(PREFIX)


def seal(plain: str) -> str:
    """The value to store; '' stays ''."""
    if not plain:
        return ""
    return PREFIX + _fernet().encrypt(plain.encode()).decode()


def open_sealed(stored: str | None) -> str:
    """The secret itself. A value from before encryption reads as it is; one this server
    cannot open (another SECRET_KEY) reads as ''."""
    value = str(stored or "")
    if not is_sealed(value):
        return value
    try:
        return _fernet().decrypt(value[len(PREFIX):].encode()).decode()
    except InvalidToken:
        logger.error("stored_secret_unreadable")
        return ""
