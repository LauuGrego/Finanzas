from __future__ import annotations

from enum import Enum


class TransactionType(str, Enum):
    EXPENSE = "EXPENSE"
    INCOME = "INCOME"


class CategoryType(str, Enum):
    EXPENSE = "EXPENSE"
    INCOME = "INCOME"


class AccountType(str, Enum):
    BANK = "BANK"
    WALLET = "WALLET"
    CASH = "CASH"
    CREDIT = "CREDIT"
    OTHER = "OTHER"


def enum_value(value) -> str:
    """Read an enum column as a plain string. SQLite hands them back as str."""
    return value.value if isinstance(value, Enum) else str(value)
