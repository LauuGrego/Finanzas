from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account
from app.schemas.reports import (
    CategoryTotal,
    DashboardRead,
    DayDetail,
    MonthComparison,
    UpcomingItem,
)
from app.services import report_service
from app.services import transaction_service as tx
from app.services.periods import current_period, month_bounds

router = APIRouter(tags=["reports"])


def _period(value: str) -> str:
    try:
        month_bounds(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return value


@router.get("/dashboard", response_model=DashboardRead)
def get_dashboard(
    month: str | None = Query(None, description="YYYY-MM, defaults to the current month"),
    db: Session = Depends(get_db),
) -> DashboardRead:
    return report_service.dashboard(db, _period(month) if month else None)


@router.get("/reports/monthly", response_model=list[MonthComparison])
def monthly(
    months: int = Query(6, ge=1, le=24),
    month: str | None = None,
    db: Session = Depends(get_db),
) -> list[MonthComparison]:
    return report_service.monthly_comparison(db, _period(month) if month else current_period(), months)


@router.get("/reports/balance-evolution", response_model=list[MonthComparison])
def balance_evolution(
    months: int = Query(6, ge=1, le=24),
    month: str | None = None,
    db: Session = Depends(get_db),
) -> list[MonthComparison]:
    return report_service.balance_evolution(
        db, _period(month) if month else current_period(), months
    )


@router.get("/reports/categories", response_model=list[CategoryTotal])
def categories(
    start: date | None = None,
    end: date | None = None,
    month: str | None = None,
    account_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[CategoryTotal]:
    if month:
        try:
            start, end = month_bounds(month)
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    end = end or date.today()
    start = start or (end.replace(day=1) - timedelta(days=1)).replace(day=1)
    return tx.expenses_by_category(db, start, end, account_id)


@router.get("/calendar/day", response_model=DayDetail)
def calendar_day(day: date, db: Session = Depends(get_db)) -> DayDetail:
    page = tx.filter_transactions(db, start=day, end=day, limit=200)
    return DayDetail(
        date=day,
        summary=tx.summarize(db, day, day),
        transactions=page.items,
    )


@router.get("/calendar/month", response_model=dict[str, DayDetail])
def calendar_month(month: str, db: Session = Depends(get_db)) -> dict[str, DayDetail]:
    """Every day of the month with its movements, for rendering the agenda grid."""
    start, end = month_bounds(_period(month))
    page = tx.filter_transactions(db, start=start, end=end, limit=500)
    by_day: dict[str, list[TransactionRead]] = {}
    for item in page.items:
        by_day.setdefault(item.date.isoformat(), []).append(item)

    days: dict[str, DayDetail] = {}
    cursor = start
    while cursor <= end:
        items = by_day.get(cursor.isoformat(), [])
        days[cursor.isoformat()] = DayDetail(
            date=cursor,
            summary=tx.summarize(db, cursor, cursor),
            transactions=items,
        )
        cursor += timedelta(days=1)
    return days
