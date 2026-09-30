from __future__ import annotations

import calendar
from datetime import date

from tests.conftest import fund


def plan_payload(seed, **overrides) -> dict:
    payload = {
        "account_id": seed["bank"]["id"],
        "category_id": seed["food"]["id"],
        "amount": 50000,
        "description": "La tele",
        "total_count": 12,
        "next_date": seed["today"],
    }
    payload.update(overrides)
    return payload


def shift_months(day: date, count: int) -> date:
    """`day` moved by whole months, clamped onto a short month.

    Its own copy instead of an import, on purpose: the tests should not agree
    with the production calendar code by sharing it, they should agree because
    both are right.
    """
    total = day.year * 12 + (day.month - 1) + count
    year, month_index = divmod(total, 12)
    month = month_index + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


# --------------------------------------------------------------------------- #
# Crear y listar
# --------------------------------------------------------------------------- #


def test_una_cuota_se_crea_y_aparece_en_la_lista(client, seed):
    created = client.post("/api/installments", json=plan_payload(seed))
    assert created.status_code == 201, created.text
    body = created.json()

    assert body["amount"] == 50000
    assert body["total_count"] == 12
    assert body["paid_count"] == 0
    assert body["current_installment"] == 1
    assert body["remaining"] == 12
    assert body["total_amount"] == 600000
    assert body["total_pending"] == 600000
    assert body["finished"] is False
    assert body["active"] is True
    # Nothing fired yet: a plan is not a movement.
    assert client.get("/api/transactions").json()["total"] == 0

    listed = client.get("/api/installments").json()
    assert listed["total"] == 1
    assert listed["items"][0]["description"] == "La tele"


def test_el_tipo_se_saca_de_la_categoria_no_del_cliente(client, seed):
    """The payload has no `type`. The category decides whether it leaves or enters."""
    created = client.post("/api/installments", json=plan_payload(seed))
    assert created.json()["type"] == "EXPENSE"

    as_income = client.post(
        "/api/installments", json=plan_payload(seed, category_id=seed["salary"]["id"])
    )
    assert as_income.json()["type"] == "INCOME"


def test_cuenta_o_categoria_inexistente_se_rechaza(client, seed):
    missing_account = client.post("/api/installments", json=plan_payload(seed, account_id=9999))
    assert missing_account.status_code == 422
    assert "no existe" in missing_account.json()["detail"]

    missing_category = client.post(
        "/api/installments", json=plan_payload(seed, category_id=9999)
    )
    assert missing_category.status_code == 422


def test_no_se_acepta_una_categoria_dada_de_baja(client, seed):
    client.delete(f"/api/categories/{seed['food']['id']}")
    response = client.post("/api/installments", json=plan_payload(seed))
    assert response.status_code == 422
    assert "dada de baja" in response.json()["detail"]


def test_la_cantidad_de_cuotas_tiene_que_tener_sentido(client, seed):
    """One installment is a purchase; zero and a hundred and twenty-one are typos."""
    assert client.post(
        "/api/installments", json=plan_payload(seed, total_count=0)
    ).status_code == 422
    assert client.post(
        "/api/installments", json=plan_payload(seed, total_count=121)
    ).status_code == 422
    assert client.post(
        "/api/installments", json=plan_payload(seed, total_count=1)
    ).status_code == 201


# --------------------------------------------------------------------------- #
# Generar las cuotas
# --------------------------------------------------------------------------- #


def test_al_generar_nace_un_movimiento_real(client, seed):
    client.post("/api/installments", json=plan_payload(seed))

    assert client.post("/api/installments/generate").json() == {"generated": 1}

    movements = client.get("/api/transactions").json()
    assert movements["total"] == 1
    entry = movements["items"][0]
    assert entry["amount"] == 50000
    assert entry["description"] == "La tele"
    assert entry["type"] == "EXPENSE"
    assert entry["date"] == seed["today"]


def test_la_cuota_actual_y_lo_pendiente_bajan_con_cada_cobro(client, seed):
    client.post("/api/installments", json=plan_payload(seed))
    client.post("/api/installments/generate")

    plan = client.get("/api/installments").json()["items"][0]
    assert plan["paid_count"] == 1
    # The next one is the second, and it is the news the UI leads with.
    assert plan["current_installment"] == 2
    assert plan["remaining"] == 11
    assert plan["total_pending"] == 550000
    # The price of the thing does not change because a month went by.
    assert plan["total_amount"] == 600000
    assert plan["next_date"] > seed["today"]


