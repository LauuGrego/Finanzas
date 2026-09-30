from __future__ import annotations

from datetime import date, timedelta

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
    assert dashboard["month_summary"]["income"] == 100000
    assert dashboard["month_summary"]["expense"] == 35000
    assert dashboard["month_summary"]["balance"] == 65000
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
    assert dashboard["month_summary"]["income"] == 100000
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
