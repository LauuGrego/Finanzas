from __future__ import annotations

from datetime import date

import pytest

from tests.conftest import expense


def test_create_expense(client, seed):
    response = client.post("/api/transactions", json=expense(seed, 25000))
    assert response.status_code == 201

    body = response.json()
    assert body["amount"] == 25000
    assert body["type"] == "EXPENSE"
    assert body["category"]["name"] == "Comida"
    assert body["account_name"] == "Banco"
    # Expenses are negative when signed.
    assert body["signed_amount"] == -25000


def test_create_income(client, seed):
    payload = expense(seed, 100000)
    payload.update(category_id=seed["salary"]["id"], type="INCOME", description="Sueldo")
    response = client.post("/api/transactions", json=payload)

    assert response.status_code == 201
    assert response.json()["signed_amount"] == 100000


def test_amount_must_be_positive(client, seed):
    assert client.post("/api/transactions", json=expense(seed, -100)).status_code == 422
    assert client.post("/api/transactions", json=expense(seed, 0)).status_code == 422


def test_category_type_must_match(client, seed):
    payload = expense(seed, 1000, category_id=seed["salary"]["id"])
    response = client.post("/api/transactions", json=payload)
    assert response.status_code == 422
    assert "tipo" in response.json()["detail"].lower()


def test_unknown_account_is_rejected(client, seed):
    assert client.post("/api/transactions", json=expense(seed, 1000, account_id=9999)).status_code == 404


def test_edit_transaction(client, seed):
    created = client.post("/api/transactions", json=expense(seed, 25000)).json()
    response = client.put(f"/api/transactions/{created['id']}", json={"amount": 30000})

    assert response.status_code == 200
    assert response.json()["amount"] == 30000


def test_delete_transaction(client, seed):
    created = client.post("/api/transactions", json=expense(seed, 25000)).json()
    assert client.delete(f"/api/transactions/{created['id']}").status_code == 204
    assert client.get(f"/api/transactions/{created['id']}").status_code == 404


def test_transfer_creates_two_linked_movements(client, seed):
    response = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 50000,
            "date": seed["today"],
        },
    )
    assert response.status_code == 201

    body = response.json()
    assert len(body["movements"]) == 2
    assert body["transfer_id"]

    out, income = body["movements"]
    assert out["type"] == "EXPENSE" and out["account_id"] == seed["bank"]["id"]
    assert income["type"] == "INCOME" and income["account_id"] == seed["wallet"]["id"]
    # Transfers never get a category: moving money is not spending it.
    assert out["category_id"] is None and income["category_id"] is None

    accounts = client.get("/api/accounts").json()
    balances = {a["name"]: a["balance"] for a in accounts["accounts"]}
    assert balances["Banco"] == 50000
    assert balances["Mercado Pago"] == 50000
    # Moving money between your own accounts must not change the total.
    assert accounts["total_balance"] == 100000


def test_transfer_to_same_account_is_rejected(client, seed):
    response = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["bank"]["id"],
            "amount": 1000,
            "date": seed["today"],
        },
    )
    assert response.status_code == 422


def test_transfer_movements_cannot_be_edited_individually(client, seed):
    created = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 50000,
            "date": seed["today"],
        },
    ).json()

    assert client.put(f"/api/transactions/{created['movements'][0]['id']}", json={"amount": 1}).status_code == 422
    assert client.delete(f"/api/transactions/{created['movements'][0]['id']}").status_code == 422


def test_a_transfer_is_not_spending(client, seed):
    """A transfer must not inflate the month's expenses or appear in the category chart."""
    client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 50000,
            "date": seed["today"],
        },
    )
    client.post("/api/transactions", json=expense(seed, 12500))

    month = date.today().strftime("%Y-%m")
    dashboard = client.get(f"/api/dashboard?month={month}").json()

    # Only the 12500 grocery counts as spending.
    assert dashboard["month_summary"]["expense"] == 12500
    assert dashboard["month_summary"]["income"] == 0
    # Transfers leave the overall total untouched: 100000 - 12500.
    assert dashboard["available_balance"] == 87500

    categories = dashboard["expenses_by_category"]
    assert len(categories) == 1
    assert categories[0]["category_name"] == "Comida"
    assert categories[0]["total"] == 12500

    # The same applies to the daily view...
    day = client.get(f"/api/calendar/day?day={seed['today']}").json()
    assert day["summary"]["expense"] == 12500
    # ...but the movements themselves are still listed.
    assert len(day["transactions"]) == 3
