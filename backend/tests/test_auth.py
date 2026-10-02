"""The password gate.

The app is single-user with no user table, so what is being tested here is that
a public URL does not hand over a financial history, and that the signed cookie
cannot be forged or replayed after the password changes.
"""

from __future__ import annotations

import base64
import time

import pytest
from fastapi.testclient import TestClient

from app import auth, config

PASSWORD = "una-clave-larga"


@pytest.fixture
def locked(client: TestClient, monkeypatch):
    """A client whose app has a password configured."""
    monkeypatch.setattr(config, "PASSWORD", PASSWORD)
    monkeypatch.setattr(config, "USERNAME", "lautaro")
    return client


def cookie_of(response) -> str:
    return response.cookies.get(auth.COOKIE, "")


# --------------------------------------------------------------------------- #
# The gate itself
# --------------------------------------------------------------------------- #


def test_a_locked_app_refuses_anonymous_reads(locked: TestClient):
    assert locked.get("/api/accounts").status_code == 401


def test_a_locked_app_refuses_anonymous_writes(locked: TestClient):
    """A read-only gate would be pointless: anyone could still add movements."""
    assert locked.post("/api/transactions", json={"account_id": 1}).status_code == 401


def test_the_frontend_itself_is_gated(locked: TestClient, built):
    """Otherwise the app shell loads and only the data is hidden."""
    assert locked.get("/").status_code == 401


def test_login_hands_out_a_cookie_that_works(locked: TestClient):
    login = locked.post("/api/login", json={"password": PASSWORD})
    assert login.status_code == 200
    assert cookie_of(login)

    # TestClient keeps the cookie, so the next call is authenticated.
    assert locked.get("/api/accounts").status_code == 200


def test_a_wrong_password_is_refused_and_sets_nothing(locked: TestClient):
    response = locked.post("/api/login", json={"password": "casi"})
    assert response.status_code == 401
    assert not cookie_of(response)
    assert locked.get("/api/accounts").status_code == 401


def test_the_cookie_is_locked_down(locked: TestClient):
    """httpOnly so JavaScript cannot read it; that is what an XSS would go for."""
    header = locked.post("/api/login", json={"password": PASSWORD}).headers["set-cookie"]
    assert "HttpOnly" in header
    assert "Path=/" in header


def test_the_cookie_survives_the_cross_origin_call(locked: TestClient):
    """Vercel and Render are different sites, so the cookie must be SameSite=None."""
    https = {"x-forwarded-proto": "https"}
    header = locked.post("/api/login", json={"password": PASSWORD}, headers=https).headers[
        "set-cookie"
    ]
    assert "samesite=none" in header.lower()
    assert "secure" in header.lower()


def test_over_plain_http_the_cookie_falls_back_to_lax(locked: TestClient):
    """Browsers drop SameSite=None without Secure, so local dev needs Lax."""
    header = locked.post("/api/login", json={"password": PASSWORD}).headers["set-cookie"]
    assert "samesite=lax" in header.lower()
    assert "secure" not in header.lower()


# --------------------------------------------------------------------------- #
# The session endpoint
# --------------------------------------------------------------------------- #


def test_session_answers_200_whether_or_not_you_are_in(locked: TestClient):
    """The frontend asks this to pick between login and dashboard."""
    assert locked.get("/api/session").json()["authenticated"] is False

    locked.post("/api/login", json={"password": PASSWORD})
    assert locked.get("/api/session").json()["authenticated"] is True


def test_session_says_where_the_data_lives(locked: TestClient):
    """Settings shows this; the frontend cannot work it out on its own."""
    body = locked.get("/api/session").json()
    assert body["storage"] == "postgresql"
    assert body["password_required"] is True


def test_logout_closes_the_door_again(locked: TestClient):
    locked.post("/api/login", json={"password": PASSWORD})
    assert locked.get("/api/session").json()["authenticated"] is True

    locked.post("/api/logout")
    assert locked.get("/api/session").json()["authenticated"] is False
    assert locked.get("/api/accounts").status_code == 401


def test_health_stays_open_for_a_monitor(locked: TestClient):
    assert locked.get("/api/health").status_code == 200


def test_with_no_password_configured_nothing_is_asked(client: TestClient, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD", "")
    body = client.get("/api/session").json()
    assert body["authenticated"] is True
    assert body["password_required"] is False
    assert client.post("/api/login", json={"password": "cualquiera"}).status_code == 200


# --------------------------------------------------------------------------- #
# Forging
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "token",
    [
        "",
        "basura",
        "v1",
        "v2.9999999999.firma",
        "v1.9999999999.",
        # A future expiry, but signed with the wrong key.
        "v1.9999999999.Ym90YXZpbml0YQ",
        "....",
    ],
)
def test_a_forged_cookie_is_rejected(locked: TestClient, token):
    assert auth.verify(token) is False


def test_a_tampered_expiry_does_not_pass(locked: TestClient):
    """The signature covers the expiry, so pushing the date forward breaks it."""
    token = cookie_of(locked.post("/api/login", json={"password": PASSWORD}))
    _, _, signature = token.split(".")

    forged = f"v1.99999999999.{signature}"
    assert auth.verify(forged) is False
    # And the original still works, so the test itself is sound.
    assert auth.verify(token) is True


def test_an_expired_cookie_is_rejected(locked: TestClient, monkeypatch):
    """One second past the TTL, the signature is still valid but the date is not."""
    monkeypatch.setattr(config, "SESSION_TTL_DAYS", 0)
    token = cookie_of(locked.post("/api/login", json={"password": PASSWORD}))
    time.sleep(1.1)
    assert auth.verify(token) is False


def test_changing_the_password_kills_every_session(locked: TestClient, monkeypatch):
    """The signing key is derived from the password, so a rotation logs everyone out."""
    token = cookie_of(locked.post("/api/login", json={"password": PASSWORD}))
    assert auth.verify(token) is True

    monkeypatch.setattr(config, "PASSWORD", "otra-clave-distinta")
    assert auth.verify(token) is False


# --------------------------------------------------------------------------- #
# HTTP Basic, kept for curl and the API docs
# --------------------------------------------------------------------------- #


def _basic(user: str, password: str) -> dict[str, str]:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_basic_auth_still_works(locked: TestClient):
    assert locked.get("/api/accounts", headers=_basic("lautaro", PASSWORD)).status_code == 200


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Basic garbage"}, {"Authorization": "Bearer algo"}],
)
def test_a_wrong_or_missing_basic_header_is_refused(locked: TestClient, headers):
    assert locked.get("/api/accounts", headers=headers).status_code == 401


def test_the_wrong_username_is_refused(locked: TestClient):
    """The username is part of the credential, so it is checked, not ignored."""
    assert locked.get("/api/accounts", headers=_basic("otro", PASSWORD)).status_code == 401
