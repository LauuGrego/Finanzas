from __future__ import annotations

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Installment(Base, TimestampMixin):
    """A purchase paid in a fixed number of monthly installments.

    Structurally it is a `Recurring` with a count: it fires once a month and
    stops by itself when the last one is charged. It is a separate table rather
    than a nullable counter on `recurrings` for two reasons. One is that adding
    a column to an existing table is a migration, and on the free tier there is
    no migration step: `create_all` creates missing tables and nothing else, so
    a new table is free and a new column is not. The other is that a rule that
    never ends and a plan that ends are read differently, and the difference is
    worth keeping out of every recurring query.

    Nothing here is a movement. This is the plan; the movements are generated
    from it when they come due and they are ordinary transactions after that.

    Installments are monthly by definition -- that is what a "cuota" is -- so
    there is no frequency column here.

    `amount` is what is charged each month, not the total. That is how the card
    statement reads ("12 cuotas de 50.000") and it is the only form that is
    exact: a total that does not divide evenly would leave cents that cannot be
    represented in the per-installment amount. The total is derived.
    """

    __tablename__ = "installments"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_count: Mapped[int] = mapped_column(nullable=False)
    paid_count: Mapped[int] = mapped_column(nullable=False, default=0)
    next_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    anchor_day: Mapped[int] = mapped_column(nullable=False)

    account = relationship("Account")

    category = relationship("Category")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"<Installment {self.id} {self.paid_count}/{self.total_count} "
            f"{self.amount} next={self.next_date}>"
        )
