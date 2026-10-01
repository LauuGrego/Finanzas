from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.money import Money

GoalStatus = Literal["en_progreso", "cumplida", "vencida"]

# El recorte va antes del largo: un nombre de tres espacios pasa el min_length=1
# si se cuentan los espacios, y deja una meta sin nombre en la pantalla.
GoalName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class GoalCreate(BaseModel):
    name: GoalName = Field(description="Cómo le llamás a la meta")
    target_amount: Money = Field(gt=0, description="Cuánto necesitás juntar, en pesos")
    # Empezar con algo ya juntado es lo normal, no una excepción.
    current_amount: Money = Field(default=0, ge=0, description="Cuánto llevás juntado")
    deadline: date | None = Field(default=None, description="Fecha opcional; no frena nada")


class GoalUpdate(BaseModel):
    """Todo opcional: un PUT parcial sólo toca lo que viene.

    La fecha necesita poder mandarse en null para borrarse, y para distinguir
    "no la mandé" de "la quiero borrar" alcanza con `model_fields_set`: el
    nombre del campo presente en el body es la señal, no un valor centinela.
    """

    name: GoalName | None = None
    target_amount: Money | None = Field(default=None, gt=0)
    current_amount: Money | None = Field(default=None, ge=0)
    deadline: date | None = None
    active: bool | None = None


class GoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    target_amount: Money
    current_amount: Money
    deadline: date | None
    active: bool
    # Derivados, nunca guardados: se recalculan en cada lectura para que no
    # puedan quedar desfasados respecto de los montos.
    progress: float = Field(description="Porcentaje juntado, un decimal")
    remaining: Money = Field(description="Lo que falta; 0 si ya se pasó")
    days_left: int | None = Field(description="Días hasta la fecha; negativo si venció")
    status: GoalStatus
    created_at: datetime


class GoalList(BaseModel):
    items: list[GoalRead]
    total: int
