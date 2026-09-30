from __future__ import annotations

import calendar
from datetime import date

from app.services import recurring_service as rec
from tests.conftest import fund


def rule_payload(seed, **overrides) -> dict:
    payload = {
        "account_id": seed["bank"]["id"],
        "category_id": seed["food"]["id"],
        "amount": 15000,
        "description": "Netflix",
        "frequency": "MONTHLY",
        "next_date": seed["today"],
    }
    payload.update(overrides)
    return payload


# --------------------------------------------------------------------------- #
# Crear y listar
# --------------------------------------------------------------------------- #


def test_recurring_se_crea_y_aparece_en_la_lista(client, seed):
    created = client.post("/api/recurring", json=rule_payload(seed))
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["amount"] == 15000
    assert body["next_date"] == seed["today"]
    assert body["active"] is True
    # Nothing fired yet: a rule is not a movement.
    assert body["times_charged"] == 0

    listed = client.get("/api/recurring").json()
    assert listed["total"] == 1
    assert listed["items"][0]["description"] == "Netflix"


def test_el_tipo_se_saca_de_la_categoria_no_del_cliente(client, seed):
    """The payload has no `type`. The category decides whether it leaves or enters."""
    created = client.post("/api/recurring", json=rule_payload(seed))
    assert created.json()["type"] == "EXPENSE"

    as_income = client.post(
        "/api/recurring", json=rule_payload(seed, category_id=seed["salary"]["id"])
    )
    assert as_income.json()["type"] == "INCOME"


def test_cuenta_o_categoria_inexistente_se_rechaza(client, seed):
    missing_account = client.post("/api/recurring", json=rule_payload(seed, account_id=9999))
    assert missing_account.status_code == 422
    assert "no existe" in missing_account.json()["detail"]

    missing_category = client.post(
        "/api/recurring", json=rule_payload(seed, category_id=9999)
    )
    assert missing_category.status_code == 422


def test_no_se_acepta_una_categoria_dada_de_baja(client, seed):
    food_id = seed["food"]["id"]
    client.delete(f"/api/categories/{food_id}")
    response = client.post("/api/recurring", json=rule_payload(seed))
    assert response.status_code == 422
    assert "dada de baja" in response.json()["detail"]


# --------------------------------------------------------------------------- #
# Generar los vencidos
# --------------------------------------------------------------------------- #


def test_al_generar_nace_un_movimiento_real(client, seed):
    client.post("/api/recurring", json=rule_payload(seed))
    assert client.get("/api/transactions").json()["total"] == 0

    result = client.post("/api/recurring/generate")
    assert result.json() == {"generated": 1}

    movements = client.get("/api/transactions").json()
    assert movements["total"] == 1
    entry = movements["items"][0]
    assert entry["amount"] == 15000
    assert entry["description"] == "Netflix"
    assert entry["type"] == "EXPENSE"
    assert entry["date"] == seed["today"]


def test_la_fecha_avanza_y_no_vuelve_a_generar(client, seed):
    client.post("/api/recurring", json=rule_payload(seed))
    client.post("/api/recurring/generate")
    assert client.post("/api/recurring/generate").json() == {"generated": 0}
    assert client.get("/api/transactions").json()["total"] == 1

    rule = client.get("/api/recurring").json()["items"][0]
    assert rule["times_charged"] == 1
    assert rule["next_date"] > seed["today"]


def test_generar_un_ingreso_suma_y_no_resta(client, seed):
    client.post(
        "/api/recurring",
        json=rule_payload(
            seed, category_id=seed["salary"]["id"], amount=500000, description="Sueldo"
        ),
    )
    client.post("/api/recurring/generate")

    balances = {a["name"]: a["balance"] for a in client.get("/api/accounts").json()["accounts"]}
    # 100000 of starting money plus a salary, not minus one.
    assert balances["Banco"] == 600000