def test_generar_dos_veces_el_mismo_dia_no_cobra_dos_veces(client, seed):
    client.post("/api/installments", json=plan_payload(seed))
    assert client.post("/api/installments/generate").json() == {"generated": 1}
    assert client.post("/api/installments/generate").json() == {"generated": 0}
    assert client.get("/api/transactions").json()["total"] == 1


def test_una_cuota_con_fecha_futura_no_genera(client, seed):
    ahead = shift_months(date.fromisoformat(seed["today"]), 1)
    client.post("/api/installments", json=plan_payload(seed, next_date=ahead.isoformat()))
    assert client.post("/api/installments/generate").json() == {"generated": 0}
    assert client.get("/api/transactions").json()["total"] == 0


def test_una_cuota_dormida_registra_las_que_faltan_con_su_fecha(client, seed):
    """Four months without opening the app means four charges, each on its day.

    Set for 15/06 and caught up on 20/09: June, July, August and September.
    Fixed dates so the count does not move with the day the suite runs on.
    """
    client.post("/api/installments", json=plan_payload(seed, next_date="2026-06-15"))

    assert client.post("/api/installments/generate?today=2026-09-20").json() == {"generated": 4}

    dates = sorted(m["date"] for m in client.get("/api/transactions").json()["items"])
    assert dates == ["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15"]
    assert client.get("/api/installments").json()["items"][0]["next_date"] == "2026-10-15"


def test_no_cobra_mas_cuotas_que_las_del_plan(client, seed):
    """The count ends the plan, not the calendar.

    Three installments from January, caught up in September: the calendar alone
    would keep going, so this is the test that the loop stops at the third and
    marks the plan finished.
    """
    client.post(
        "/api/installments", json=plan_payload(seed, total_count=3, next_date="2026-01-10")
    )

    assert client.post("/api/installments/generate?today=2026-09-20").json() == {"generated": 3}
    assert client.post("/api/installments/generate?today=2026-09-20").json() == {"generated": 0}

    dates = sorted(m["date"] for m in client.get("/api/transactions").json()["items"])
    assert dates == ["2026-01-10", "2026-02-10", "2026-03-10"]

    plan = client.get("/api/installments").json()["items"][0]
    assert plan["paid_count"] == 3
    assert plan["finished"] is True
    assert plan["remaining"] == 0
    assert plan["total_pending"] == 0


def test_el_saldo_insuficiente_no_impide_registrar_una_cuota(client, seed):
    """An installment is a fact, not a typo. Same rule as a recurring charge."""
    fund(client, seed["bank"]["id"], 0)
    client.post("/api/installments", json=plan_payload(seed))
    assert client.post("/api/installments/generate").json() == {"generated": 1}

    bank = next(
        a for a in client.get("/api/accounts").json()["accounts"] if a["id"] == seed["bank"]["id"]
    )
    assert bank["balance"] == -50000


def test_una_cuota_pausada_no_genera(client, seed):
    created = client.post("/api/installments", json=plan_payload(seed))
    client.put(f"/api/installments/{created.json()['id']}", json={"active": False})

    assert client.post("/api/installments/generate").json() == {"generated": 0}
    assert client.get("/api/transactions").json()["total"] == 0


# --------------------------------------------------------------------------- #
# Editar y borrar
# --------------------------------------------------------------------------- #


def test_mover_la_fecha_a_mano_mueve_el_ancla(client, seed):
    """A plan pushed to the 31st has to come back to the 31st after February."""
    created = client.post("/api/installments", json=plan_payload(seed, total_count=4))
    moved = client.put(
        f"/api/installments/{created.json()['id']}", json={"next_date": "2026-01-31"}
    )
    assert moved.status_code == 200, moved.text

    assert client.post("/api/installments/generate?today=2026-01-31").json() == {"generated": 1}
    assert client.get("/api/installments").json()["items"][0]["next_date"] == "2026-02-28"

    assert client.post("/api/installments/generate?today=2026-02-28").json() == {"generated": 1}
    assert client.get("/api/installments").json()["items"][0]["next_date"] == "2026-03-31"

    dates = sorted(m["date"] for m in client.get("/api/transactions").json()["items"])
    assert dates == ["2026-01-31", "2026-02-28"]


