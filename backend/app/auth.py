"""Password gate for the app.

There is no user model on purpose: one person, one password, one person paying
the bills. What the middleware protects is the *deployment*, because on a free
tier the app lives on a public URL and without this anyone could read a full
financial history.

Two things can open the door:

- A signed session cookie, which is what the browser sends. The signature is
  HMAC-SHA256 over the expiry date, keyed with a hash of the password, so
  there is no session table and no server-side state: restarting the app does
  not log anyone out.
- HTTP Basic, kept for `curl` and for the test suite. Browsers do not show a
  Basic dialog for a `fetch()`, so the UI path is the cookie only.

Changing FINANZAS_PASSWORD invalidates every existing session, because the
signature key is derived from it.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

from fastapi import Response

from app import config

COOKIE = "finanzas_session"


def _key() -> bytes:
    # Deriving from the password means no separate secret to keep in sync, and
    # a rotated password silently drops every outstanding session.
    return hashlib.sha256(config.PASSWORD.encode("utf-8")).digest()


def _sign(payload: str) -> str:
    return base64.urlsafe_b64encode(
        hmac.new(_key(), payload.encode("utf-8"), hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")


def issue_cookie(response: Response, *, secure: bool) -> None:
    """Attach a session cookie that is valid for SESSION_TTL_DAYS.

    `secure` decides SameSite. Vercel and Render are different *sites*, and a
    cross-site cookie is only accepted by browsers when it is SameSite=None
    and Secure, which in turn requires HTTPS. On plain HTTP (local dev) the
    browser rejects that combination, so fall back to Lax.
    """
    expires = int(time.time()) + config.SESSION_TTL_DAYS * 86400
    payload = f"v1.{expires}"
    token = f"{payload}.{_sign(payload)}"

    response.set_cookie(
        COOKIE,
        token,
        max_age=config.SESSION_TTL_DAYS * 86400,
        httponly=True,  # unreachable from JavaScript, so an XSS cannot steal it
        samesite="none" if secure else "lax",
        secure=secure,
        path="/",
    )


def clear_cookie(response: Response, *, secure: bool) -> None:
    response.delete_cookie(COOKIE, path="/", samesite="none" if secure else "lax", secure=secure)


def verify(token: str | None) -> bool:
    """True when the cookie was signed by us and has not expired."""
    if not token:
        return False
    version, expires, signature = token.split(".") if token.count(".") == 2 else ("", "", "")
    if version != "v1" or not expires or not signature:
        return False
    # The signature covers the version too, so a downgrade is not possible.
    if not hmac.compare_digest(signature, _sign(f"{version}.{expires}")):
        return False
    try:
        return int(expires) > int(time.time())
    except ValueError:
        return False


def check_basic(header: str) -> bool:
    """Validate an `Authorization: Basic ...` header."""
    scheme, _, encoded = header.partition(" ")
    if scheme.lower() != "basic":
        return False
    try:
        decoded = base64.b64decode(encoded).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return False
    user, _, password = decoded.partition(":")
    # compare_digest on both halves: a plain == leaks length and prefix.
    return hmac.compare_digest(user, config.USERNAME) & hmac.compare_digest(
        password, config.PASSWORD
    )
