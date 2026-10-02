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
    """Editar no: se cambia el monto de una pata sola y la otra se queda vieja.

    Borrar una transferencia sí se puede, y va entera. Eso está en la sección
    de "Revertir" más abajo.
    """
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
    # No income movement was created, but the seed account's starting balance is
    # income of its month.
    assert dashboard["month_summary"]["income"] == 100000
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


# --------------------------------------------------------------------------- #
# Revertir
# --------------------------------------------------------------------------- #
# Una transferencia mal hecha tiene que poder deshacerse: son dos movimientos
# y la persona solo ve una fila en la lista.


def test_deleting_one_leg_of_a_transfer_deletes_both(client, seed):
    """Borrar media transferencia hace que la plata aparezca de la nada."""
    out, income = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 50000,
            "date": seed["today"],
        },
    ).json()["movements"]

    assert client.delete(f"/api/transactions/{out['id']}").status_code == 204

    # No queda ni la pata que se pidio borrar ni la otra.
    assert client.get(f"/api/transactions/{out['id']}").status_code == 404
    assert client.get(f"/api/transactions/{income['id']}").status_code == 404
    assert client.get("/api/transactions").json()["total"] == 0


def test_it_works_the_same_from_either_leg(client, seed):
    """La pata de entrada tambien arrastra a la de salida: es la misma fila vista al reves."""
    out, income = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 50000,
            "date": seed["today"],
        },
    ).json()["movements"]

    assert client.delete(f"/api/transactions/{income['id']}").status_code == 204
    assert client.get(f"/api/transactions/{out['id']}").status_code == 404
    assert client.get("/api/transactions").json()["total"] == 0


def test_reverting_a_transfer_puts_the_money_back_where_it_was(client, seed):
    """Deshacer una transferencia tiene que dejar los saldos como estaban.

    Es lo que hace util el boton: si al borrar quedara la plata en el aire, el
    arreglo seria volver a cargar la misma transferencia a mano.
    """
    def balances():
        return {
            a["name"]: a["balance"] for a in client.get("/api/accounts").json()["accounts"]
        }

    before = balances()
    out, _income = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 50000,
            "date": seed["today"],
        },
    ).json()["movements"]

    # La plata se movio de verdad.
    assert balances() == {**before, "Banco": 50000, "Mercado Pago": 50000}

    client.delete(f"/api/transactions/{out['id']}")

    assert balances() == before


def test_a_transfer_cannot_be_edited_but_can_be_redone(client, seed):
    """Editar media transferencia tampoco se puede: se borra y se rehace."""
    out, _income = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 50000,
            "date": seed["today"],
        },
    ).json()["movements"]

    response = client.put(f"/api/transactions/{out['id']}", json={"amount": 1})
    assert response.status_code == 422
    # El mensaje dice lo que hay que hacer, no manda a un endpoint inexistente.
    assert "borrala" in response.json()["detail"].lower()
    # Y la transferencia quedo como estaba, no a medias.
    assert client.get(f"/api/transactions/{out['id']}").json()["amount"] == 50000


def test_deleting_a_plain_movement_still_only_deletes_that_one(client, seed):
    """El caso normal no se entera de que existe el camino de las transferencias."""
    kept = client.post("/api/transactions", json=expense(seed, 1000)).json()
    removed = client.post("/api/transactions", json=expense(seed, 2000)).json()

    assert client.delete(f"/api/transactions/{removed['id']}").status_code == 204
    assert client.get(f"/api/transactions/{kept['id']}").status_code == 200
    assert client.get("/api/transactions").json()["total"] == 1


def test_deleting_a_movement_that_is_not_there_is_a_404(client, seed):
    assert client.delete("/api/transactions/999999").status_code == 404


# --------------------------------------------------------------------------- #
# No gastar más de lo que hay
# --------------------------------------------------------------------------- #
# The `seed` fixture leaves Banco with 100000 and Mercado Pago with 0, which is
# enough to tell "the account is empty" apart from "the account cannot cover
# this".


