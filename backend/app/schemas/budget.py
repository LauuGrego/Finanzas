from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.money import Money
from app.schemas.transaction import CategoryRef


class BudgetBase(BaseModel):
    category_id: int
    # Integer centavos in the DB, decimal pesos on the wire.
    amount: Money = Field(gt=0, description="El límite en pesos para el mes")


class BudgetCreate(BudgetBase):
    # 'YYYY-MM'
    period: str = Field(description="Mes del presupuesto, formato YYYY-MM")
    repeat_months: int = Field(
        default=1,
        ge=1,
        le=24,
        description="Cuántos meses seguidos se crean; 1 = solo este mes",
    )


class BudgetUpdate(BaseModel):
    amount: Money | None = Field(default=None, gt=0)
    # Si True, actualiza también los meses posteriores de la misma categoría.
    apply_forward: bool = False


class BudgetRead(BudgetBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    period: str
    active: bool
    # Derivados: what's already been spent, what's left, how far along.
    spent: Money = Field(description="Gastado en la categoría durante el mes")
    remaining: Money = Field(description="Lo que queda; puede ser negativo")
    percentage: float = Field(description="Porcentaje gastado, un decimal")
    over: bool = Field(description="True cuando gastado > límite")
    created_at: datetime
    category: CategoryRef | None = None


class BudgetSummary(BaseModel):
    """Suma de todos los presupuestos del mes."""

    amount: Money
    spent: Money
    remaining: Money
    percentage: float
    count: int
    over_count: int = Field(description="Cuántos presupuestos ya se pasaron")


class BudgetList(BaseModel):
    items: list[BudgetRead]
    total: int
    summary: BudgetSummary


class BudgetCreated(BaseModel):
    """Respuesta de POST: uno o varios presupuestos creados según repeat_months."""

    items: list[BudgetRead]
    created: int
    skipped: int = Field(description="Meses que ya tenían presupuesto para esa categoría")


class BudgetCheck(BaseModel):
    """Consulta rápida para el modal de movimiento.

    Always answers 200 even with has_budget=False, so the frontend can render
    "no budget for this category" without an error path.
    """

    has_budget: bool
    period: str
    amount: Money = 0
    spent: Money = 0
    remaining: Money = 0
    percentage: float = 0
    over: bool = False
    category: CategoryRef | None = None