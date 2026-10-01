"""Budgets: a monthly spending limit per category.

This is a read-only projection on top of the transactions that already exist.
Nothing here writes movements, nothing here blocks a transaction, and nothing
here is stored that can be derived. `spent` is computed from `transactions`
every time the page is asked; if we stored it we would have to keep it in sync
with every edit, every delete and every recurring charge that lands.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Budget, Category, Transaction
from app.money import to_pesos
from app.schemas.budget import (
    BudgetCheck,
    BudgetCreated,
    BudgetList,
    BudgetRead,
    BudgetSummary,
)
from app.services.periods import current_period, month_bounds, parse_period, shift_month


# --------------------------------------------------------------------------- #
# Lectura
# --------------------------------------------------------------------------- #
def list_for_period(db: Session, period: str) -> list[BudgetRead]:
    """All budgets for a given month, the most-spent first.

    The percentage is only known after each `spent` is computed, so the order is
    decided here rather than in the query: the budget that is closest to
    breaking is the one worth seeing first.
    """
    year, month = parse_period(period)
    budgets = (
        db.execute(
            select(Budget)
            .options(selectinload(Budget.category))
            .where(Budget.year == year, Budget.month == month, Budget.active.is_(True))
            .order_by(Budget.category_id)
        )
        .scalars()
        .all()
    )
    items = [_to_read(db, budget) for budget in budgets]
    items.sort(key=lambda item: (-item.percentage, item.category_id))
    return items


def summary_for_period(db: Session, period: str) -> BudgetSummary:
    items = list_for_period(db, period)
    total_amount = sum(b.amount for b in items)
    total_spent = sum(b.spent for b in items)
    over = sum(1 for b in items if b.over)
    return BudgetSummary(
        amount=total_amount,
        spent=total_spent,
        remaining=total_amount - total_spent,
        percentage=round(total_spent * 100 / total_amount, 1) if total_amount else 0.0,
        count=len(items),
        over_count=over,
    )


def get_list(db: Session, period: str | None = None) -> BudgetList:
    period = period or current_period()
    items = list_for_period(db, period)
    return BudgetList(
        items=items,
        total=len(items),
        summary=summary_for_period(db, period),
    )


def check(
    db: Session, category_id: int, period: str, exclude_transaction_id: int | None = None
) -> BudgetCheck:
    """Lightweight lookup for the new-movement modal.

    `exclude_transaction_id` is used when editing: the movement being edited is
    already inside `spent`, so including it would double-count.
    """
    year, month = parse_period(period)
    budget = db.scalar(
        select(Budget).where(
            Budget.category_id == category_id,
            Budget.year == year,
            Budget.month == month,
            Budget.active.is_(True),
        )
    )
    if budget is None:
        return BudgetCheck(has_budget=False, period=period)

    spent = _spent_cents(db, category_id, period, exclude_transaction_id)
    category = budget.category or db.get(Category, category_id)
    return BudgetCheck(
        has_budget=True,
        period=period,
        # Pesos on the wire, centavos in the row: the conversion happens here and
        # nowhere else, like everywhere else in the app.
        amount=to_pesos(budget.amount),
        spent=to_pesos(spent),
        remaining=to_pesos(budget.amount - spent),
        percentage=round(spent * 100 / budget.amount, 1),
        over=spent > budget.amount,
        category=(
            {"id": category.id, "name": category.name, "color": category.color}
            if category
            else None
        ),
    )


# --------------------------------------------------------------------------- #
# Escritura
# --------------------------------------------------------------------------- #
def create(
    db: Session, category_id: int, period: str, amount: int, repeat_months: int = 1
) -> BudgetCreated:
    """Create one budget, or `repeat_months` consecutive ones from `period`.

    The first month is the one the user is looking at, so if it already has a
    budget for that category this raises instead of skipping: silently creating
    nothing while the screen says "listo" is worse than saying "ya lo tenías".
    Later months are skipped and counted, because when you repeat a budget for a
    year some of those months may well be set up already.
    """
    created: list[BudgetRead] = []
    skipped = 0

    for offset in range(repeat_months):
        target_period = shift_month(period, offset)
        year, month = parse_period(target_period)
        exists = db.scalar(
            select(Budget.id).where(
                Budget.category_id == category_id,
                Budget.year == year,
                Budget.month == month,
            )
        )
        if exists:
            if offset == 0:
                category = db.get(Category, category_id)
                name = category.name if category else "esa categoría"
                # No se pone el periodo en el mensaje: los nombres de mes viven
                # en el frontend y la pantalla ya muestra cuál se está mirando.
                raise ValueError(
                    f"{name} ya tiene un presupuesto para este mes. "
                    "Si querés cambiar el tope, editá la tarjeta."
                )
            skipped += 1
            continue
        budget = Budget(
            category_id=category_id,
            amount=amount,
            period=target_period,
            year=year,
            month=month,
        )
        db.add(budget)
        db.flush()
        # Refresh so the category relationship is loaded for to_read.
        db.refresh(budget)
        created.append(_to_read(db, budget))

    if created:
        db.commit()
    return BudgetCreated(items=created, created=len(created), skipped=skipped)


def update(
    db: Session,
    budget: Budget,
    amount: int | None = None,
    apply_forward: bool = False,
) -> BudgetRead:
    if amount is not None:
        budget.amount = amount
        if apply_forward:
            # Also update every later month of the same category.
            later = (
                db.execute(
                    select(Budget).where(
                        Budget.category_id == budget.category_id,
                        Budget.active.is_(True),
                        (Budget.year * 12 + Budget.month)
                        >= (budget.year * 12 + budget.month),
                    )
                )
                .scalars()
                .all()
            )
            for other in later:
                other.amount = amount
    db.commit()
    db.refresh(budget)
    return _to_read(db, budget)


def delete(db: Session, budget: Budget) -> None:
    db.delete(budget)
    db.commit()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _spent_cents(
    db: Session,
    category_id: int,
    period: str,
    exclude_transaction_id: int | None = None,
) -> int:
    """Total spent on a category during a month, in centavos.

    Only EXPENSE counts: a budget says "don't spend more than this on Comida",
    so an income in that category should not make it look like there's room.
    """
    start, end = month_bounds(period)
    query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.category_id == category_id,
        Transaction.type == "EXPENSE",
        Transaction.date >= start,
        Transaction.date <= end,
        Transaction.transfer_id.is_(None),
    )
    if exclude_transaction_id is not None:
        query = query.where(Transaction.id != exclude_transaction_id)
    return int(db.scalar(query) or 0)


def _to_read(db: Session, budget: Budget) -> BudgetRead:
    spent = _spent_cents(db, budget.category_id, budget.period)
    category = budget.category
    return BudgetRead(
        id=budget.id,
        category_id=budget.category_id,
        amount=to_pesos(budget.amount),
        period=budget.period,
        active=budget.active,
        spent=to_pesos(spent),
        remaining=to_pesos(budget.amount - spent),
        percentage=round(spent * 100 / budget.amount, 1) if budget.amount else 0.0,
        over=spent > budget.amount,
        created_at=budget.created_at,
        category=(
            {"id": category.id, "name": category.name, "color": category.color}
            if category
            else None
        ),
    )