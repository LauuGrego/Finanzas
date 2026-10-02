"""The fresh-install seed: three money places and ten coloured categories."""

from __future__ import annotations

from sqlalchemy import select

from app.enums import enum_value
from app.main import seed_defaults
from app.models import Account, Category


def test_a_new_install_starts_with_the_three_money_places(session):
    seed_defaults(session)
    accounts = list(session.scalars(select(Account).order_by(Account.id)).all())

    assert [a.name for a in accounts] == ["Banco", "Billetera virtual", "Efectivo"]
    # Read through enum_value so the assertion does not care whether the column
    # comes back as a str or as the enum member.
    assert [enum_value(a.type) for a in accounts] == ["BANK", "WALLET", "CASH"]
    # Whatever was there before the app existed is the user's to declare,
    # so the seed must not invent money.
    assert all(a.initial_balance == 0 for a in accounts)


def test_the_seed_runs_twice_without_duplicating(session):
    seed_defaults(session)
    seed_defaults(session)
    assert len(list(session.scalars(select(Account)).all())) == 3
    assert len(list(session.scalars(select(Category)).all())) == 10


def test_the_seed_does_not_resurrect_a_deleted_account(session):
    """Gating on a missing name would recreate an account on purpose."""
    seed_defaults(session)
    cash = session.scalar(select(Account).where(Account.name == "Efectivo"))
    cash.active = False
    session.commit()

    seed_defaults(session)
    names = [a.name for a in session.scalars(select(Account)).all()]

    assert "Efectivo" in names
    assert not cash.active
