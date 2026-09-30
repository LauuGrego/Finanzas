from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import Frequency
from app.models.mixins import TimestampMixin


class Recurring(Base, TimestampMixin):
    """A charge or an income that repeats on its own.

    Named `Recurring` and not `RecurringExpense` because a monthly salary is the
    most obvious thing to put here, and calling that an expense would be wrong.
    The type is not stored on this table: it comes from the category, which
    already has to be an EXPENSE or an INCOME category and has to match.

    Nothing here is a movement. This is the rule; the movements are generated
    from it when they come due, and they are ordinary transactions after that,
    editable and deletable like any other.
    """

    __tablename__ = "recurrings"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Integer centavos, always positive. See app/money.py
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    frequency: Mapped[Frequency] = mapped_column(String(10), nullable=False)
    # The day the next one is due. Generation moves this forward as it goes, so
    # after a run it is always in the future.
    next_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # The day of the month the rule was set up for, kept separately so a short
    # month does not drag the rule with it. Set on the 31st, February clamps to
    # the 28th, and March has to go back to the 31st: advancing straight from
    # `next_date` would settle on the 28th forever.
    anchor_day: Mapped[int] = mapped_column(nullable=False)
    # How many movements this rule has produced. Kept so the UI can say "van 14"
    # without counting the table, and to spot a rule that stopped firing.
    times_charged: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    account = relationship("Account")
    category = relationship("Category")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Recurring {self.id} {self.frequency} {self.amount} next={self.next_date}>"
