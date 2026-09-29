from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import AccountType
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.transaction import Transaction


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    type: Mapped[AccountType] = mapped_column(String(20), nullable=False, default=AccountType.BANK)
    # Integer centavos. See app/money.py
    initial_balance: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="account", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Account {self.id} {self.name!r}>"
