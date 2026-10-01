from __future__ import annotations

from datetime import date

from sqlalchemy import BigInteger, Date, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class Goal(Base, TimestampMixin):
    """Something you are saving for.

    `current_amount` is typed by hand on purpose. Linking it to movements would
    mean deciding which income funds which goal, and that is bookkeeping this
    app does not do: a goal is a promise, not a transaction.

    `deadline` is optional and never enforced. A date that passed makes the goal
    late, not invalid, and a goal with no date at all is perfectly normal.
    """

    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Integer centavos, like every other amount in the database.
    target_amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Zero is fine: plenty of goals start the day they are created.
    current_amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Goal {self.id} {self.name} {self.current_amount}/{self.target_amount}>"
