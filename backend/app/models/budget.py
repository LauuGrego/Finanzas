from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Budget(Base, TimestampMixin):
    """Monthly budget limit for a given category.

    One budget per (category_id, year, month). Amount is stored in centavos.
    The "repetir por 12 meses" is handled at creation time (create 12 rows),
    not by a separate recurrence field.
    """

    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("category_id", "year", "month", name="uq_budgets_category_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Period in 'YYYY-MM' form is convenient for queries; we also store ints
    period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    # Integer centavos
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)

    category = relationship("Category")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Budget {self.id} cat={self.category_id} {self.period} {self.amount}>"
