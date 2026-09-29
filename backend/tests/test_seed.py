"""The fresh-install seed: three money places and ten coloured categories."""

from __future__ import annotations

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.enums import enum_value
from app.main import seed_defaults
from app.models import Account, Category


def _fresh_db(path):
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(bind=engine)
    return engine


def test_a_new_install_starts_with_the_three_money_places(tmp_path):
    engine = _fresh_db(tmp_path / "fresh.db")
    try:
        with Session(engine) as db:
            seed_defaults(db)
            accounts = list(db.scalars(select(Account).order_by(Account.id)).all())

        assert [a.name for a in accounts] == ["Banco", "Billetera virtual", "Efectivo"]
        # SQLite hands back plain strings for enum columns, hence enum_value.
        assert [enum_value(a.type) for a in accounts] == ["BANK", "WALLET", "CASH"]
        # Whatever was there before the app existed is the user's to declare,
        # so the seed must not invent money.
        assert all(a.initial_balance == 0 for a in accounts)
    finally:
        engine.dispose()


def test_the_seed_runs_twice_without_duplicating(tmp_path):
    engine = _fresh_db(tmp_path / "twice.db")
    try:
        with Session(engine) as db:
            seed_defaults(db)
            seed_defaults(db)
            assert len(list(db.scalars(select(Account)).all())) == 3
            assert len(list(db.scalars(select(Category)).all())) == 10
    finally:
        engine.dispose()


def test_the_seed_does_not_resurrect_a_deleted_account(tmp_path):
    """Gating on a missing name would recreate an account on purpose."""
    engine = _fresh_db(tmp_path / "deleted.db")
    try:
        with Session(engine) as db:
            seed_defaults(db)
            cash = db.scalar(select(Account).where(Account.name == "Efectivo"))
            cash.active = False
            db.commit()

            seed_defaults(db)
            names = [a.name for a in db.scalars(select(Account)).all()]

        assert "Efectivo" in names
        assert not cash.active
    finally:
        engine.dispose()
