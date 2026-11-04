"""Stateless, short-lived sessions that carry a student's Claude API key.

The key is sealed with AES-256-GCM under a server-only key (KEY_ENCRYPTION_KEY) and handed back to the
browser as an HttpOnly cookie. Nothing is stored server-side. A sealed token expires after `idle_seconds`
without use, or `absolute_seconds` after it was issued, whichever comes first.

Deliberately NOT wrapped with @logged: return values contain the plaintext key.
"""
from __future__ import annotations

import base64
import json
import os
import time
from dataclasses import dataclass, field
from typing import Callable

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_VERSION = "v1"
_AAD = b"gcse-key-session-v1"


class SessionInvalid(Exception):
    """Token missing, tampered with, or sealed with a different server key."""


class SessionExpired(Exception):
    """Token was valid but timed out (idle or absolute)."""


@dataclass(frozen=True)
class KeySession:
    api_key: str = field(repr=False)
    issued_at: float
    last_used_at: float


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class KeySessionCodec:
    def __init__(self, kek_b64: str, idle_seconds: int, absolute_seconds: int,
                 clock: Callable[[], float] = time.time) -> None:
        try:
            kek = base64.b64decode(kek_b64, validate=True)
        except Exception as e:
            raise ValueError("KEY_ENCRYPTION_KEY must be base64") from e
        if len(kek) != 32:
            raise ValueError("KEY_ENCRYPTION_KEY must decode to 32 bytes")
        self._aead = AESGCM(kek)
        self.idle = idle_seconds
        self.absolute = absolute_seconds
        self.clock = clock

    def seal(self, api_key: str, issued_at: float | None = None) -> str:
        now = self.clock()
        payload = json.dumps({"k": api_key, "iat": issued_at or now, "lat": now}).encode()
        nonce = os.urandom(12)
        return f"{_VERSION}.{_b64e(nonce + self._aead.encrypt(nonce, payload, _AAD))}"

    def open(self, token: str | None) -> KeySession:
        if not token or not token.startswith(_VERSION + "."):
            raise SessionInvalid()
        try:
            raw = _b64d(token[len(_VERSION) + 1:])
            data = json.loads(self._aead.decrypt(raw[:12], raw[12:], _AAD))
            session = KeySession(api_key=data["k"], issued_at=float(data["iat"]), last_used_at=float(data["lat"]))
        except (InvalidTag, ValueError, KeyError, TypeError) as e:
            raise SessionInvalid() from e
        now = self.clock()
        if now - session.last_used_at > self.idle or now - session.issued_at > self.absolute:
            raise SessionExpired()
        return session

    def refresh(self, session: KeySession) -> str:
        """Re-seal with last-use = now; the absolute deadline is unchanged."""
        return self.seal(session.api_key, issued_at=session.issued_at)

    def expiries(self, session: KeySession) -> tuple[float, float]:
        """(idle deadline, absolute deadline) as epoch seconds."""
        return session.last_used_at + self.idle, session.issued_at + self.absolute
