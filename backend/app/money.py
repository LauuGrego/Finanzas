"""Money is stored as an integer amount of minor units (centavos).

We never use float for monetary values. The database column is a BIGINT of
centavos; the API speaks decimal pesos and converts on the boundary.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import Field, PlainSerializer, WithJsonSchema

CENTS = 10**2

# Decimal pesos in the API, integer centavos in the database.
Money = Annotated[
    Decimal,
    Field(max_digits=14, decimal_places=2),
    PlainSerializer(lambda v: float(v), return_type=float, when_used="json"),
    WithJsonSchema({"type": "number", "format": "double"}),
]


def to_cents(amount: Decimal | int | str) -> int:
    """Convert decimal pesos to integer centavos, rounding half-up."""
    return int((Decimal(str(amount)) * CENTS).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def to_pesos(cents: int) -> Decimal:
    """Convert integer centavos to decimal pesos."""
    return (Decimal(cents) / CENTS).quantize(Decimal("0.01"))


def format_pesos(cents: int) -> str:
    """`100.000,00` — the shape the frontend prints with es-AR.

    The separators are the opposite of the default: in es-AR the thousands one
    is a dot and the decimal one is a comma. Done by hand rather than with
    `locale` because that depends on what the OS has installed, and a message
    that changes shape with the server's locale is worse than no grouping.
    """
    text = f"{to_pesos(cents):.2f}"
    sign = "-" if text.startswith("-") else ""
    whole, _, frac = text.lstrip("-").partition(".")
    groups = []
    while len(whole) > 3:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    groups.insert(0, whole)
    return f"{sign}{'.'.join(groups)},{frac}"
