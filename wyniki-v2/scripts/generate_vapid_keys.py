#!/usr/bin/env python3
"""Generate a VAPID key pair for public Web Push.

py_vapid hands back `cryptography` key objects, not the base64url strings the
browser's PushManager and pywebpush expect, so the serialisation is done here.

Writes `VAPID_PUBLIC_KEY=` and `VAPID_PRIVATE_KEY=` lines. By default they go to
stdout; pass a file and they are appended to it instead, so the private key
never has to pass through a terminal or a shell history:

    python scripts/generate_vapid_keys.py >> .env
    python scripts/generate_vapid_keys.py --append .env

The private key is a secret: it belongs in the host's .env next to SECRET_KEY,
never in the repository. Replacing it invalidates every existing subscription,
so generate once per environment and keep it.
"""

from __future__ import annotations

import argparse
import base64
import sys

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def generate() -> tuple[str, str]:
    vapid = Vapid01()
    vapid.generate_keys()
    private_key = vapid.private_key

    raw_private = private_key.private_numbers().private_value.to_bytes(32, "big")
    raw_public = private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return _b64(raw_public), _b64(raw_private)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--append", metavar="FILE", help="append the two lines to FILE instead of stdout")
    args = parser.parse_args()

    public, private = generate()
    lines = f"VAPID_PUBLIC_KEY={public}\nVAPID_PRIVATE_KEY={private}\n"

    if args.append:
        with open(args.append, "a", encoding="utf-8") as handle:
            handle.write(lines)
        print(f"Appended VAPID keys to {args.append} (public key ends ...{public[-8:]})", file=sys.stderr)
    else:
        sys.stdout.write(lines)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
