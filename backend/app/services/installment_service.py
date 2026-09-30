"""Turning installment plans into real movements.

An `Installment` row is a plan: "the TV, 12 months of 50.000 from the card". It
has the same shape as a recurring rule with a count, so it fires the same way:
`generate_due` walks forward from the date that was actually due, and every
occurrence missed while the server slept is written, each on its own day. The
difference is that the loop stops at `total_count`, so the last installment ends
the plan instead of scheduling another one.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.enums import TransactionType
from app.models import Installment
from app.money import to_pesos
from app.schemas.installment import InstallmentRead
from app.schemas.reports import UpcomingItem
from app.services.scheduling import UPCOMING_LIMIT, advance_month, write_occurrence


def generate_due(db: Session, today: date | None = None) -> int:
    """Write a movement for every installment that was already due.

    Returns how many were written, so the caller can tell "nothing to do" from
    "it caught up".
    """
    today = today or date.today()
    due = (
        db.execute(
            select(Installment)
            .options(selectinload(Installment.category))
            .where(
                Installment.active.is_(True),
                Installment.next_date <= today,
                # A finished plan stays in the table so the purchase is still
                # readable, but it is not due for anything ever again.
                Installment.paid_count < Installment.total_count,
            )
            .order_by(Installment.next_date)
        )
        .scalars()
        .all()
    )

    written = 0
    for plan in due:
        # Four months without opening the app means four charges, each on the
        # day it fell due. The count is what ends the plan; the loop condition
        # carries it so the limit holds on its own, not only because the query
        # kept finished plans out of the way.
        while plan.next_date <= today and plan.paid_count < plan.total_count:
            write_occurrence(
                db,
                account_id=plan.account_id,
                category=plan.category,
                amount=plan.amount,
                description=plan.description,
                when=plan.next_date,
            )
            plan.paid_count += 1
            plan.next_date = advance_month(plan.next_date, plan.anchor_day)
            written += 1

    if written:
        db.commit()
    return written


def upcoming(
    db: Session, today: date | None = None, limit: int = UPCOMING_LIMIT
) -> list[UpcomingItem]:
    """The next installment of every plan that is still running.

    Only the next one: a plan due on the 5th shows up once, on the 5th, not once
    for each installment it has left.
    """
    today = today or date.today()
    plans = (
        db.execute(
            select(Installment)
            .options(selectinload(Installment.category))
            .where(
                Installment.active.is_(True),
                Installment.next_date >= today,
                Installment.paid_count < Installment.total_count,
            )
            .order_by(Installment.next_date)
            .limit(limit)
        )
        .scalars()
        .all()
    )

    items = []
    for plan in plans:
        category = plan.category
        label = plan.description or (category.name if category else "Cuota")
        items.append(
            UpcomingItem(
                # Which installment it is belongs in the description: "la TV" is
                # not the news, "la TV, cuota 7 de 12" is.
                date=plan.next_date,
                description=f"{label} · cuota {plan.paid_count + 1} de {plan.total_count}",
                amount=to_pesos(plan.amount),
                kind="installment",
                category=(
                    {"id": category.id, "name": category.name, "color": category.color}
                    if category
                    else None
                ),
            )
        )
    return items


def to_read(plan: Installment) -> InstallmentRead:
    category = plan.category
    remaining = max(plan.total_count - plan.paid_count, 0)
    return InstallmentRead(
        id=plan.id,
        account_id=plan.account_id,
        category_id=plan.category_id,
        amount=to_pesos(plan.amount),
        description=plan.description,
        total_count=plan.total_count,
        next_date=plan.next_date,
        active=plan.active,
        paid_count=plan.paid_count,
        current_installment=min(plan.paid_count + 1, plan.total_count),
        remaining=remaining,
        # The whole purchase and what is still owed, both derived. Not stored,
        # for the same reason an account balance is not.
        total_amount=to_pesos(plan.amount * plan.total_count),
        total_pending=to_pesos(plan.amount * remaining),
        finished=plan.paid_count >= plan.total_count,
        created_at=plan.created_at,
        category=(
            {"id": category.id, "name": category.name, "color": category.color}
            if category
            else None
        ),
        account_name=plan.account.name if plan.account else None,
        type=category.type if category else TransactionType.EXPENSE.value,
    )
