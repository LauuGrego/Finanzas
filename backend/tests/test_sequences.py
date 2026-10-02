"""PostgreSQL sequence repair at startup.

`accounts.id` and every other primary key are numbered by a Postgres sequence
that lives outside the table. The two drift apart the moment a row is inserted
with an explicit id — a script in the Supabase console, a dump restored onto a
database that already has data — and the symptom is a 500 on the first insert
the app makes:

    duplicate key value violates unique constraint "accounts_pkey"

Nothing in the test suite can catch that against SQLite, which has no sequences
at all: SQLite hands out `MAX(id) + 1`, so it can never desynchronise. What is
testable is the part that does not need a live server — that the repair runs on
boot, that it runs before the defaults seed, and that it stays out of the way on
the engine that does not need it.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, sync_sequences
from app.main import app
from app.models import Account


def test_the_repair_runs_before_the_defaults_seed(monkeypatch, tmp_path):
    """The ordering is the whole point, and no SQLite test can catch it.

    Both `seed_defaults` and `sync_sequences` do inserts. With the sequence left
    behind, the seed's own inserts would raise the same 500 as the user's, and
    the API would not finish booting — so the repair has to come first.
    """
    from app import main

    order: list[str] = []
    monkeypatch.setattr(main, "sync_sequences", lambda db: order.append("sync"))
    monkeypatch.setattr(main, "seed_defaults", lambda db, **kw: order.append("seed"))

    # The lifespan binds to the module-level engine, so point that at a throwaway
    # file before entering the client.
    engine = create_engine(
        f"sqlite:///{tmp_path / 'boot.db'}", connect_args={"check_same_thread": False}
    )
    monkeypatch.setattr(main, "engine", engine)

    with TestClient(app):
        pass

    assert order == ["sync", "seed"], order


def test_a_failure_in_the_repair_does_not_stop_the_api_from_starting(monkeypatch, tmp_path):
    """A repair that raises must not take the API down with it.

    Being unable to fix the sequence is exactly the state the app was in before
    the repair existed. Starting anyway leaves the user with the old behaviour
    and a line in the log; refusing to boot would leave them with no app at all.
    """
    from app import main

    seeded: list[bool] = []

    def boom(db):
        raise RuntimeError("sequence out of sync")

    monkeypatch.setattr(main, "sync_sequences", boom)
    monkeypatch.setattr(main, "seed_defaults", lambda db, **kw: seeded.append(True))

    engine = create_engine(
        f"sqlite:///{tmp_path / 'boot2.db'}", connect_args={"check_same_thread": False}
    )
    monkeypatch.setattr(main, "engine", engine)

    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200

    assert seeded == [True]


def test_the_repair_does_nothing_on_sqlite(tmp_path):
    """SQLite has no sequences to fix, and asking anyway would only raise.

    `pg_get_serial_sequence` is PostgreSQL-only. The guard on the dialect is what
    keeps the whole suite working on the engine the tests actually run.
    """
    engine = create_engine(f"sqlite:///{tmp_path / 'seq.db'}")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        db.add(Account(name="Efectivo", initial_balance=100))
        db.commit()
        sync_sequences(db)

        # Untouched: same rows, and the next insert still gets id 2.
        assert db.scalar(text("SELECT COUNT(*) FROM accounts")) == 1
        db.add(Account(name="Banco", initial_balance=100))
        db.commit()
        assert db.scalar(text("SELECT MAX(id) FROM accounts")) == 2