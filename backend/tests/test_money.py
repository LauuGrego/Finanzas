from __future__ import annotations

import pytest

from app.money import format_pesos, to_cents, to_pesos


@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (0, "0,00"),
        (5, "0,05"),
        (99, "0,99"),
        (100, "1,00"),
        # The thousands separator is a dot in es-AR, which is the opposite of the
        # default, and the decimal one is a comma.
        (100000, "1.000,00"),
        (100001, "1.000,01"),
        (123456789, "1.234.567,89"),
        (100000000000, "1.000.000.000,00"),
    ],
)
def test_pesos_are_grouped_the_way_the_frontend_prints_them(cents, expected):
    assert format_pesos(cents) == expected


@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (-5, "-0,05"),
        (-123456, "-1.234,56"),
        (-100000, "-1.000,00"),
    ],
)
def test_a_negative_amount_keeps_the_sign_outside_the_grouping(cents, expected):
    """The minus goes in front of the groups, not inside them."""
    assert format_pesos(cents) == expected


def test_cents_survive_the_round_trip():
    """The formatter must not be where precision gets lost."""
    for cents in (0, 1, 7, 99, 100, 12345, 99999999):
        assert to_cents(to_pesos(cents)) == cents


def test_amounts_are_rounded_half_up_and_never_truncated():
    assert to_cents("10.005") == 1001
    assert to_cents("10.004") == 1000
    assert to_cents(10) == 1000
