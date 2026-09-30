from __future__ import annotations

from tests.conftest import fund


def test_create_account_with_initial_balance(client):
    response = client.post(
        "/api/accounts", json={"name": "Banco", "type": "BANK", "initial_balance": 500000}
    )
    assert response.status_code == 201
    assert response.json()["balance"] == 500000


def test_duplicate_account_name_is_rejected(client, seed):
    assert client.post("/api/accounts", json={"name": "Banco"}).status_code == 409


def test_update_account(client, seed):
    response = client.put(f"/api/accounts/{seed['bank']['id']}", json={"name": "Cuenta Principal"})
    assert response.status_code == 200
    assert response.json()["name"] == "Cuenta Principal"


def test_deleting_an_account_keeps_the_history(client, seed):
    fund(client, seed["wallet"]["id"], 20000)
    transaction = client.post("/api/transactions", json={
        "account_id": seed["wallet"]["id"],
        "category_id": seed["food"]["id"],
        "type": "EXPENSE",
        "amount": 5000,
        "date": seed["today"],
    }).json()

    assert client.delete(f"/api/accounts/{seed['wallet']['id']}").status_code == 204
    # Gone from the default listing...
    assert all(a["id"] != seed["wallet"]["id"] for a in client.get("/api/accounts").json()["accounts"])
    # ...but the movement is still readable.
    assert client.get(f"/api/transactions/{transaction['id']}").status_code == 200
    # ...and it can be brought back.
    assert client.get("/api/accounts?include_inactive=true").json()["accounts"]


def test_cannot_use_a_deactivated_account(client, seed):
    client.delete(f"/api/accounts/{seed['bank']['id']}")
    response = client.post("/api/transactions", json={
        "account_id": seed["bank"]["id"],
        "category_id": seed["food"]["id"],
        "type": "EXPENSE",
        "amount": 1000,
        "date": seed["today"],
    })
    assert response.status_code == 422
    assert "baja" in response.json()["detail"]


def test_categories_are_seeded_on_startup(client):
    names = {c["name"] for c in client.get("/api/categories").json()}
    assert {"Comida", "Transporte", "Servicios", "Sueldo", "Freelance"} <= names


def test_filter_categories_by_type(client):
    expenses = client.get("/api/categories?type=EXPENSE").json()
    incomes = client.get("/api/categories?type=INCOME").json()

    assert all(c["type"] == "EXPENSE" for c in expenses)
    assert all(c["type"] == "INCOME" for c in incomes)


def test_deactivated_category_is_hidden_but_keeps_transactions(client, seed):
    transaction = client.post("/api/transactions", json={
        "account_id": seed["bank"]["id"],
        "category_id": seed["food"]["id"],
        "type": "EXPENSE",
        "amount": 5000,
        "date": seed["today"],
    }).json()

    assert client.delete(f"/api/categories/{seed['food']['id']}").status_code == 204
    assert all(c["id"] != seed["food"]["id"] for c in client.get("/api/categories").json())

    stored = client.get(f"/api/transactions/{transaction['id']}").json()
    assert stored["category"]["name"] == "Comida"
