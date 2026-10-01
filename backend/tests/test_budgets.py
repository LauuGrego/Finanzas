from __future__ import annotations

from datetime import date

import pytest

from tests.conftest import fund


@pytest.fixture(autouse=True)
def _saldo(client, seed):
    """Dinero de sobra en la cuenta.

    Los presupuestos se miden sobre gastados grandes y la cuenta de la fixture
    arranca con 100.000: sin esto el control de saldo rechazaría los gastos
    antes de que llegaran a contarse, y el test probaría otra cosa.
    """
    fund(client, seed["bank"]["id"], 5_000_000)


def period_now() -> str:
    today = date.today()
    return f"{today.year:04d}-{today.month:02d}"


def shift_months(period: str, count: int) -> str:
    year, month = (int(part) for part in period.split("-"))
    index = year * 12 + (month - 1) + count
    return f"{index // 12:04d}-{(index % 12) + 1:02d}"


def budget_payload(seed, **overrides) -> dict:
    payload = {
        "category_id": seed["food"]["id"],
        "amount": 200000,
        "period": period_now(),
    }
    payload.update(overrides)
    return payload


def spend(client, seed, amount: float, **overrides) -> dict:
    response = client.post(
        "/api/transactions",
        json={
            "account_id": seed["bank"]["id"],
            "category_id": seed["food"]["id"],
            "type": "EXPENSE",
            "amount": amount,
            "description": "Supermercado",
            "date": seed["today"],
            **overrides,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- #
# Crear y listar
# --------------------------------------------------------------------------- #


def test_un_presupuesto_se_crea_y_aparece_en_la_lista(client, seed):
    created = client.post("/api/budgets", json=budget_payload(seed))
    assert created.status_code == 201, created.text
    body = created.json()

    assert body["created"] == 1
    assert body["skipped"] == 0
    item = body["items"][0]
    assert item["amount"] == 200000
    assert item["period"] == period_now()
    # Todavía no se gastó nada en el mes.
    assert item["spent"] == 0
    assert item["remaining"] == 200000
    assert item["percentage"] == 0.0
    assert item["over"] is False
    assert item["category"]["name"] == "Comida"

    listed = client.get("/api/budgets").json()
    assert listed["total"] == 1
    assert listed["summary"]["amount"] == 200000


def test_el_gastado_sale_de_los_movimientos_del_mes(client, seed):
    client.post("/api/budgets", json=budget_payload(seed))
    spend(client, seed, 145000)

    listed = client.get("/api/budgets").json()
    item = listed["items"][0]
    assert item["spent"] == 145000
    assert item["remaining"] == 55000
    assert item["percentage"] == 72.5
    assert item["over"] is False


def test_un_gasto_de_otro_mes_no_cuenta(client, seed):
    client.post("/api/budgets", json=budget_payload(seed))
    # Un movimiento del mes pasado no debe alterar el presupuesto de este mes.
    last_month = shift_months(period_now(), -1)
    spend(client, seed, 90000, date=f"{last_month}-15")

    listed = client.get("/api/budgets").json()
    assert listed["items"][0]["spent"] == 0


def test_se_pasa_y_el_restante_queda_negativo(client, seed):
    client.post("/api/budgets", json=budget_payload(seed))
    spend(client, seed, 250000)

    item = client.get("/api/budgets").json()["items"][0]
    assert item["spent"] == 250000
    assert item["remaining"] == -50000
    assert item["over"] is True
    assert item["percentage"] == 125.0


def test_un_ingreso_nunca_cuenta_como_gastado(client, seed):
    """El filtro es por tipo, no por categoría: un ingreso no libera presupuesto."""
    client.post("/api/budgets", json=budget_payload(seed, category_id=seed["salary"]["id"]))
    client.post(
        "/api/transactions",
        json={
            "account_id": seed["bank"]["id"],
            "category_id": seed["salary"]["id"],
            "type": "INCOME",
            "amount": 500000,
            "description": "Sueldo",
            "date": seed["today"],
        },
    )

    item = client.get("/api/budgets").json()["items"][0]
    assert item["spent"] == 0
    assert item["over"] is False


def test_una_transferencia_no_cuenta(client, seed):
    fund(client, seed["wallet"]["id"], 500000)
    client.post("/api/budgets", json=budget_payload(seed))
    client.post(
        "/api/transfers",
        json={
            "from_account_id": seed["bank"]["id"],
            "to_account_id": seed["wallet"]["id"],
            "amount": 100000,
            "date": seed["today"],
        },
    )

    assert client.get("/api/budgets").json()["items"][0]["spent"] == 0


# --------------------------------------------------------------------------- #
# Repetir
# --------------------------------------------------------------------------- #


def test_repetir_crea_un_presupuesto_por_mes(client, seed):
    created = client.post("/api/budgets", json=budget_payload(seed, repeat_months=12))
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["created"] == 12
    assert body["skipped"] == 0

    periods = [item["period"] for item in body["items"]]
    assert periods == [shift_months(period_now(), offset) for offset in range(12)]
    assert periods[11][:4] == period_now()[:4] or periods[11][:4] != ""

    # Solo el mes actual aparece en la lista del mes actual.
    assert client.get("/api/budgets").json()["total"] == 1
    assert client.get("/api/budgets", params={"period": periods[3]}).json()["total"] == 1


def test_repetir_saltea_los_meses_que_ya_existen(client, seed):
    """El mes que se está mirando manda; los siguientes se completan."""
    next_month = shift_months(period_now(), 1)
    client.post("/api/budgets", json=budget_payload(seed, period=next_month))

    second = client.post("/api/budgets", json=budget_payload(seed, repeat_months=3))
    body = second.json()
    # El primero es el mes nuevo, el segundo ya existía y el tercero se crea.
    assert body["created"] == 2
    assert body["skipped"] == 1
    assert body["items"][0]["period"] == period_now()
    assert body["items"][0]["amount"] == 200000


def test_crear_dos_veces_el_mismo_mes_dice_que_ya_existe(client, seed):
    """Preferible a un "listo" que no creó nada."""
    client.post("/api/budgets", json=budget_payload(seed))
    again = client.post("/api/budgets", json=budget_payload(seed, amount=999000))

    assert again.status_code == 422
    detail = again.json()["detail"]
    assert "Comida ya tiene un presupuesto para este mes" in detail
    assert "editá la tarjeta" in detail
    # Y el monto original queda intacto.
    assert client.get("/api/budgets").json()["items"][0]["amount"] == 200000


def test_repetir_por_mas_de_veinticuatro_meses_se_rechaza(client, seed):
    response = client.post("/api/budgets", json=budget_payload(seed, repeat_months=25))
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# Editar y borrar
# --------------------------------------------------------------------------- #


def test_editar_cambia_el_monto_solo_de_ese_mes(client, seed):
    client.post("/api/budgets", json=budget_payload(seed, repeat_months=3))
    items = client.get("/api/budgets").json()["items"]
    first = items[0]

    updated = client.put(f"/api/budgets/{first['id']}", json={"amount": 250000})
    assert updated.status_code == 200, updated.text
    assert updated.json()["amount"] == 250000

    next_month = client.get(
        "/api/budgets", params={"period": shift_months(period_now(), 1)}
    ).json()["items"][0]
    assert next_month["amount"] == 200000


def test_editar_con_apply_forward_toca_los_meses_siguientes(client, seed):
    client.post("/api/budgets", json=budget_payload(seed, repeat_months=3))
    first = client.get("/api/budgets").json()["items"][0]

    updated = client.put(
        f"/api/budgets/{first['id']}", json={"amount": 250000, "apply_forward": True}
    )
    assert updated.json()["amount"] == 250000

    for offset in (1, 2):
        later = client.get(
            "/api/budgets", params={"period": shift_months(period_now(), offset)}
        ).json()["items"][0]
        assert later["amount"] == 250000


def test_apply_forward_no_toca_los_meses_anteriores(client, seed):
    """Editar septiembre hacia adelante no puede cambiar el histórico de agosto."""
    previous = shift_months(period_now(), -1)
    client.post("/api/budgets", json=budget_payload(seed, period=previous))
    client.post("/api/budgets", json=budget_payload(seed, repeat_months=3))

    first = client.get("/api/budgets").json()["items"][0]
    client.put(f"/api/budgets/{first['id']}", json={"amount": 250000, "apply_forward": True})

    past = client.get("/api/budgets", params={"period": previous}).json()["items"][0]
    assert past["amount"] == 200000


def test_borrar_saca_solo_ese_mes(client, seed):
    client.post("/api/budgets", json=budget_payload(seed, repeat_months=3))
    first = client.get("/api/budgets").json()["items"][0]

    removed = client.delete(f"/api/budgets/{first['id']}")
    assert removed.status_code == 204

    assert client.get("/api/budgets").json()["total"] == 0
    later = client.get(
        "/api/budgets", params={"period": shift_months(period_now(), 1)}
    ).json()
    assert later["total"] == 1


def test_el_resumen_suma_los_presupuestos_del_mes(client, seed):
    categories = {c["name"]: c for c in client.get("/api/categories").json()}
    client.post(
        "/api/budgets",
        json=budget_payload(seed, category_id=categories["Comida"]["id"], amount=200000),
    )
    client.post(
        "/api/budgets",
        json=budget_payload(seed, category_id=categories["Transporte"]["id"], amount=100000),
    )
    spend(client, seed, 250000)  # Comida: se pasa

    summary = client.get("/api/budgets").json()["summary"]
    assert summary["amount"] == 300000
    assert summary["spent"] == 250000
    assert summary["remaining"] == 50000
    assert summary["percentage"] == 83.3
    assert summary["count"] == 2
    assert summary["over_count"] == 1


def test_la_lista_pone_al_mas_gastado_arriba(client, seed):
    categories = {c["name"]: c for c in client.get("/api/categories").json()}
    client.post(
        "/api/budgets",
        json=budget_payload(seed, category_id=categories["Transporte"]["id"], amount=100000),
    )
    client.post(
        "/api/budgets",
        json=budget_payload(seed, category_id=categories["Comida"]["id"], amount=200000),
    )
    # Comida 40%, Transporte 90%: el que más se pasó va primero.
    spend(client, seed, 80000)
    spend(client, seed, 90000, category_id=categories["Transporte"]["id"])

    items = client.get("/api/budgets").json()["items"]
    assert [item["category"]["name"] for item in items] == ["Transporte", "Comida"]


# --------------------------------------------------------------------------- #
# El chequeo para el modal de movimiento
# --------------------------------------------------------------------------- #


def test_check_sin_presupuesto_no_es_un_error(client, seed):
    body = client.get("/api/budgets/check", params={"category_id": seed["food"]["id"]}).json()
    assert body["has_budget"] is False
    assert body["amount"] == 0
    assert body["percentage"] == 0


def test_check_devuelve_el_presupuesto_del_mes(client, seed):
    client.post("/api/budgets", json=budget_payload(seed))
    spend(client, seed, 145000)

    body = client.get(
        "/api/budgets/check",
        params={"category_id": seed["food"]["id"], "period": period_now()},
    ).json()
    assert body["has_budget"] is True
    assert body["amount"] == 200000
    assert body["spent"] == 145000
    assert body["remaining"] == 55000
    assert body["percentage"] == 72.5
    assert body["over"] is False
    assert body["category"]["name"] == "Comida"


def test_check_excluye_el_movimiento_que_se_esta_editando(client, seed):
    """Al editar, el movimiento que se está editando ya está en `spent`."""
    client.post("/api/budgets", json=budget_payload(seed))
    created = spend(client, seed, 145000)

    without = client.get(
        "/api/budgets/check",
        params={
            "category_id": seed["food"]["id"],
            "period": period_now(),
            "exclude_transaction_id": created["id"],
        },
    ).json()
    assert without["spent"] == 0

    with_it = client.get(
        "/api/budgets/check", params={"category_id": seed["food"]["id"]}
    ).json()
    assert with_it["spent"] == 145000


def test_check_marca_el_pasado(client, seed):
    client.post("/api/budgets", json=budget_payload(seed))
    spend(client, seed, 260000)

    body = client.get("/api/budgets/check", params={"category_id": seed["food"]["id"]}).json()
    assert body["over"] is True
    assert body["remaining"] == -60000


# --------------------------------------------------------------------------- #
# Errores
# --------------------------------------------------------------------------- #


def test_categoria_inexistente_se_rechaza(client, seed):
    response = client.post("/api/budgets", json=budget_payload(seed, category_id=9999))
    assert response.status_code == 422
    assert "no existe" in response.json()["detail"]


def test_categoria_dada_de_baja_se_rechaza(client, seed):
    client.delete(f"/api/categories/{seed['food']['id']}")
    response = client.post("/api/budgets", json=budget_payload(seed))
    assert response.status_code == 422
    assert "baja" in response.json()["detail"]


def test_periodo_invalido_se_rechaza(client, seed):
    assert client.get("/api/budgets", params={"period": "2026"}).status_code == 422
    assert client.get("/api/budgets", params={"period": "septiembre"}).status_code == 422
    assert (
        client.get(
            "/api/budgets/check",
            params={"category_id": seed["food"]["id"], "period": "2026-13"},
        ).status_code
        == 422
    )


def test_presupuesto_inexistente_da_404(client, seed):
    assert client.put("/api/budgets/9999", json={"amount": 1000}).status_code == 404
    assert client.delete("/api/budgets/9999").status_code == 404


def test_monto_cero_o_negativo_se_rechaza(client, seed):
    assert client.post("/api/budgets", json=budget_payload(seed, amount=0)).status_code == 422
    assert client.post("/api/budgets", json=budget_payload(seed, amount=-1)).status_code == 422