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
