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


def test_a_401_the_gate_raises_still_carries_the_cors_headers(
    client: TestClient, monkeypatch
):
    """The 401 that require_session returns must cross CORSMiddleware.

    CORSMiddleware is registered last so it sits on the outside of the stack. If
    that ever changes, the gate's own 401 skips CORS, the browser refuses to
    hand the response to the page, and JS sees "Failed to fetch" instead of a
    401: the session-expired handler never fires and the app sits on empty
    lists instead of going back to the login screen.

    The origin used here is one the middleware really has. Patching
    config.CORS_ORIGINS would not work: the middleware captured the list when
    it was registered, so the test would pass or fail for the wrong reason.
    """
    monkeypatch.setattr(config, "PASSWORD", "secreto")
    allowed = config.CORS_ORIGINS[0]

    response = client.get("/api/accounts", headers={"Origin": allowed})

    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == allowed
    assert response.headers["access-control-allow-credentials"] == "true"


def test_a_401_reaches_a_foreign_origin_without_permission(client: TestClient, monkeypatch):
    """The same response, to an origin that is not on the list: CORS is added by
    the middleware, so it stays absent and the browser blocks it. That is the
    whole point of naming the origins."""
    monkeypatch.setattr(config, "PASSWORD", "secreto")

    response = client.get("/api/accounts", headers={"Origin": "https://otro.app"})

    assert response.status_code == 401
    assert "access-control-allow-origin" not in response.headers


CRASHING_PAYLOAD = {
    "account_id": 1,
    "category_id": None,
    "type": "EXPENSE",
    "amount": 10,
    "date": "2026-09-30",
}


def test_a_crash_still_crosses_cors_so_the_page_can_read_it(client: TestClient, monkeypatch):
    """A 500 has to reach the browser with its CORS headers, same as the 401.

    An unhandled exception escapes to ServerErrorMiddleware, which sits outside
    CORSMiddleware, so the response would go back without
    access-control-allow-origin and the page could only report "Failed to fetch":
    no status, no path, nothing to search for in the logs. The middleware that
    turns the crash into a response has to be registered inside CORSMiddleware
    for this to hold, so this test fails if that order is ever reverted.
    """
    from app.services import transaction_service

    def boom(*_args, **_kwargs):
        raise RuntimeError("se cayo la base")

    monkeypatch.setattr(transaction_service, "create_transaction", boom)
    allowed = config.CORS_ORIGINS[0]

    response = client.post(
        "/api/transactions", headers={"Origin": allowed}, json=CRASHING_PAYLOAD
    )

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == allowed
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.json()["detail"] == "Error interno del servidor."


def test_a_crash_is_logged_but_not_echoed_to_the_page(
    client: TestClient, monkeypatch, caplog
):
    """The traceback belongs in the backend log; the response goes to whoever
    knows the URL, so it only says that it broke."""
    from app.services import transaction_service

    def boom(*_args, **_kwargs):
        raise RuntimeError("se cayo la base con el secreto adentro")

    monkeypatch.setattr(transaction_service, "create_transaction", boom)

    response = client.post("/api/transactions", json=CRASHING_PAYLOAD)

    assert response.status_code == 500
    assert "se cayo la base" not in response.text
    assert "se cayo la base" in caplog.text