def shift_months(day: date, count: int) -> date:
    """`day` moved by whole months. Negative goes into the future.

    Used so the tests read in calendar terms instead of doing arithmetic on
    month numbers inline, and so a date that lands on a short month is clamped
    the same way the production code clamps it.
    """
    total = day.year * 12 + (day.month - 1) + count
    year, month_index = divmod(total, 12)
    month = month_index + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def test_una_regla_dormida_genera_todas_las_ocurrencias_que_se_perdieron(client, seed):
    """Three months without opening the app means four charges, not one.

    Set for 15/06 and caught up on 20/09: June, July, August and September, all
    four overdue. Fixed dates so the count does not move with the day the suite
    happens to run on.
    """
    client.post("/api/recurring", json=rule_payload(seed, next_date="2026-06-15"))

    assert client.post("/api/recurring/generate?today=2026-09-20").json() == {"generated": 4}

    dates = sorted(m["date"] for m in client.get("/api/transactions").json()["items"])
    assert dates == ["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15"]
    # And the rule has moved on past today, so it will not fire twice in a day.
    assert client.post("/api/recurring/generate?today=2026-09-20").json() == {"generated": 0}
    assert client.get("/api/recurring").json()["items"][0]["next_date"] == "2026-10-15"


def test_un_vencido_se_registra_en_su_propia_fecha_no_en_la_de_hoy(client, seed):
    """A rule asleep for a while keeps the day it actually fired."""
    overdue = date.fromisoformat(seed["today"]).replace(day=1)
    client.post("/api/recurring", json=rule_payload(seed, next_date=overdue.isoformat()))
    client.post("/api/recurring/generate")

    dates = sorted(m["date"] for m in client.get("/api/transactions").json()["items"])
    assert dates[0] == overdue.isoformat()


def test_el_saldo_insuficiente_no_impide_registrar_un_recurrente(client, seed):
    """A subscription is a fact, not a typo.

    The rule that refuses to overspend an account is there to catch a mistyped
    amount while you are typing. A subscription already got charged, so the
    movement is written anyway and the account ends up short, which is what
    actually happened.
    """
    fund(client, seed["bank"]["id"], 0)
    client.post("/api/recurring", json=rule_payload(seed))
    assert client.post("/api/recurring/generate").json() == {"generated": 1}

    bank = next(
        a for a in client.get("/api/accounts").json()["accounts"] if a["id"] == seed["bank"]["id"]
    )
    assert bank["balance"] == -15000


def test_una_regla_inactiva_no_genera(client, seed):
    created = client.post("/api/recurring", json=rule_payload(seed))
    client.put(f"/api/recurring/{created.json()['id']}", json={"active": False})

    assert client.post("/api/recurring/generate").json() == {"generated": 0}
    assert client.get("/api/transactions").json()["total"] == 0


def test_generar_es_idempotente_entre_llamadas(client, seed):
    client.post("/api/recurring", json=rule_payload(seed))
    first = client.post("/api/recurring/generate").json()["generated"]
    second = client.post("/api/recurring/generate").json()["generated"]
    assert (first, second) == (1, 0)


# --------------------------------------------------------------------------- #
# Editar y borrar
# --------------------------------------------------------------------------- #


def test_mover_la_fecha_a_mano_mueve_el_ancla(client, seed):
    """A rule pushed to the 31st has to come back to the 31st after February.

    Driven entirely through the API, with the clock moved by hand, so it covers
    the whole loop: edit the date, fire on a short month, land back on the 31st.
    """
    created = client.post("/api/recurring", json=rule_payload(seed))
    moved = client.put(
        f"/api/recurring/{created.json()['id']}", json={"next_date": "2026-01-31"}
    )
    assert moved.status_code == 200, moved.text

    # January 31 fires. February has 28 days, so it clamps there.
    assert client.post("/api/recurring/generate?today=2026-01-31").json() == {"generated": 1}
    assert client.get("/api/recurring").json()["items"][0]["next_date"] == "2026-02-28"

    # February 28 fires, and March has to go back to the 31st instead of sticking
    # to the 28th the clamp left behind.
    assert client.post("/api/recurring/generate?today=2026-02-28").json() == {"generated": 1}
    assert client.get("/api/recurring").json()["items"][0]["next_date"] == "2026-03-31"

    dates = sorted(m["date"] for m in client.get("/api/transactions").json()["items"])
    assert dates == ["2026-01-31", "2026-02-28"]


def test_borrar_una_regla_no_toca_los_movimientos_que_ya_escribio(client, seed):
    created = client.post("/api/recurring", json=rule_payload(seed))
    client.post("/api/recurring/generate")
    assert client.delete(f"/api/recurring/{created.json()['id']}").status_code == 204

    assert client.get("/api/recurring").json()["total"] == 0
    # The history still has to read true.
    assert client.get("/api/transactions").json()["total"] == 1


