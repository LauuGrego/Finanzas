from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.money import Money
from app.schemas.transaction import CategoryRef


class InstallmentBase(BaseModel):
    account_id: int
    category_id: int
    amount: Money = Field(gt=0, description="Lo que se cobra cada mes; el total sale de acá")
    description: str | None = Field(default=None, max_length=200)
    total_count: int = Field(ge=1, le=120, description="En cuántas cuotas")
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
    paid_count: int
    current_installment: int
    remaining: int
    total_amount: Money
    total_pending: Money
    finished: bool
    created_at: datetime
    category: CategoryRef | None = None
    account_name: str | None = None
    type: str = Field(description="EXPENSE or INCOME, taken from the category")



class InstallmentList(BaseModel):
    items: list[InstallmentRead]
    total: int
