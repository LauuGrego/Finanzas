"""Turning recurring rules into real movements.

A `Recurring` row is a rule, not a movement. When its day comes the rule fires
and writes an ordinary `Transaction`, which from that moment on is editable and
deletable like any other. The rule only knows when to fire next.

The catch-up in `generate_due` is what makes a phone-only app practical: the
server sleeps, so there is no cron to run, and a rule can come due many times
before anyone opens the app. Every occurrence that was missed is written.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.enums import TransactionType
from app.models import Account, Category, Recurring, Transaction
from app.money import to_pesos
from app.schemas.recurring import RecurringRead
from app.schemas.reports import UpcomingItem

# How many future occurrences the dashboard shows. The plan drew three.
UPCOMING_LIMIT = 5


def advance(day: date, frequency: str, anchor_day: int) -> date:
    """The next day this rule fires, from the day it was due.

    Monthly advances by calendar month, not by adding 30 days, so the 1st stays
    the 1st. `anchor_day` is the day the person originally asked for, which
    matters because `day` may already be clamped: from the 28th of February the
    next one is the 31st of March, not the 28th.
    """
    if frequency == "WEEKLY":
        return day + timedelta(days=7)

    # Walk by calendar month. Counting months from year zero keeps the
    # arithmetic from having to care how long any month happens to be, and the
    # clamp at the end handles the short ones.
    absolute = day.year * 12 + (day.month - 1) + 1
    year, month_index = divmod(absolute, 12)
    month = month_index + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(anchor_day, last))


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
            _write(db, rule)
            rule.times_charged += 1
            rule.next_date = advance(rule.next_date, rule.frequency, rule.anchor_day)
            written += 1

    if written:
        db.commit()
    return written


def _write(db: Session, rule: Recurring) -> Transaction:
    """Create the movement for one occurrence of a rule.

    Deliberately does not go through `transaction_service.create_transaction`,
    which refuses to spend more than the account holds. That check exists to
    catch a mistyped amount while you are typing it; a subscription is not a
    typo, it already got charged, and refusing to record it would leave the
    balance lying. So the charge goes through and the account may end up in the
    red, which is the truth about what happened.
    """
    kind = (
        TransactionType.INCOME
        if rule.category.type == "INCOME"
        else TransactionType.EXPENSE
    )
    movement = Transaction(
        account_id=rule.account_id,
        category_id=rule.category_id,
        type=kind,
        amount=rule.amount,
        description=rule.description,
        date=rule.next_date,
    )
    db.add(movement)
    return movement


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


def resolve_references(db: Session, account_id: int, category_id: int) -> None:
    """Check the account and category exist and can still be used.

    Raises ValueError, which the router turns into a 422, the same way the
    transaction service reports the same two problems.
    """
    account = db.get(Account, account_id)
    if account is None:
        raise ValueError(f"La cuenta '{account_id}' no existe")
    if not account.active:
        raise ValueError(f"La cuenta '{account.name}' está dada de baja")

    category = db.get(Category, category_id)
    if category is None:
        raise ValueError(f"La categoría '{category_id}' no existe")
    if not category.active:
        raise ValueError(f"La categoría '{category.name}' está dada de baja")
