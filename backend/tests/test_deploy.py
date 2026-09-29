"""Deployment concerns: the optional password and the frontend that ships with
the API. Both only matter once the app is reachable from somewhere else."""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from app import config, main


@pytest.fixture
def built(tmp_path, monkeypatch):
    """A fake `npm run build` output that the SPA handler can serve."""
    static = tmp_path / "dist"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<!doctype html><title>Finanzas</title>")
    (static / "favicon.svg").write_text("<svg/>")
    (static / "assets" / "index-abc123.js").write_text("console.log(1)")
    monkeypatch.setattr(main, "STATIC", static)
    return static

def test_an_unknown_path_falls_back_to_the_app(client: TestClient, built):
    """/agenda is a React route, not a file: it has to return index.html."""
    for path in ("/", "/agenda", "/cuentas/3", "/estadisticas"):
        response = client.get(path)
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Finanzas" in response.text


def test_real_files_are_served_instead_of_the_fallback(client: TestClient, built):
    """`/assets` is mounted at startup, but the handler serves any real file."""
    favicon = client.get("/favicon.svg")
    assert favicon.status_code == 200
    assert "<svg/>" in favicon.text

    # Not an asset name, so the browser never asks for it, but it is a file.
    assert client.get("/index.html").status_code == 200


def test_index_html_is_not_cached_but_a_hashed_asset_is(client: TestClient, built):
    """A stale index.html points at assets that no longer exist."""
    assert "no-cache" in client.get("/").headers.get("cache-control", "")


def test_the_router_still_answers_under_the_api_prefix(client: TestClient, built):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/accounts").status_code == 200


def test_a_request_cannot_escape_the_build_directory(client: TestClient, built, monkeypatch):
    """`?path=../main.py` must not turn into a file read."""
    secret = built.parent / "secreto.txt"
    secret.write_text("no deberias verme")

    for attempt in ("../secreto.txt", "..%2Fsecreto.txt", "assets/../../secreto.txt"):
        response = client.get(f"/{attempt}")
        assert response.status_code == 200
        assert "no deberias verme" not in response.text


# --------------------------------------------------------------------------- #
# Password
# --------------------------------------------------------------------------- #


def _basic(user: str, password: str) -> dict[str, str]:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_without_a_password_everything_is_open(client: TestClient, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD", "")
    assert client.get("/api/accounts").status_code == 200


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Basic garbage"},
        {"Authorization": "Bearer algo"},
    ],
)
def test_a_wrong_or_missing_password_is_refused(client: TestClient, monkeypatch, headers):
    monkeypatch.setattr(config, "PASSWORD", "secreto")
    monkeypatch.setattr(config, "USERNAME", "lautaro")

    response = client.get("/api/accounts", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Basic")


def test_the_right_password_lets_the_user_in(client: TestClient, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD", "secreto")
    monkeypatch.setattr(config, "USERNAME", "lautaro")

    ok = client.get("/api/accounts", headers=_basic("lautaro", "secreto"))
    assert ok.status_code == 200

    wrong_user = client.get("/api/accounts", headers=_basic("otro", "secreto"))
    wrong_password = client.get("/api/accounts", headers=_basic("lautaro", "otro"))
    assert wrong_user.status_code == 401
    assert wrong_password.status_code == 401


def test_health_stays_open_so_a_monitor_can_check_it(client: TestClient, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD", "secreto")
    assert client.get("/api/health").status_code == 200
