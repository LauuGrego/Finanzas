from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import text

from tests.conftest import expense, fund


def _month_ago(day: int) -> str:
    return (date.today().replace(day=1) - timedelta(days=day)).isoformat()


def test_balance_uses_initial_balance_plus_movements(client, seed):
    client.post("/api/transactions", json=expense(seed, 25000))
    client.post("/api/transactions", json=expense(seed, 15000, description="Netflix"))

    accounts = client.get("/api/accounts").json()
    bank = next(a for a in accounts["accounts"] if a["name"] == "Banco")

    # 100000 initial - 25000 - 15000
    assert bank["balance"] == 60000
    assert accounts["total_balance"] == 60000


def test_increases_and_decreases_balance(client, seed):
    payload = expense(seed, 100000)
    payload.update(category_id=seed["salary"]["id"], type="INCOME")
    client.post("/api/transactions", json=payload)

    accounts = client.get("/api/accounts").json()
    assert accounts["total_balance"] == 200000


def test_monthly_summary(client, seed):
    client.post("/api/transactions", json=expense(seed, 25000))
    client.post("/api/transactions", json=expense(seed, 10000))
    income = expense(seed, 100000)
    income.update(category_id=seed["salary"]["id"], type="INCOME")
    client.post("/api/transactions", json=income)
    # A previous month that must not be counted.
    client.post("/api/transactions", json=expense(seed, 99999, date=_month_ago(5)))

    month = date.today().strftime("%Y-%m")
    summary = client.get(f"/api/transactions?month={month}").json()
    assert summary["total"] == 3

    dashboard = client.get(f"/api/dashboard?month={month}").json()
    # The seed account's 100000 starting balance counts as income of its month, on
    # top of the 100000 salary: without it the month would report 100000 income
    # next to an available balance that includes the starting money, and the two
    # could not be reconciled.
    assert dashboard["month_summary"]["income"] == 200000
    assert dashboard["month_summary"]["expense"] == 35000
    assert dashboard["month_summary"]["balance"] == 165000
    # The available balance is all-time, so it also includes last month's 99999:
    # 100000 initial + 100000 income - 35000 - 99999
    assert dashboard["available_balance"] == 65001


def test_expenses_by_category(client, seed):
    client.post("/api/transactions", json=expense(seed, 20000, description="Supermercado"))
    client.post("/api/transactions", json=expense(seed, 30000, description="Restaurante"))
    other = next(
        c for c in client.get("/api/categories").json() if c["name"] == "Transporte"
    )
    client.post("/api/transactions", json=expense(seed, 50000, category_id=other["id"]))

    month = date.today().strftime("%Y-%m")
    dashboard = client.get(f"/api/dashboard?month={month}").json()
    totals = {c["category_name"]: c["total"] for c in dashboard["expenses_by_category"]}

    assert totals == {"Transporte": 50000, "Comida": 50000}
    # Sorted from highest to lowest, so the first one is the biggest.
    assert dashboard["expenses_by_category"][0]["percentage"] == 50.0


def test_income_and_expense_in_the_same_period_are_counted_separately(client, seed):
    """Regression: an aggregate without GROUP BY merges every row into one, so an
    income could be reported as an expense (or dropped entirely)."""
    income = expense(seed, 100000)
    income.update(category_id=seed["salary"]["id"], type="INCOME", description="Sueldo")
    client.post("/api/transactions", json=income)
    client.post("/api/transactions", json=expense(seed, 25000, description="Supermercado"))

    month = date.today().strftime("%Y-%m")
    dashboard = client.get(f"/api/dashboard?month={month}").json()
    assert dashboard["month_summary"]["income"] == 200000
    assert dashboard["month_summary"]["expense"] == 25000

    accounts = client.get("/api/accounts").json()
    bank = next(a for a in accounts["accounts"] if a["name"] == "Banco")
    # 100000 initial + 100000 income - 25000 expense
    assert bank["balance"] == 175000


def test_daily_balance(client, seed):
    today = date.today().isoformat()
    client.post("/api/transactions", json=expense(seed, 25000, date=today))
    income = expense(seed, 100000, date=today)
    income.update(category_id=seed["salary"]["id"], type="INCOME")
    client.post("/api/transactions", json=income)

    day = client.get(f"/api/calendar/day?day={today}").json()
    assert day["summary"]["income"] == 100000
    assert day["summary"]["expense"] == 25000
    assert day["summary"]["balance"] == 75000
    assert len(day["transactions"]) == 2


