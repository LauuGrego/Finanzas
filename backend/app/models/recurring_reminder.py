from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RecurringReminder(Base):
    """Track reminder emails sent for recurring rules.

    Avoids sending duplicate emails if the check runs repeatedly on the same day.
    """

    __tablename__ = "recurring_reminders"
    __table_args__ = (
        UniqueConstraint("recurring_id", "due_date", name="uq_recurring_due_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    recurring_id: Mapped[int] = mapped_column(
        ForeignKey("recurrings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    recurring = relationship("Recurring")
