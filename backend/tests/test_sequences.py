"""The Postgres sequence repair, against a real Postgres.

This suite used to be unable to test the thing it was about. It ran on SQLite,
which has no sequences: ids come out as `MAX(id) + 1`, so a desynchronised
sequence is not a state SQLite can be in. The only test possible was that the
startup ran the repair in the right order.

Now that development and tests run on PostgreSQL too, the actual failure is
reproducible, and these tests reproduce it:

    duplicate key value violates unique constraint "accounts_pkey"

which is what made account creation fail in production. The repair advances the
sequence past the ids that already exist, and these tests break the sequence on
purpose, then check that it gets fixed.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.database import sync_sequences
from app.main import app
from app.models import Account, Category


def _sequence_name(session: Session, tabla: str) -> str:
    """The real sequence behind a table's `id`, resolved from the catalog."""
    return session.execute(
        text("SELECT pg_get_serial_sequence(:tabla, 'id')"), {"tabla": tabla}
    ).scalar_one()


def _break_sequence(session: Session, tabla: str) -> None:
    """Rewind a sequence to 1, the state a hand-inserted row leaves behind."""
    session.execute(text(f"SELECT setval(CAST(:seq AS regclass), 1, false)"),
                    {"seq": _sequence_name(session, tabla)})
    session.commit()


def _last_value(session: Session, tabla: str) -> int:
    return session.execute(
        text("SELECT last_value FROM " + _sequence_name(session, tabla))
    ).scalar_one()


def test_the_sequence_is_what_hands_out_ids(session):
    """Baseline: an insert gets the next number, not MAX(id) + 1.

    Worth asserting on its own because it is the assumption the rest rests on.
    """
    session.add(Account(name="Efectivo", initial_balance=100))
    session.commit()

    session.add(Account(name="Banco", initial_balance=200))
    session.commit()

    ids = sorted(a.id for a in session.scalars(select(Account)).all())
    assert ids == [1, 2], ids


def test_a_broken_sequence_really_does_reject_an_insert(session):
    """The production failure, reproduced.

    Inserted with explicit ids is the ordinary way to get here — a script in the
    Supabase console, a dump restored over a database that already had data. The
    sequence stays at 1 while the table fills up, and the next insert the app
    makes collides with a row that is already there.
    """
    session.execute(
        text("INSERT INTO accounts (id, name, type, initial_balance, active)"
             " VALUES (1, 'Banco', 'BANK', 0, true),"
             "        (2, 'Efectivo', 'CASH', 0, true),"
             "        (3, 'Billetera virtual', 'WALLET', 0, true)")
    )
    session.execute(text("SELECT setval(CAST(:seq AS regclass), 1, false)"),
                    {"seq": _sequence_name(session, "accounts")})
    session.commit()

    # Exactly the error Render logged: the sequence says 3, and 3 exists.
    with pytest.raises(Exception) as exc:
        session.add(Account(name="Nueva", initial_balance=0))
        session.commit()

    assert "accounts_pkey" in str(exc.value)


def test_the_repair_fixes_that(session):
    """What `sync_sequences` is for: the insert goes through afterwards."""
    session.execute(
        text("INSERT INTO accounts (id, name, type, initial_balance, active)"
             " VALUES (1, 'Banco', 'BANK', 0, true),"
             "        (2, 'Efectivo', 'CASH', 0, true),"
             "        (3, 'Billetera virtual', 'WALLET', 0, true)")
    )
    session.execute(text("SELECT setval(CAST(:seq AS regclass), 1, false)"),
                    {"seq": _sequence_name(session, "accounts")})
    session.commit()

    sync_sequences(session)

    session.add(Account(name="Nueva", initial_balance=0))
    session.commit()
    assert session.scalar(select(func.count(Account.id))) == 4


def test_the_repair_never_goes_backwards(session):
    """It must not hand out an id another session already took.

    A sequence that got to 50 while the table only has 1 row is normal: an insert
    failed, or `nextval` was called and the transaction was rolled back. Pulling
    it back to 2 would be legal here and wrong the moment two things write at
    once.

    The `true` is the load-bearing part. `pg_sequences.last_value` is NULL until a
    value has actually been handed out, so a sequence parked with
    `setval(..., false)` looks unstarted to the repair even though it is set to
    50 — and the repair would happily rewind it. `true` is what a sequence that
    really consumed ids looks like, which is the case worth guarding.
    """
    session.add(Account(name="Efectivo", initial_balance=0))
    session.commit()
    session.execute(text("SELECT setval(CAST(:seq AS regclass), 50, true)"),
                    {"seq": _sequence_name(session, "accounts")})
    session.commit()

    sync_sequences(session)

    assert _last_value(session, "accounts") == 50


