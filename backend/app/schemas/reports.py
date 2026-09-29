from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from app.enums import TransactionType
from app.money import Money
from app.schemas.transaction import CategoryRef, TransactionRead


class PeriodSummary(BaseModel):
    """Income / expense / balance for a period (month or day)."""

    income: Money = 0
    expense: Money = 0
    balance: Money = 0


class CategoryTotal(BaseModel):
    category_id: int | None
    category_name: str
    color: str | None = None
    total: Money
    percentage: float = 0
    count: int = 0


class DailyEntry(TransactionRead):
    pass


class DayDetail(BaseModel):
    date: date
    summary: PeriodSummary
    transactions: list[TransactionRead]


class UpcomingItem(BaseModel):
    """Populated by the recurring/installments features. Empty in the MVP."""

    date: date
    description: str
    amount: Money
    kind: str = Field(default="recurring", pattern="^(recurring|installment)$")
    category: CategoryRef | None = None


class MonthComparison(BaseModel):
    month: str = Field(description="YYYY-MM")
    income: Money
    expense: Money
    balance: Money


class DashboardRead(BaseModel):
    month: str = Field(description="YYYY-MM")
    available_balance: Money
    month_summary: PeriodSummary
    expenses_by_category: list[CategoryTotal]
    recent_transactions: list[TransactionRead]
    upcoming: list[UpcomingItem]
