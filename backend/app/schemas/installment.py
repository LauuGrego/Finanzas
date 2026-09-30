from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.money import Money
from app.schemas.transaction import CategoryRef


class InstallmentBase(BaseModel):
    account_id: int
    category_id: int
    # What is charged each month, not the total. See the model docstring.
    amount: Money = Field(gt=0, description="Lo que se cobra cada mes; el total sale de acá")
    description: str | None = Field(default=None, max_length=200)
    total_count: int = Field(ge=1, le=120, description="En cuántas cuotas")
    # The first installment. It is moved forward on its own after each run.
    next_date: date


class InstallmentCreate(InstallmentBase):
    pass


class InstallmentUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    amount: Money | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=200)
    total_count: int | None = Field(default=None, ge=1, le=120)
    next_date: date | None = None
    active: bool | None = None


class InstallmentRead(InstallmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    active: bool
    # How many are already written.
    paid_count: int
    # The number of the installment that comes next, one-based, for "cuota 4 de
    # 12". On a finished plan this is the last one rather than one past it.
    current_installment: int
    remaining: int
    total_amount: Money
    total_pending: Money
    # True once every installment has been written. Derived, never stored: it is
    # the same piece of information as `paid_count >= total_count`.
    finished: bool
    created_at: datetime
    category: CategoryRef | None = None
    account_name: str | None = None
    # Resolved from the category, so the UI does not have to join anything.
    type: str = Field(description="EXPENSE or INCOME, taken from the category")


class InstallmentList(BaseModel):
    items: list[InstallmentRead]
    total: int