def test_borrar_una_regla_que_no_existe(client):
    assert client.delete("/api/recurring/9999").status_code == 404


def test_editar_el_monto_no_reescribe_lo_ya_generado(client, seed):
    created = client.post("/api/recurring", json=rule_payload(seed))
    client.post("/api/recurring/generate")
    client.put(f"/api/recurring/{created.json()['id']}", json={"amount": 20000})

    movements = client.get("/api/transactions").json()["items"]
    assert movements[0]["amount"] == 15000


# --------------------------------------------------------------------------- #
# El arrastre de fecha
# --------------------------------------------------------------------------- #


def test_mensual_mantiene_el_dia_del_mes():
    assert rec.advance(date(2026, 1, 15), "MONTHLY", 15) == date(2026, 2, 15)
    # Not 30 days later: that would walk the date backwards every month.
    assert rec.advance(date(2026, 1, 31), "MONTHLY", 31) == date(2026, 2, 28)


def test_el_dia_31_vuelve_tras_un_mes_corto():
    february = rec.advance(date(2026, 1, 31), "MONTHLY", 31)
    assert february == date(2026, 2, 28)
    assert rec.advance(february, "MONTHLY", 31) == date(2026, 3, 31)


def test_ano_bisiesto():
    assert rec.advance(date(2028, 1, 30), "MONTHLY", 30) == date(2028, 2, 29)
    assert rec.advance(date(2027, 1, 30), "MONTHLY", 30) == date(2027, 2, 28)


def test_semanal_suma_siete_dias():
    assert rec.advance(date(2026, 3, 1), "WEEKLY", 1) == date(2026, 3, 8)
    # Crosses a month boundary without caring.
    assert rec.advance(date(2026, 3, 27), "WEEKLY", 27) == date(2026, 4, 3)


def test_el_mes_cruza_diciembre():
    assert rec.advance(date(2026, 12, 10), "MONTHLY", 10) == date(2027, 1, 10)


# --------------------------------------------------------------------------- #
# Próximos compromisos
# --------------------------------------------------------------------------- #


def test_el_dashboard_avisa_lo_que_viene(client, seed):
    ahead = shift_months(date.fromisoformat(seed["today"]), 1)
    client.post("/api/recurring", json=rule_payload(seed, next_date=ahead.isoformat()))

    upcoming = client.get("/api/dashboard").json()["upcoming"]
    assert len(upcoming) == 1
    assert upcoming[0]["description"] == "Netflix"
    assert upcoming[0]["amount"] == 15000
    assert upcoming[0]["kind"] == "recurring"
    assert upcoming[0]["date"] == ahead.isoformat()
    assert upcoming[0]["category"]["name"] == "Comida"


def test_vencido_no_avisa_como_proximo_pero_aparece_el_siguiente(client, seed):
    client.post("/api/recurring", json=rule_payload(seed))
    pending = client.get("/api/dashboard").json()["upcoming"]
    assert [i["date"] for i in pending] == [seed["today"]]

    client.post("/api/recurring/generate")

    # The charge that just fired is history now, and the next one takes its place.
    upcoming = client.get("/api/dashboard").json()["upcoming"]
    assert [i["date"] for i in upcoming] != [seed["today"]]
    assert upcoming[0]["date"] > seed["today"]
    assert client.get("/api/transactions").json()["total"] == 1


def test_los_proximos_estan_ordenados_y_limitados(client, seed):
    today = date.fromisoformat(seed["today"])
    for offset in range(1, 9):
        client.post(
            "/api/recurring",
            json=rule_payload(
                seed,
                description=f"Cuota {offset}",
                next_date=shift_months(today, offset).isoformat(),
            ),
        )

    upcoming = client.get("/api/dashboard").json()["upcoming"]
    assert len(upcoming) == rec.UPCOMING_LIMIT
    days = [item["date"] for item in upcoming]
    assert days == sorted(days)
    # The five nearest, not any five.
    assert days[0] == shift_months(today, 1).isoformat()


def test_sin_recurrentes_el_dashboard_no_falla(client):
    assert client.get("/api/dashboard").json()["upcoming"] == []