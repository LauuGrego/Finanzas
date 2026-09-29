from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import CategoryType
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.transaction import Transaction


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    type: Mapped[CategoryType] = mapped_column(String(20), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(40), nullable=True)

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="category", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Category {self.id} {self.name!r} {self.type}>"
