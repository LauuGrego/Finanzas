from __future__ import annotations

import calendar
from datetime import date


def month_bounds(period: str) -> tuple[date, date]:
    """Return the first and last day of a 'YYYY-MM' period (inclusive)."""
    year, month = parse_period(period)
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def parse_period(period: str) -> tuple[int, int]:
    try:
        year_str, month_str = period.split("-")
        year, month = int(year_str), int(month_str)
    except ValueError as exc:
        raise ValueError("El periodo debe tener formato YYYY-MM") from exc
    if not 1 <= month <= 12:
        raise ValueError("El mes debe estar entre 1 y 12")
    return year, month


def format_period(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def shift_month(period: str, delta: int) -> str:
    year, month = parse_period(period)
    index = (year * 12 + (month - 1)) + delta
    return format_period(index // 12, index % 12 + 1)


def current_period(today: date | None = None) -> str:
    today = today or date.today()
    return format_period(today.year, today.month)
