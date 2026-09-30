from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.money import to_pesos
from app.schemas.reports import DashboardRead, MonthComparison, UpcomingItem
from app.services import installment_service, recurring_service
from app.services import transaction_service as tx
from app.services.periods import current_period, month_bounds, shift_month
from app.services.scheduling import UPCOMING_LIMIT


def dashboard(db: Session, period: str | None = None) -> DashboardRead:
    period = period or current_period()
    start, end = month_bounds(period)

    return DashboardRead(
        month=period,
        available_balance=to_pesos(tx.total_balance(db)),
        month_summary=tx.summarize(db, start, end),
        expenses_by_category=tx.expenses_by_category(db, start, end),
        # filter_transactions already returns TransactionRead objects.
        recent_transactions=tx.filter_transactions(db, limit=8).items,
        upcoming=_upcoming(db),
    )


def _upcoming(db: Session, today: date | None = None) -> list[UpcomingItem]:
    """Both kinds of scheduled rule in one list, ordered by when they fall.

    The dashboard shows a single "Próximos compromisos", so the two sources are
    merged here rather than in the frontend. Merging here is also what makes the
    cap mean anything: the cut happens once both are in, so a month full of
    installments cannot push every recurring off the list.
    """
    items = recurring_service.upcoming(db, today, limit=UPCOMING_LIMIT) + (
        installment_service.upcoming(db, today, limit=UPCOMING_LIMIT)
    )
    items.sort(key=lambda item: item.date)
    return items[:UPCOMING_LIMIT]


def monthly_comparison(db: Session, period: str, months: int) -> list[MonthComparison]:
    periods = [shift_month(period, -offset) for offset in range(months - 1, -1, -1)]
    rows = []
    for item in periods:
        start, end = month_bounds(item)
        income, expense = tx.summarize_cents(db, start, end)
        rows.append(
            MonthComparison(
                month=item,
                income=to_pesos(income),
                expense=to_pesos(expense),
                balance=to_pesos(income - expense),
            )
        )
    return rows


def balance_evolution(db: Session, period: str, months: int) -> list[MonthComparison]:
    """Running balance at the end of each of the last N months."""
    periods = [shift_month(period, -offset) for offset in range(months - 1, -1, -1)]

    first_start, _ = month_bounds(periods[0])
    before, _ = tx.summarize_cents(db, date.min, first_start - timedelta(days=1))
    running = tx.initial_balances_total(db) + before

    rows = []
    for item in periods:
        start, end = month_bounds(item)
        income, expense = tx.summarize_cents(db, start, end)
        running += income - expense
        rows.append(
            MonthComparison(
                month=item,
                income=to_pesos(income),
                expense=to_pesos(expense),
                balance=to_pesos(running),
            )
        )
    return rows
