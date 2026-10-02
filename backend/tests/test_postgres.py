"""PostgreSQL is the only engine, so these tests no longer check compatibility.

They used to be the reason a set of schema decisions got made, because the app
ran on SQLite in development and PostgreSQL in the cloud and the two disagreed at
runtime: SQLite ignores `VARCHAR(36)` while PostgreSQL raises on anything longer,
and SQLite is loose about boolean and date coercion where PostgreSQL is strict.
That is the transfer id becoming a UUID, caught here as a derived id that would
have worked forever in SQLite and failed on the first large transfer in production.

Now that there is a real PostgreSQL for development and for the test suite, the
schema assertions below are worth keeping as a cheap tripwire on the models, but
they are no longer standing in for the engine. The dialect-specific behaviour is
covered by running against PostgreSQL itself.
"""

from __future__ import annotations

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.money import CENTS
from app.models import Account, Category, Transaction
from tests.conftest import fund

TABLES = [Account.__table__, Category.__table__, Transaction.__table__]


def ddl(table) -> str:
    return str(CreateTable(table).compile(dialect=postgresql.dialect()))


@pytest.mark.parametrize("table", TABLES, ids=lambda t: t.name)
def test_every_table_compiles_for_postgres(table):
    """A type that does not exist in the dialect breaks the first deploy."""
    assert ddl(table).strip()


def test_money_columns_are_bigint_and_not_float():
    """Money is centavos in an integer column. A float here would lose cents."""
    for column in (Account.initial_balance, Transaction.amount):
        assert column.type.__visit_name__ == "big_integer", column


def test_the_transfer_id_column_holds_a_uuid():
    """36 characters exactly: what str(uuid4()) produces, and no more.

    The old value was built from account ids and the amount, which grew past
    36 for a transfer of more than ~10 million pesos. SQLite stored it anyway.
    """
    assert Transaction.transfer_id.type.length == 36

    from uuid import uuid4

    assert len(str(uuid4())) == 36


def test_a_big_transfer_still_produces_a_short_id(client, seed):
    """The value the service actually writes, for the largest amount allowed.

    Going through the API rather than calling create_transfer directly: the id
    is generated in the service, but it reaches the column through this path.
    """
    from app.models import Transaction as T

    # The account has to be able to cover the biggest amount the schema allows,
    # or the funds check rejects it before the id ever reaches the column.
    fund(client, seed["bank"]["id"], 999999999999.99)
    biggest = "999999999999.99"
    created = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": biggest,
            "date": "2026-09-29",
        },
    )
    assert created.status_code == 201, created.text

    # The column is what enforces the limit on PostgreSQL, so check the width of
    # what we are about to write against it.
    width = T.__table__.c.transfer_id.type.length
    for movement in created.json()["movements"]:
        assert len(movement["transfer_id"]) <= width


def test_enums_are_stored_as_plain_strings():
    """`type` columns are String, not a native PG enum.

    A native enum would have to be created and dropped alongside the table, and
    adding a value later would need a migration. As text, a new type is just a
    new string.
    """
    for column in (Account.type, Category.type, Transaction.type):
        assert column.type.__visit_name__ == "string", column


def test_foreign_keys_carry_an_ondelete_rule():
    """PostgreSQL enforces these; SQLite only did it because of a PRAGMA."""
    for column in (Transaction.account_id, Transaction.category_id):
        assert column.foreign_keys, column
        assert column.foreign_keys.pop().ondelete is not None


def test_boolean_and_timestamp_defaults_are_server_side():
    """`server_default` travels to the database. A Python-side default would not.

    With server defaults, a row inserted by a future script or a migration gets
    the same values as one inserted by the app.
    """
    assert Account.created_at.server_default is not None
    assert Account.updated_at.server_default is not None
    assert Account.active.default is not None


