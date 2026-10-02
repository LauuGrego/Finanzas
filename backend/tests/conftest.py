"""Test fixtures.

Every test gets its own PostgreSQL schema inside one database, created and
dropped around the test. It used to get its own SQLite file, which is gone: the
app now runs on PostgreSQL everywhere, and a suite that runs on a different engine
than production is exactly what hid the sequence bug that broke account creation
in the cloud. The engine under test is now the engine that ships.

A schema per test, not a database per test, because `CREATE DATABASE` needs
privileges the shared role may not have and is slow enough to matter across 233
tests. Schemas are isolated the same way and `DROP SCHEMA ... CASCADE` is cheap.

Run `docker compose up -d` first. If the database is not there, the tests fail
loudly on purpose: silently falling back to SQLite is what made this confusing in
the first place.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.database import Base, get_db  # noqa: E402
from app.main import app, seed_defaults  # noqa: E402

# The same database `docker compose up -d` starts. Overridable so the suite can
# run against anything, but it has to be PostgreSQL: a test that quietly ran on
# SQLite would be testing the engine we no longer ship.
TEST_DATABASE_URL = os.getenv(
    "FINANZAS_TEST_DATABASE_URL",
    "postgresql+psycopg://finanzas:finanzas@127.0.0.1:5434/finanzas",
)


def _assert_postgres(url: str) -> None:
    """Refuse to run on anything but PostgreSQL, and say why in one line."""
    if not url.startswith("postgresql"):
        pytest.exit(
            f"La suite corre solo contra PostgreSQL, y la URL dice: {url!r}\n"
            "Levantá la base con `docker compose up -d` desde la raíz del repo.",
            returncode=1,
        )


@pytest.fixture(scope="session", autouse=True)
def postgres_is_up() -> None:
    """Fail before the first test if there is no database to talk to.

    Not a skip. A skipped suite reads as a passing one, and the whole reason for
    moving off SQLite is that a green run must mean something.
    """
    _assert_postgres(TEST_DATABASE_URL)
    engine = create_engine(TEST_DATABASE_URL, connect_args={"connect_timeout": 5})
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - the message matters more than the type
        pytest.exit(
            f"No se pudo conectar a la base de tests: {exc}\n\n"
            "Levantala con `docker compose up -d` desde la raíz del repo.",
            returncode=1,
        )
    finally:
        engine.dispose()


def _pinned_engine(schema: str):
    """An engine whose every connection is locked to `schema`.

    `search_path` is what puts the unqualified table names in the test schema
    instead of `public`. It has to be set on each connection through the connect
    event, because the pool hands out new ones and a `search_path` set once on a
    single connection would leak into `public` from the next.
    """
    engine = create_engine(TEST_DATABASE_URL, connect_args={"connect_timeout": 5})

    @event.listens_for(engine, "connect")
    def _use_test_schema(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute(f'SET search_path TO "{schema}"')
        cursor.close()

    return engine


@pytest.fixture
def schema() -> Iterator[str]:
    """A throwaway PostgreSQL schema for one test, dropped afterwards."""
    name = f"test_{uuid4().hex[:12]}"
    admin = create_engine(TEST_DATABASE_URL, connect_args={"connect_timeout": 5})
    with admin.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA "{name}"'))
        conn.commit()

    yield name

    with admin.connect() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{name}" CASCADE'))
        conn.commit()
    admin.dispose()


@pytest.fixture
def session(schema: str) -> Iterator[Session]:
    """A session bound to the throwaway schema, tables already created."""
    engine = _pinned_engine(schema)
    Base.metadata.create_all(bind=engine)
    try:
        with Session(engine, expire_on_commit=False) as db:
            yield db
    finally:
        engine.dispose()


@pytest.fixture
def built(schema: str, tmp_path: Path):
    """A fake `npm run build` output that the SPA handler can serve."""
    from app import main

    static = tmp_path / "dist"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<!doctype html><title>Finanzas</title>")
    (static / "favicon.svg").write_text("<svg/>")
    main.STATIC = static
    return static


@pytest.fixture
def app_on_test_schema(schema: str, monkeypatch) -> Iterator[object]:
    """Point the app's own module-level engine at the throwaway schema.

    The lifespan runs `create_all` and the startup seed on the engine that lives
    at module level in `app.main`, which is the development database. Left alone,
    running the suite would create tables in the very database the app uses — the
    tests would pass while quietly mutating real dev data.

    Only the tests that enter `TestClient` as a context manager need this; the
    `client` fixture overrides `get_db` and never reaches the lifespan.
    """
    from app import main

    engine = _pinned_engine(schema)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(
        main,
        "SessionLocal",
        sessionmaker(bind=engine, autoflush=False, expire_on_commit=False),
    )
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def client(schema: str) -> Iterator[TestClient]:
    """A fresh schema per test, with the startup seed already applied."""
    engine = _pinned_engine(schema)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Note: no `with TestClient(...)` here on purpose. The lifespan would run the
    # real startup seed against the module-level engine, which points at the
    # development database, so the fixture seeds this one itself.
    with TestingSession() as db:
        seed_defaults(db, with_accounts=False)

    test_client = TestClient(app)
    yield test_client
    test_client.close()
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def seed(client: TestClient):
    """Two accounts plus references to the categories created by the startup seed."""
    accounts = client.post(
        "/api/accounts", json={"name": "Banco", "initial_balance": 100000}
    ).json()
    assert "id" in accounts, accounts
    wallet = client.post(
        "/api/accounts", json={"name": "Mercado Pago", "initial_balance": 0}
    ).json()

    categories = client.get("/api/categories").json()
    by_name = {c["name"]: c for c in categories}
    return {
        "bank": accounts,
        "wallet": wallet,
        "food": by_name["Comida"],
        "salary": by_name["Sueldo"],
        "today": date.today().isoformat(),
    }


def fund(client: TestClient, account_id: int, amount: float) -> None:
    """Raise an account's starting balance so a test can spend from it.

    Goes through `initial_balance` and not an income movement on purpose: an
    income would be a transaction, and the tests that need this also assert on
    how many movements an account has.
    """
    response = client.put(f"/api/accounts/{account_id}", json={"initial_balance": amount})
    assert response.status_code == 200, response.text


def expense(seed, amount: float, **overrides) -> dict:
    payload = {
        "account_id": seed["bank"]["id"],
        "category_id": seed["food"]["id"],
        "type": "EXPENSE",
        "amount": amount,
        "description": "Supermercado",
        "date": seed["today"],
    }
    payload.update(overrides)
    return payload