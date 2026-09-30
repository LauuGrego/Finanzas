from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.enums import Frequency
from app.money import Money
from app.schemas.transaction import CategoryRef


class RecurringBase(BaseModel):
    account_id: int
    category_id: int
    amount: Money = Field(gt=0, description="Always positive; the category says if it leaves or enters")
    description: str | None = Field(default=None, max_length=200)
    frequency: Frequency
    # The first day it fires. It is moved forward on its own after each run.
    next_date: date


class RecurringCreate(RecurringBase):
    pass


class RecurringUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    amount: Money | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=200)
    frequency: Frequency | None = None
    next_date: date | None = None
    active: bool | None = None


class RecurringRead(RecurringBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    active: bool
    times_charged: int
    created_at: datetime
    category: CategoryRef | None = None
    account_name: str | None = None
    # Resolved from the category, so the UI does not have to join anything.
    type: str = Field(description="EXPENSE or INCOME, taken from the category")


class RecurringList(BaseModel):
    items: list[RecurringRead]
    total: int