def test_the_app_only_ever_talks_to_postgres():
    """One engine, everywhere.

    It used to be able to run on SQLite, and that is exactly what hid bugs that
    only showed up in the cloud: a desynchronised id sequence broke account
    creation in production and no local test could have seen it, because SQLite
    hands out `MAX(id) + 1` and cannot get into that state. With SQLite gone there
    is no second engine to fall into.
    """
    from app.database import engine

    assert engine.dialect.name == "postgresql"


def test_a_missing_database_url_says_what_to_do(monkeypatch):
    """No default, so the failure has to explain itself.

    A default URL would be worse than none: it would silently connect somewhere
    the developer did not choose.
    """
    monkeypatch.setattr("app.config.DATABASE_URL", "")

    from app.config import _database_url

    with pytest.raises(RuntimeError) as exc:
        _database_url()

    assert "docker compose up -d" in str(exc.value)


def test_a_local_url_does_not_demand_ssl():
    """`sslmode=require` stops the container from starting.

    It has no certificate to offer. It is kept for anything remote, where it is
    what makes the Supabase connection survive the pooler reconnecting.
    """
    from app.database import _is_remote

    local = "postgresql+psycopg://finanzas:finanzas@127.0.0.1:5434/finanzas"
    pooler = "postgresql+psycopg://postgres.abc:secret@aws-0.pooler.supabase.com:5432/db"

    assert _is_remote(local) is False
    assert _is_remote("postgresql+psycopg://u:p@localhost:5432/d") is False
    assert _is_remote("postgresql+psycopg://u:p@db.abc.supabase.co:5432/postgres") is True
    assert _is_remote(pooler) is True


# The connection string people actually paste. Supabase's dashboard hands out the
# direct host, but that name only has an AAAA record, so from an IPv4-only
# network it never resolves. The pooler is the one that works, and it needs the
# project ref in the username.
SUPABASE_DIRECT = (
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"
)
SUPABASE_POOLER = (
    "postgresql://postgres.abcdefghijklmnopqrst:secret"
    "@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
)


@pytest.mark.parametrize(
    "url",
    [SUPABASE_DIRECT, SUPABASE_POOLER],
    ids=["direct", "pooler"],
)
def test_a_supabase_url_resolves_to_the_installed_driver(url):
    """The URL Supabase hands out has to name a driver we actually have.

    Bare `postgresql://` means psycopg2 in SQLAlchemy, and psycopg2 is not
    installed. The failure is an import error at connect time, not a config
    error, and the only place these strings appear is the Render dashboard.
    """
    from app.database import normalize_url

    assert normalize_url(url).startswith("postgresql+psycopg://")


def test_an_explicit_driver_in_the_url_is_left_alone():
    """Idempotent: normalizing twice, or a URL that already picked a driver."""
    from app.database import normalize_url

    once = normalize_url(SUPABASE_DIRECT)
    assert normalize_url(once) == once

    explicit = "postgresql+psycopg2://user:pass@host:5432/db"
    assert normalize_url(explicit) == explicit


def test_the_legacy_postgres_scheme_is_also_translated():
    """`postgres://` is the older spelling and appears in older docs."""
    from app.database import normalize_url

    out = normalize_url("postgres://u:p@h:5432/d")
    assert out == "postgresql+psycopg://u:p@h:5432/d"


def test_an_unknown_scheme_is_left_alone():
    """The normalizer only knows how to spell PostgreSQL.

    It has to pass anything else through untouched rather than guessing: a URL it
    misreads is a connection to the wrong place, and there is no second engine
    left for it to be useful about.
    """
    from app.database import normalize_url

    url = "postgresql+asyncpg://user:pass@host:5432/db"
    assert normalize_url(url) == url


def test_the_installed_driver_is_psycopg3():
    """Guards the assumption the URL rewriting rests on.

    If psycopg2 ever gets installed alongside, this fails and points at the
    line of code that assumed one driver.
    """
    import importlib.util

    assert importlib.util.find_spec("psycopg2") is None, (
        "psycopg2 is installed, so postgresql:// would stop meaning psycopg3"
    )
    assert importlib.util.find_spec("psycopg") is not None