def test_an_expense_cannot_exceed_the_balance(client, seed):
    response = client.post("/api/transactions", json=expense(seed, 100001))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "suficiente" in detail
    # The message has to name the account and say how much is actually there,
    # in the same es-AR shape the rest of the app prints.
    assert "Banco" in detail and "100.000,00" in detail and "100.001,00" in detail


def test_an_expense_can_use_the_whole_balance(client, seed):
    """The check is `amount > available`, so spending it all is allowed."""
    assert client.post("/api/transactions", json=expense(seed, 100000)).status_code == 201

    accounts = client.get("/api/accounts").json()
    assert next(a for a in accounts["accounts"] if a["name"] == "Banco")["balance"] == 0


def test_income_is_never_blocked(client, seed):
    """Only money leaving the account is limited; money coming in always fits."""
    payload = expense(seed, 99999999, category_id=seed["salary"]["id"], type="INCOME")
    assert client.post("/api/transactions", json=payload).status_code == 201


def test_a_credit_account_is_allowed_to_go_negative(client, seed):
    """A negative balance on a credit card is the debt, not a mistake."""
    card = client.post(
        "/api/accounts", json={"name": "Tarjeta", "type": "CREDIT", "initial_balance": 0}
    ).json()

    assert client.post("/api/transactions", json=expense(seed, 50000, account_id=card["id"])).status_code == 201

    accounts = client.get("/api/accounts").json()
    assert next(a for a in accounts["accounts"] if a["name"] == "Tarjeta")["balance"] == -50000


def test_a_transfer_cannot_exceed_the_source_balance(client, seed):
    response = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 100001,
            "date": seed["today"],
        },
    )

    assert response.status_code == 422
    assert "suficiente" in response.json()["detail"]
    # Nothing was written: a rejected transfer leaves no half of itself behind.
    assert client.get("/api/transactions").json()["total"] == 0


def test_a_transfer_can_empty_the_source_account(client, seed):
    response = client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 100000,
            "date": seed["today"],
        },
    )
    assert response.status_code == 201

    accounts = client.get("/api/accounts").json()
    balances = {a["name"]: a["balance"] for a in accounts["accounts"]}
    assert balances["Banco"] == 0
    assert balances["Mercado Pago"] == 100000


def test_editing_an_expense_without_touching_the_amount_is_not_blocked(client, seed):
    """The balance already has this expense subtracted from it.

    Comparing the new amount against the balance as it stands would block every
    edit, even one that changes nothing. This is the case that the refund of the
    movement's own amount exists for.
    """
    created = client.post("/api/transactions", json=expense(seed, 25000)).json()

    assert client.put(f"/api/transactions/{created['id']}", json={"amount": 25000}).status_code == 200
    assert client.put(f"/api/transactions/{created['id']}", json={"description": "Otro"}).status_code == 200


def test_raising_an_expense_beyond_the_balance_is_blocked(client, seed):
    """Editing an expense may not leave the account negative.

    The account holds 100000 and the expense is 25000, so raising it to exactly
    100000 leaves the balance at zero and is fine, while 100001 would take it
    below zero. The comparison is against `balance + the movement's own amount`,
    which is why the limit is the original balance and not what is left after it.
    """
    created = client.post("/api/transactions", json=expense(seed, 25000)).json()
    url = f"/api/transactions/{created['id']}"

    assert client.put(url, json={"amount": 100000}).status_code == 200
    assert client.put(url, json={"amount": 100001}).status_code == 422

    accounts = client.get("/api/accounts").json()
    assert next(a for a in accounts["accounts"] if a["name"] == "Banco")["balance"] == 0


def test_moving_an_expense_checks_the_account_it_moves_to(client, seed):
    """The balance that matters is the destination's, and the expense does not
    live there yet, so nothing is refunded into the comparison."""
    created = client.post("/api/transactions", json=expense(seed, 25000)).json()

    # Mercado Pago is empty and it is not a credit account.
    response = client.put(
        f"/api/transactions/{created['id']}", json={"account_id": seed["wallet"]["id"]}
    )
    assert response.status_code == 422
    assert "suficiente" in response.json()["detail"]
