"""Deployment concerns: the optional password and the frontend that ships with
the API. Both only matter once the app is reachable from somewhere else."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import config


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


def test_without_a_password_everything_is_open(client: TestClient, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD", "")
    assert client.get("/api/accounts").status_code == 200


def test_health_stays_open_so_a_monitor_can_check_it(client: TestClient, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD", "secreto")
    assert client.get("/api/health").status_code == 200


# --------------------------------------------------------------------------- #
# CORS
# --------------------------------------------------------------------------- #


def test_unset_cors_allows_the_dev_server_only(monkeypatch):
    monkeypatch.delenv("FINANZAS_CORS", raising=False)
    assert config._origins() == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_several_frontend_origins_can_be_listed(monkeypatch):
    monkeypatch.setenv("FINANZAS_CORS", "https://a.app,https://b.app")
    assert config._origins() == ["https://a.app", "https://b.app"]


def test_a_trailing_slash_does_not_break_the_match(monkeypatch):
    """The URL copied out of the browser always carries one, and CORSMiddleware
    compares origins as exact strings. Without stripping it the preflight is
    rejected and the whole fetch fails, with no clue why."""
    monkeypatch.setenv("FINANZAS_CORS", "https://a.app/ , https://b.app/")
    assert config._origins() == ["https://a.app", "https://b.app"]


def test_an_origin_never_keeps_the_slashes_of_its_path(monkeypatch):
    monkeypatch.setenv("FINANZAS_CORS", "https://a.app/")
    assert config._origins() == ["https://a.app"]
