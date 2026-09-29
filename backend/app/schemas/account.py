from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.enums import AccountType
from app.money import Money


class AccountBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: AccountType = AccountType.BANK
    initial_balance: Money = Field(default=0)


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    type: AccountType | None = None
    initial_balance: Money | None = None
    active: bool | None = None


class AccountRead(AccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    active: bool
    created_at: datetime
    balance: Money = 0


class AccountList(BaseModel):
    accounts: list[AccountRead]
    total_balance: Money
