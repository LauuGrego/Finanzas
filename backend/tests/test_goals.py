"""Tests for goals.

The whole feature is four numbers and a date, so the tests are mostly about the
edges: what happens when the saved amount passes the target, when the date is
gone, and when the date is sent back as null.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta


def hoy() -> date:
    """El día local del servidor.

    Sin esto, `hoy()` y la fecha que calcula el backend se correlaciónan
    mal cerca de medianoche, que es exactamente cuando un test de "venció" falla
    sin que haya nada roto.
    """
    return datetime.now(UTC).astimezone().date()


def make_goal(client, name="Ahorro", target=300000, current=0, deadline=None):
    payload = {"name": name, "target_amount": target, "current_amount": current}
    if deadline is not None:
        payload["deadline"] = deadline
    return client.post("/api/goals", json=payload)


def id_of(response) -> int:
    """El id de la meta que acaba de crear la respuesta."""
    return response.json()["id"]


# --------------------------------------------------------------------------- #
# Crear
# --------------------------------------------------------------------------- #
def test_crear_una_meta(client):
    response = make_goal(client, "Bicicleta", target=500000, current=125000)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Bicicleta"
    assert body["target_amount"] == 500000
    assert body["current_amount"] == 125000
    assert body["progress"] == 25.0
    assert body["remaining"] == 375000
    assert body["status"] == "en_progreso"
    assert body["deadline"] is None
    assert body["days_left"] is None
    assert body["active"] is True


def test_una_meta_puede_empezar_en_cero(client):
    body = make_goal(client, "Empezar de cero").json()

    assert body["current_amount"] == 0
    assert body["progress"] == 0.0
    assert body["remaining"] == 300000


def test_la_fecha_es_opcional(client):
    """Sin fecha no hay límite, y una meta sin fecha es normal."""
    body = make_goal(client, "Sin apuro").json()

    assert body["deadline"] is None
    assert body["days_left"] is None


def test_cuando_llega_al_monto_esta_cumplida(client):
    body = make_goal(client, "Listo", target=200000, current=200000).json()

    assert body["status"] == "cumplida"
    assert body["progress"] == 100.0
    # Pasarse no es un problema: no queda nada pendiente y el número lo dice.
    assert body["remaining"] == 0


def test_cuando_se_pasa_el_monto_sigue_diciendolo(client):
    body = make_goal(client, "De más", target=100000, current=150000).json()

    assert body["status"] == "cumplida"
    assert body["progress"] == 150.0
    assert body["remaining"] == 0


def test_el_porcentaje_va_a_un_decimal(client):
    body = make_goal(client, target=300000, current=100000).json()

    assert body["progress"] == 33.3


# --------------------------------------------------------------------------- #
# Fechas
# --------------------------------------------------------------------------- #
def test_cuenta_los_dias_que_faltan(client):
    body = make_goal(
        client, deadline=(hoy() + timedelta(days=45)).isoformat()
    ).json()

    assert body["days_left"] == 45
    assert body["status"] == "en_progreso"


def test_una_fecha_pasada_no_rompe_nada(client):
    """Vencida informa; no bloquea ni impide editar la meta."""
    body = make_goal(client, deadline=(hoy() - timedelta(days=10)).isoformat()).json()

    assert body["days_left"] == -10
    assert body["status"] == "vencida"


def test_cumplida_le_gana_a_vencida(client):
    """Llegar al monto con la fecha pasada sigue siendo haber llegado."""
    body = make_goal(
        client,
        target=100000,
        current=100000,
        deadline=(hoy() - timedelta(days=10)).isoformat(),
    ).json()

    assert body["status"] == "cumplida"


def test_la_fecha_de_hoy_no_esta_vencida(client):
    body = make_goal(client, deadline=hoy().isoformat()).json()

    assert body["days_left"] == 0
    assert body["status"] == "en_progreso"


# --------------------------------------------------------------------------- #
# Editar
# --------------------------------------------------------------------------- #
def test_actualizar_lo_juntado_a_mano(client):
    identifier = id_of(make_goal(client))
    response = client.put(f"/api/goals/{identifier}", json={"current_amount": 90000})

    assert response.status_code == 200
    assert response.json()["current_amount"] == 90000
    assert response.json()["progress"] == 30.0


def test_se_puede_sacar_la_fecha(client):
    """Un PUT parcial manda sólo lo que cambia; la fecha se va con null."""
    created = make_goal(client, deadline=hoy().isoformat())
    assert client.put(f"/api/goals/{id_of(created)}", json={"deadline": None}).json()[
        "deadline"
    ] is None


def test_un_put_parcial_no_toca_lo_demas(client):
    created = make_goal(
        client, "Fondo", target=400000, current=100000, deadline=hoy().isoformat()
    )

    body = client.put(f"/api/goals/{id_of(created)}", json={"name": "Fondo de emergencia"}).json()

    assert body["name"] == "Fondo de emergencia"
    assert body["target_amount"] == 400000
    assert body["current_amount"] == 100000
    assert body["deadline"] is not None


def test_se_puede_bajar_el_monto_si_tambien_baja_lo_juntado(client):
    """En el mismo PUT valen los dos números nuevos, no los viejos."""
    identifier = id_of(make_goal(client, target=1000000, current=800000))

    body = client.put(
        f"/api/goals/{identifier}",
        json={"target_amount": 500000, "current_amount": 400000},
    ).json()

    assert body["target_amount"] == 500000
    assert body["current_amount"] == 400000
    assert body["progress"] == 80.0


# --------------------------------------------------------------------------- #
# Varias a la vez
# --------------------------------------------------------------------------- #
def test_se_pueden_manejar_varias_metas_activas(client):
    make_goal(client, "Viaje")
    make_goal(client, "Bicicleta")
    make_goal(client, "Fondo")

    body = client.get("/api/goals").json()

    assert body["total"] == 3
    assert {g["name"] for g in body["items"]} == {"Viaje", "Bicicleta", "Fondo"}


def test_varias_vencidas_y_una_en_progreso(client):
    make_goal(client, "Corta", deadline=(hoy() - timedelta(days=5)).isoformat())
    make_goal(client, "Corta2", deadline=(hoy() - timedelta(days=20)).isoformat())
    make_goal(client, "Larga", deadline=(hoy() + timedelta(days=200)).isoformat())

    by_name = {g["name"]: g for g in client.get("/api/goals").json()["items"]}

    assert by_name["Corta"]["status"] == "vencida"
    assert by_name["Corta2"]["status"] == "vencida"
    assert by_name["Larga"]["status"] == "en_progreso"


# --------------------------------------------------------------------------- #
# Pausar y borrar
# --------------------------------------------------------------------------- #
def test_pausar_saca_la_meta_de_la_lista(client):
    identifier = id_of(make_goal(client, "A ver"))
    client.put(f"/api/goals/{identifier}", json={"active": False})

    assert client.get("/api/goals").json()["total"] == 0
    assert client.get("/api/goals", params={"include_inactive": True}).json()["total"] == 1


def test_reactivar_la_devuelve(client):
    identifier = id_of(make_goal(client, "A ver"))
    client.put(f"/api/goals/{identifier}", json={"active": False})
    client.put(f"/api/goals/{identifier}", json={"active": True})

    assert client.get("/api/goals").json()["total"] == 1


def test_borrar(client):
    identifier = id_of(make_goal(client, "ERROR"))

    assert client.delete(f"/api/goals/{identifier}").status_code == 204
    assert client.get("/api/goals", params={"include_inactive": True}).json()["total"] == 0


def test_borrar_una_que_no_existe(client):
    assert client.delete("/api/goals/9999").status_code == 404


# --------------------------------------------------------------------------- #
# Errores
# --------------------------------------------------------------------------- #
def test_editar_una_que_no_existe(client):
    assert client.put("/api/goals/9999", json={"name": "x"}).status_code == 404


def test_no_se_crea_nada_si_falla(client):
    """Un 422 no deja una meta a medias guardada."""
    assert make_goal(client, name="Medio", target=0).status_code == 422
    assert client.get("/api/goals").json()["total"] == 0


def test_se_puede_editar_a_mas_que_la_meta(client):
    """Pasarse no se frena: la meta sigue cumplida y el porcentaje lo muestra."""
    identifier = id_of(make_goal(client, target=100000, current=0))

    body = client.put(f"/api/goals/{identifier}", json={"current_amount": 999999}).json()

    assert body["status"] == "cumplida"
    assert body["progress"] == 1000.0
    assert body["remaining"] == 0


def test_la_meta_tiene_que_ser_mayor_a_cero(client):
    assert make_goal(client, target=0).status_code == 422


def test_no_se_acepta_un_monto_negativo(client):
    assert make_goal(client, current=-1).status_code == 422


def test_el_nombre_no_puede_estar_vacio(client):
    assert make_goal(client, name="").status_code == 422
    assert make_goal(client, name="   ").status_code == 422


# --------------------------------------------------------------------------- #
# Orden
# --------------------------------------------------------------------------- #
def test_las_metas_con_fecha_mas_cercana_van_primero(client):
    make_goal(client, "Sin fecha")
    make_goal(client, "Lejos", deadline=(hoy() + timedelta(days=100)).isoformat())
    make_goal(client, "Cerca", deadline=(hoy() + timedelta(days=10)).isoformat())

    names = [g["name"] for g in client.get("/api/goals").json()["items"]]

    assert names == ["Cerca", "Lejos", "Sin fecha"]


def test_las_activas_van_antes_que_las_pausadas(client):
    paused = id_of(make_goal(client, "Pausada"))
    make_goal(client, "Activa")

    client.put(f"/api/goals/{paused}", json={"active": False})
    items = client.get("/api/goals", params={"include_inactive": True}).json()["items"]

    assert [g["name"] for g in items] == ["Activa", "Pausada"]


def test_la_lista_vacia(client):
    body = client.get("/api/goals").json()

    assert body == {"items": [], "total": 0}