def test_editar_el_monto_no_reescribe_lo_ya_generado(client, seed):
    created = client.post("/api/installments", json=plan_payload(seed))
    client.post("/api/installments/generate")
    client.put(f"/api/installments/{created.json()['id']}", json={"amount": 60000})

    movements = client.get("/api/transactions").json()["items"]
    assert movements[0]["amount"] == 50000


def test_borrar_el_plan_no_toca_las_cuotas_que_ya_escribio(client, seed):
    created = client.post("/api/installments", json=plan_payload(seed))
    client.post("/api/installments/generate")
    assert client.delete(f"/api/installments/{created.json()['id']}").status_code == 204

    assert client.get("/api/installments").json()["total"] == 0
    # The history still has to read true.
    assert client.get("/api/transactions").json()["total"] == 1


def test_borrar_una_cuota_que_no_existe(client):
    assert client.delete("/api/installments/9999").status_code == 404


def test_las_pausadas_se_ven_solo_si_se_piden(client, seed):
    created = client.post("/api/installments", json=plan_payload(seed))
    client.put(f"/api/installments/{created.json()['id']}", json={"active": False})

    assert client.get("/api/installments").json()["total"] == 0
    listed = client.get("/api/installments?include_inactive=true").json()
    assert listed["total"] == 1
    assert listed["items"][0]["active"] is False


# --------------------------------------------------------------------------- #
# Próximos compromisos
# --------------------------------------------------------------------------- #


def test_el_dashboard_avisa_la_cuota_que_viene_con_su_numero(client, seed):
    ahead = shift_months(date.fromisoformat(seed["today"]), 1)
    client.post("/api/installments", json=plan_payload(seed, next_date=ahead.isoformat()))

    upcoming = client.get("/api/dashboard").json()["upcoming"]
    assert len(upcoming) == 1
    # Which one it is, is the news. "La tele" alone would not say much.
    assert upcoming[0]["description"] == "La tele · cuota 1 de 12"
    assert upcoming[0]["amount"] == 50000
    assert upcoming[0]["kind"] == "installment"
    assert upcoming[0]["date"] == ahead.isoformat()
    assert upcoming[0]["category"]["name"] == "Comida"


def test_lo_que_viene_mezcla_recurrentes_y_cuotas_por_fecha(client, seed):
    client.post(
        "/api/recurring",
        json={
            "account_id": seed["bank"]["id"],
            "category_id": seed["food"]["id"],
            "amount": 15000,
            "description": "Netflix",
            "frequency": "MONTHLY",
            "next_date": seed["today"],
        },
    )
    client.post(
        "/api/installments",
        json=plan_payload(
            seed, next_date=shift_months(date.fromisoformat(seed["today"]), 1).isoformat()
        ),
    )

    upcoming = client.get("/api/dashboard").json()["upcoming"]
    assert [item["kind"] for item in upcoming] == ["recurring", "installment"]
    assert [item["description"] for item in upcoming] == ["Netflix", "La tele · cuota 1 de 12"]


def test_un_plan_terminado_no_se_anuncia_aunque_le_quede_fecha(client, seed):
    """A finished plan can still have a `next_date` ahead of it.

    The one way to get there is lowering the count to what is already paid. Being
    finished, not the date, is what has to keep it off the list.
    """
    created = client.post("/api/installments", json=plan_payload(seed))
    assert client.post("/api/installments/generate").json() == {"generated": 1}

    plan = client.get("/api/installments").json()["items"][0]
    assert plan["next_date"] > seed["today"]
    assert plan["finished"] is False

    closed = client.put(
        f"/api/installments/{created.json()['id']}", json={"total_count": 1}
    )
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["finished"] is True
    assert body["remaining"] == 0
    assert body["next_date"] > seed["today"]

    assert client.get("/api/dashboard").json()["upcoming"] == []


def test_sin_cuotas_el_dashboard_no_falla(client):
    assert client.get("/api/dashboard").json()["upcoming"] == []