def test_monthly_comparison(client, seed):
    client.post("/api/transactions", json=expense(seed, 25000))
    previous = client.post(
        "/api/transactions", json=expense(seed, 10000, date=_month_ago(5))
    )
    assert previous.status_code == 201

    rows = client.get("/api/reports/monthly?months=2").json()
    assert len(rows) == 2
    assert rows[-1]["expense"] == 25000
    assert rows[0]["expense"] == 10000


def test_the_balance_evolution_counts_the_starting_balance_only_once(client, seed):
    """The running balance must not add the same starting balance twice.

    It arrives through two doors: as the seed of the running total and as income
    of the month the account was created. Counting it in both is what a naive
    implementation does, and the curve ends up double the real money.
    """
    client.post("/api/transactions", json=expense(seed, 25000))

    rows = client.get("/api/reports/balance-evolution?months=2").json()
    assert len(rows) == 2

    # 100000 initial - 25000 spent. The earlier month was 100000 too, so a double
    # count would end at 249999 instead of 75000.
    assert rows[-1]["balance"] == 75000
    assert rows[-1]["balance"] == client.get("/api/accounts").json()["total_balance"]


def test_a_starting_balance_from_before_the_window_is_not_counted_twice(
    client, seed, session
):
    """The same trap, in the shape that actually triggers it.

    The previous test cannot catch this: its account is created today, so it lands
    inside the window and only ever goes through one of the two doors. A balance
    that predates the window is the case where both are open at once — the seed of
    the running total reaches for it, and so does the summary of everything before
    the window.
    """
    # Two months back, so it is outside the two-month window the chart asks for.
    old = datetime.combine(date.today().replace(day=1) - timedelta(days=60), time(12, 0))
    session.execute(
        text("update accounts set created_at = :when where id = :id"),
        {"when": old, "id": seed["bank"]["id"]},
    )
    session.commit()
    client.post("/api/transactions", json=expense(seed, 25000))

    rows = client.get("/api/reports/balance-evolution?months=2").json()

    # The curve has to land on the real balance. Counting the 100000 twice would
    # put it at 175000 and the two figures would agree with nothing.
    assert rows[-1]["balance"] == 75000
    assert rows[-1]["balance"] == client.get("/api/accounts").json()["total_balance"]

    # And the balance of that earlier month has to be the 100000 it really was,
    # not 200000.
    assert rows[0]["balance"] == 100000


def test_the_starting_balance_belongs_to_the_month_the_account_was_created(client, seed):
    """It counts in the creation month and not in every month on request."""
    month = date.today().strftime("%Y-%m")
    assert client.get(f"/api/dashboard?month={month}").json()["month_summary"]["income"] == 100000

    # The account was created today, so an earlier month must not carry it. If it
    # did, every month in every report would inherit today's money.
    previous = (date.today().replace(day=1) - timedelta(days=5)).strftime("%Y-%m")
    assert client.get(f"/api/dashboard?month={previous}").json()["month_summary"]["income"] == 0


def test_the_starting_balance_is_invisible_on_a_single_day(client, seed):
    """A starting balance did not arrive on any one day.

    Counting it on the creation day would paint the agenda with a big income and
    an empty list of movements to explain it.
    """
    day = client.get(f"/api/calendar/day?day={date.today().isoformat()}").json()
    assert day["summary"]["income"] == 0
    assert day["transactions"] == []


def test_filter_by_category_and_account(client, seed):
    fund(client, seed["wallet"]["id"], 50000)
    client.post("/api/transactions", json=expense(seed, 20000))
    client.post("/api/transactions", json=expense(seed, 30000, account_id=seed["wallet"]["id"]))

    by_category = client.get(f"/api/transactions?category_id={seed['food']['id']}").json()
    assert by_category["total"] == 2

    by_account = client.get(f"/api/transactions?account_id={seed['wallet']['id']}").json()
    assert by_account["total"] == 1
    assert by_account["items"][0]["account_name"] == "Mercado Pago"


def test_search_by_description(client, seed):
    client.post("/api/transactions", json=expense(seed, 20000, description="Supermercado"))
    client.post("/api/transactions", json=expense(seed, 30000, description="Cine"))

    found = client.get("/api/transactions?search=super").json()
    assert found["total"] == 1
    assert found["items"][0]["description"] == "Supermercado"


def test_pagination(client, seed):
    for amount in range(1000, 6000, 1000):
        client.post("/api/transactions", json=expense(seed, amount))

    page = client.get("/api/transactions?limit=2&offset=0").json()
    assert page["total"] == 5
    assert len(page["items"]) == 2

    second = client.get("/api/transactions?limit=2&offset=2").json()
    assert len(second["items"]) == 2
    assert page["items"][0]["id"] != second["items"][0]["id"]
