from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.database import Base, get_db  # noqa: E402
from app.main import app, seed_defaults  # noqa: E402


@pytest.fixture
def built(tmp_path, monkeypatch):
    """A fake `npm run build` output that the SPA handler can serve."""
    from app import main

    static = tmp_path / "dist"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<!doctype html><title>Finanzas</title>")
    (static / "favicon.svg").write_text("<svg/>")
    monkeypatch.setattr(main, "STATIC", static)
    return static


@pytest.fixture
def client(tmp_path: Path):
    """A fresh in-memory database per test."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
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
    # real startup seed against the real database file, so the fixture seeds the
    # temporary one itself.
    with TestingSession() as db:
        seed_defaults(db, with_accounts=False)

    test_client = TestClient(app)
    yield test_client
    test_client.close()
    app.dependency_overrides.clear()


@pytest.fixture
def seed(client: TestClient):
    """Two accounts plus references to the categories created by the startup seed."""
    accounts = client.post("/api/accounts", json={"name": "Banco", "initial_balance": 100000}).json()
    assert "id" in accounts, accounts
    wallet = client.post("/api/accounts", json={"name": "Mercado Pago", "initial_balance": 0}).json()

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

    The `seed` fixture leaves Mercado Pago at zero, which is fine right up until
    a test needs to spend from it. Spending more than the balance is rejected,
    so the money has to be there first, the same way it would be in real use.
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
