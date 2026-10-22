from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.enums import Frequency
from app.models import Account, Category, Recurring, RecurringReminder
from app.money import to_cents
from app.services import email_service, reminder_service


def test_build_reminder_email_content(seed, session: Session):
    """Test email subjects, badges, and formatting for expense and income."""
    expense_rule = Recurring(
        account_id=seed["bank"]["id"],
        category_id=seed["food"]["id"],
        amount=to_cents(15500),
        frequency=Frequency.MONTHLY,
        next_date=date(2026, 11, 10),
        anchor_day=10,
        description="Supermercado mensual",
    )
    income_rule = Recurring(
        account_id=seed["bank"]["id"],
        category_id=seed["salary"]["id"],
        amount=to_cents(350000),
        frequency=Frequency.MONTHLY,
        next_date=date(2026, 11, 10),
        anchor_day=10,
        description="Sueldo en mano",
    )
    session.add_all([expense_rule, income_rule])
    session.commit()
    session.refresh(expense_rule)
    session.refresh(income_rule)

    # Check Expense formatting
    sub_exp, text_exp, html_exp = email_service.build_recurring_reminder_email(expense_rule)
    assert "Supermercado mensual" in sub_exp
    assert "15.500,00" in sub_exp
    assert "GASTO RECURRENTE" in text_exp
    assert "Mañana (10/11/2026)" in text_exp
    assert "15.500,00" in html_exp
    assert "GASTO RECURRENTE" in html_exp

    # Check Income formatting
    sub_inc, text_inc, html_inc = email_service.build_recurring_reminder_email(income_rule)
    assert "Sueldo en mano" in sub_inc
    assert "350.000,00" in sub_inc
    assert "INGRESO RECURRENTE" in text_inc
    assert "Mañana (10/11/2026)" in text_inc
    assert "350.000,00" in html_inc
    assert "INGRESO RECURRENTE" in html_inc


def test_check_and_send_reminders_triggers_one_day_before_and_prevents_duplicates(
    seed, session: Session, monkeypatch
):
    """A recurring due tomorrow is notified; running again does not send duplicates."""
    monkeypatch.setattr(config, "SMTP_HOST", "smtp.test.com")
    monkeypatch.setattr(config, "SMTP_USER", "test@example.com")
    monkeypatch.setattr(config, "SMTP_PASSWORD", "secret")
    monkeypatch.setattr(config, "NOTIFICATION_EMAIL", "lautaro@example.com")

    today = date(2026, 5, 10)
    tomorrow = today + timedelta(days=1)  # 2026-05-11
    in_two_days = today + timedelta(days=2)  # 2026-05-12

    # Rule due tomorrow (should be reminded)
    rule_due_tomorrow = Recurring(
        account_id=seed["bank"]["id"],
        category_id=seed["food"]["id"],
        amount=to_cents(5000),
        frequency=Frequency.MONTHLY,
        next_date=tomorrow,
        anchor_day=tomorrow.day,
        description="Internet Fibertel",
        active=True,
    )
    # Rule due in two days (should NOT be reminded yet)
    rule_due_later = Recurring(
        account_id=seed["bank"]["id"],
        category_id=seed["food"]["id"],
        amount=to_cents(12000),
        frequency=Frequency.MONTHLY,
        next_date=in_two_days,
        anchor_day=in_two_days.day,
        description="Luz Edenor",
        active=True,
    )
    # Inactive rule due tomorrow (should NOT be reminded)
    rule_inactive = Recurring(
        account_id=seed["bank"]["id"],
        category_id=seed["food"]["id"],
        amount=to_cents(3000),
        frequency=Frequency.MONTHLY,
        next_date=tomorrow,
        anchor_day=tomorrow.day,
        description="Gimnasio pausado",
        active=False,
    )
    session.add_all([rule_due_tomorrow, rule_due_later, rule_inactive])
    session.commit()

    with patch("app.services.email_service.send_email", return_value=True) as mock_send:
        # First run: should send 1 email for rule_due_tomorrow
        results = reminder_service.check_and_send_reminders(session, today=today)
        assert len(results) == 1
        assert results[0]["recurring_id"] == rule_due_tomorrow.id
        assert results[0]["sent"] is True
        assert results[0]["due_date"] == tomorrow.isoformat()
        assert mock_send.call_count == 1

        # Check DB recorded the reminder
        reminders = session.execute(select(RecurringReminder)).scalars().all()
        assert len(reminders) == 1
        assert reminders[0].recurring_id == rule_due_tomorrow.id
        assert reminders[0].due_date == tomorrow

        # Second run on the same day: should NOT send again (0 duplicates)
        results2 = reminder_service.check_and_send_reminders(session, today=today)
        assert len(results2) == 0
        assert mock_send.call_count == 1  # Still 1, no new call


def test_reminder_endpoints(client: TestClient, seed, monkeypatch):
    """Test POST /api/recurring/reminders/send and /test endpoints."""
    monkeypatch.setattr(config, "SMTP_HOST", "smtp.test.com")
    monkeypatch.setattr(config, "SMTP_USER", "test@example.com")
    monkeypatch.setattr(config, "SMTP_PASSWORD", "secret")
    monkeypatch.setattr(config, "NOTIFICATION_EMAIL", "lautaro@example.com")

    # Create a recurring due 2026-06-15
    client.post(
        "/api/recurring",
        json={
            "account_id": seed["bank"]["id"],
            "category_id": seed["salary"]["id"],
            "amount": 250000,
            "frequency": "MONTHLY",
            "next_date": "2026-06-15",
            "description": "Honorarios",
        },
    )

    with patch("app.services.email_service.send_email", return_value=True) as mock_send:
        # 1 day before is 2026-06-14
        res = client.post("/api/recurring/reminders/send?today=2026-06-14")
        assert res.status_code == 200
        data = res.json()
        assert data["checked"] is True
        assert len(data["results"]) == 1
        assert data["results"][0]["description"] == "Honorarios"
        assert data["results"][0]["sent"] is True
        assert mock_send.call_count == 1

        # Test endpoint /reminders/test
        test_res = client.post("/api/recurring/reminders/test")
        assert test_res.status_code == 200
        assert test_res.json()["ok"] is True
        assert mock_send.call_count == 2


def test_cron_secret_bypass(client: TestClient, monkeypatch):
    """External monitor can authenticate using cron_secret without password cookie."""
    monkeypatch.setattr(config, "PASSWORD", "super-secret-password")
    monkeypatch.setattr(config, "CRON_SECRET", "my-cron-token-123")

    # Without token -> 401
    res_no_auth = client.post("/api/recurring/reminders/send")
    assert res_no_auth.status_code == 401

    # With header x-cron-secret -> 200
    res_header = client.post(
        "/api/recurring/reminders/send",
        headers={"x-cron-secret": "my-cron-token-123"},
    )
    assert res_header.status_code == 200

    # With query param cron_secret -> 200
    res_query = client.get(
        "/api/recurring/reminders/send?cron_secret=my-cron-token-123",
    )
    assert res_query.status_code == 200
