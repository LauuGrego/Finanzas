"""What a recurring rule and an installment plan have in common.

Both are rules that turn into ordinary movements on a date, and both have to
walk that date forward the same way. They live together instead of duplicated
because these are exactly the two details where a divergence would be a bug
that is hard to find: the end-of-month clamp and the moment a movement is
written.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.enums import TransactionType
from app.models import Account, Category, Transaction

# How many future commitments the dashboard shows. The plan drew three.
UPCOMING_LIMIT = 5


def advance_month(day: date, anchor_day: int) -> date:
    """The same day of the next calendar month, clamped to its last day.

    Counting months from year zero keeps the arithmetic from having to care how
    long any month happens to be, and the clamp at the end handles the short
    ones. `anchor_day` is the day that was originally asked for, which matters
    because `day` may already be clamped: from the 28th of February the next one
    is the 31st of March, not the 28th.
    """
    absolute = day.year * 12 + (day.month - 1) + 1
    year, month_index = divmod(absolute, 12)
    month = month_index + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(anchor_day, last))


def advance(day: date, frequency: str, anchor_day: int) -> date:
    """The next day this rule fires, from the day it was due.

    Monthly advances by calendar month, not by adding 30 days, so the 1st stays
    the 1st. Weekly is the only other cadence, and it is a plain seven days.
    """
    if frequency == "WEEKLY":
        return day + timedelta(days=7)
    return advance_month(day, anchor_day)


def write_occurrence(
    db: Session,
    *,
    account_id: int,
    category: Category,
    amount: int,
    description: str | None,
    when: date,
) -> Transaction:
    """Create the movement for one occurrence of a rule.

    Deliberately does not go through `transaction_service.create_transaction`,
    which refuses to spend more than the account holds. That check exists to
    catch a mistyped amount while you are typing it; a subscription or an
    already-charged installment is not a typo, and refusing to record it would
    leave the balance lying. So the charge goes through and the account may end
    up in the red, which is the truth about what happened.

    The type is not chosen separately: the category decides it, since it is
    already an EXPENSE or an INCOME category.
    """
    kind = (
        TransactionType.INCOME
        if category.type == "INCOME"
        else TransactionType.EXPENSE
    )
    movement = Transaction(
        account_id=account_id,
        category_id=category.id,
        type=kind,
        amount=amount,
        description=description,
        date=when,
    )
    db.add(movement)
    return movement


def resolve_references(db: Session, account_id: int, category_id: int) -> None:
    """Check the account and category exist and can still be used.

    Raises ValueError, which the routers turn into a 422, the same treatment the
    transaction service gives these two problems.
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