def test_the_repair_does_not_waste_an_id(session):
    """The next id after the repair is `MAX(id) + 1`, with nothing skipped.

    This is what the `false` in `setval(seq, ..., false)` is for. Without it,
    `setval` marks the value as already handed out and the next `nextval` returns
    one more, so a repair run on every boot would burn an id per table per boot,
    forever. Worth a test because the id is otherwise invisible: nothing breaks,
    the numbers just grow.
    """
    for name in ("Banco", "Efectivo", "Billetera virtual"):
        session.add(Account(name=name, initial_balance=0))
    session.commit()

    sync_sequences(session)

    session.add(Account(name="Nueva", initial_balance=0))
    session.commit()

    ids = sorted(session.scalars(select(Account.id)).all())
    assert ids == [1, 2, 3, 4], ids


def test_the_repair_covers_every_table_not_just_accounts(session):
    """The bug was not accounts-specific, and the symptom differs per table.

    Categories have a unique constraint on the name, so a stale sequence there can
    surface as either of two errors depending on which id lands. Transactions,
    budgets, goals, installments and recurrings are all numbered the same way.
    """
    for name in ("Uno", "Dos"):
        session.add(Category(name=name, type="EXPENSE", color="#ffffff"))
    for name in ("Banco", "Efectivo"):
        session.add(Account(name=name, initial_balance=0))
    session.commit()

    for tabla in ("accounts", "categories"):
        _break_sequence(session, tabla)

    sync_sequences(session)

    for tabla in ("accounts", "categories"):
        assert _last_value(session, tabla) >= 2, tabla

    # And both are actually writable again.
    session.add(Account(name="Nueva", initial_balance=0))
    session.add(Category(name="Tres", type="EXPENSE", color="#ffffff"))
    session.commit()


def test_the_repair_is_idempotent(session):
    """Startup runs on every boot, so the second call has to be a no-op.

    Not a theoretical concern: Render restarts the service often, and a repair
    that consumed sequence values on each boot would waste ids forever.
    """
    session.add(Account(name="Efectivo", initial_balance=0))
    session.commit()

    sync_sequences(session)
    primero = _last_value(session, "accounts")
    sync_sequences(session)
    sync_sequences(session)

    assert _last_value(session, "accounts") == primero


def test_the_repair_handles_an_empty_table(session):
    """A brand new database has no rows, and the sequence still has to be usable."""
    assert session.scalar(select(func.count(Account.id))) == 0

    sync_sequences(session)

    session.add(Account(name="Efectivo", initial_balance=0))
    session.commit()
    assert session.scalar(select(func.count(Account.id))) == 1


def test_the_repair_runs_before_the_defaults_seed(monkeypatch, app_on_test_schema):
    """The ordering is what keeps the API booting.

    `seed_defaults` inserts too, so with a stale sequence the boot itself would
    raise and the app would not come up at all.
    """
    from app import main

    order: list[str] = []
    monkeypatch.setattr(main, "sync_sequences", lambda db: order.append("sync"))
    monkeypatch.setattr(main, "seed_defaults", lambda db, **kw: order.append("seed"))

    with TestClient(app):
        pass

    assert order == ["sync", "seed"], order


def test_a_failure_in_the_repair_does_not_stop_the_api_from_starting(
    monkeypatch, app_on_test_schema
):
    """Not being able to fix the sequence is the state the app was in before.

    Starting anyway leaves the old behaviour and a line in the log. Refusing to
    boot would leave no app at all, which is worse than the bug being unfixed.
    """
    from app import main

    seeded: list[bool] = []

    def boom(db):
        raise RuntimeError("sequence out of sync")

    monkeypatch.setattr(main, "sync_sequences", boom)
    monkeypatch.setattr(main, "seed_defaults", lambda db, **kw: seeded.append(True))

    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200

    assert seeded == [True]


def test_the_api_reports_postgres_as_its_storage(client):
    """Settings shows this to the user, and there is only one answer now."""
    assert client.get("/api/session").json()["storage"] == "postgresql"


