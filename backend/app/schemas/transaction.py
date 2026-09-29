from __future__ import annotations

from datetime import date, datetime
from datetime import date as date_type

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.enums import TransactionType
from app.money import Money


class TransactionBase(BaseModel):
    account_id: int
    category_id: int | None = None
    type: TransactionType
    amount: Money = Field(gt=0, description="Always positive; direction comes from `type`")
    description: str | None = Field(default=None, max_length=200)
    date: date_type


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    type: TransactionType | None = None
    amount: Money | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=200)
    date: date_type | None = None


class CategoryRef(BaseModel):
    id: int
    name: str
    icon: str | None = None


class TransactionRead(TransactionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transfer_id: str | None = None
    created_at: datetime
    category: CategoryRef | None = None
    account_name: str | None = None
    signed_amount: Money = 0


class TransactionPage(BaseModel):
    items: list[TransactionRead]
    total: int
    limit: int
    offset: int


class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: Money = Field(gt=0)
    description: str | None = Field(default=None, max_length=200)
    date: date

    @model_validator(mode="after")
    def _different_accounts(self) -> "TransferCreate":
        if self.from_account_id == self.to_account_id:
            raise ValueError("Las cuentas de origen y destino deben ser distintas")
        return self


class TransferRead(BaseModel):
    transfer_id: str
    date: date
    amount: Money
    description: str | None = None
    from_account: CategoryRef
    to_account: CategoryRef
    movements: list[TransactionRead]
