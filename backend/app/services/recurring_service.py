"""Turning recurring rules into real movements.

A `Recurring` row is a rule, not a movement. When its day comes the rule fires
and writes an ordinary `Transaction`, which from that moment on is editable and
deletable like any other. The rule only knows when to fire next.

The catch-up in `generate_due` is what makes a phone-only app practical: the
server sleeps, so there is no cron to run, and a rule can come due many times
before anyone opens the app. Every occurrence that was missed is written.

The date walk and the write itself are shared with installments and live in
`app.services.scheduling`, so the two kinds of rule cannot drift apart.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.enums import TransactionType
from app.models import Recurring
from app.money import to_pesos
from app.schemas.recurring import RecurringRead
from app.schemas.reports import UpcomingItem
from app.services.scheduling import UPCOMING_LIMIT, advance, write_occurrence


def generate_due(db: Session, today: date | None = None) -> int:
    """Write a movement for every occurrence that was already due.

    Returns how many were written, so the caller can tell "nothing to do" from
    "it caught up".
    """
    today = today or date.today()
    due = (
        db.execute(
            select(Recurring)
            .options(selectinload(Recurring.category), selectinload(Recurring.account))
            .where(Recurring.active.is_(True), Recurring.next_date <= today)
            .order_by(Recurring.next_date)
        )
        .scalars()
        .all()
    )

    written = 0
    for rule in due:
        # A rule that has been asleep for months owes more than one movement, so
        # this is a loop and not a single insert. It walks forward from the due
        # date, not from today, so every missed occurrence is recorded on the day
        # it actually happened and the history reads true.
        while rule.next_date <= today:
            write_occurrence(
                db,
                account_id=rule.account_id,
                category=rule.category,
                amount=rule.amount,
                description=rule.description,
                when=rule.next_date,
            )
            rule.times_charged += 1
            rule.next_date = advance(rule.next_date, rule.frequency, rule.anchor_day)
            written += 1

    if written:
        db.commit()
    return written


def upcoming(db: Session, today: date | None = None, limit: int = UPCOMING_LIMIT) -> list[UpcomingItem]:
    """What is coming, for the dashboard.

    Only the next occurrence of each active rule. A monthly rule that is due on
    the 3rd shows up once, on the 3rd, however close that is; it does not list
    the 3rd and the 3rd of the month after as if both were news.
    """
    today = today or date.today()
    rules = (
        db.execute(
            select(Recurring)
            .options(selectinload(Recurring.category))
            .where(Recurring.active.is_(True), Recurring.next_date >= today)
            .order_by(Recurring.next_date)
            .limit(limit)
        )
        .scalars()
        .all()
    )

    items = []
    for rule in rules:
        category = rule.category
        items.append(
            UpcomingItem(
                date=rule.next_date,
                description=rule.description or (category.name if category else "Recurrente"),
                amount=to_pesos(rule.amount),
                kind="recurring",
                category=(
                    {"id": category.id, "name": category.name, "color": category.color}
                    if category
                    else None
                ),
            )
        )
    return items


def to_read(rule: Recurring) -> RecurringRead:
    category = rule.category
    return RecurringRead(
        id=rule.id,
        account_id=rule.account_id,
        category_id=rule.category_id,
        amount=to_pesos(rule.amount),
        description=rule.description,
        frequency=rule.frequency,
        next_date=rule.next_date,
        active=rule.active,
        times_charged=rule.times_charged,
        created_at=rule.created_at,
        category=(
            {"id": category.id, "name": category.name, "color": category.color}
            if category
            else None
        ),
        account_name=rule.account.name if rule.account else None,
        type=category.type if category else TransactionType.EXPENSE.value,
    )
