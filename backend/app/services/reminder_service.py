from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import config
from app.models import Recurring, RecurringReminder
from app.money import to_pesos
from app.services import email_service

logger = logging.getLogger("finanzas.reminders")


def check_and_send_reminders(db: Session, today: date | None = None) -> list[dict]:
    """Find active recurring rules that are due tomorrow and send reminder emails.

    Avoids duplicate emails: if a reminder was already recorded for
    (recurring_id, due_date), it is skipped.
    """
    today = today or date.today()
    target_date = today + timedelta(days=1)
    recipient = config.NOTIFICATION_EMAIL or config.SMTP_USER

    due_tomorrow = (
        db.execute(
            select(Recurring)
            .options(selectinload(Recurring.category), selectinload(Recurring.account))
            .where(Recurring.active.is_(True), Recurring.next_date == target_date)
            .order_by(Recurring.id)
        )
        .scalars()
        .all()
    )

    if not due_tomorrow:
        return []

    recurring_ids = [rule.id for rule in due_tomorrow]
    sent_reminders = set(

        db.execute(
            select(RecurringReminder.recurring_id).where(
                RecurringReminder.recurring_id.in_(recurring_ids),
                RecurringReminder.due_date == target_date,
            )
        )
        .scalars()
        .all()
    )

    results: list[dict] = []

    for rule in due_tomorrow:
        if rule.id in sent_reminders:
            continue

        item_info = {
            "recurring_id": rule.id,
            "description": rule.description or (rule.category.name if rule.category else "Recurrente"),
            "amount": float(to_pesos(rule.amount)),
            "due_date": rule.next_date.isoformat(),
            "type": rule.category.type if rule.category else "EXPENSE",
            "recipient": recipient,
        }

        if not email_service.is_smtp_configured() or not recipient:
            logger.warning(
                "No se pudo enviar recordatorio para recurrente #%d: SMTP o email destino no configurado.",
                rule.id,
            )
            item_info["sent"] = False
            item_info["reason"] = "SMTP no configurado"
            results.append(item_info)
            continue

        # Reserve the reminder entry first in a subtransaction to prevent duplicate sends under concurrency
        reminder_entry = RecurringReminder(recurring_id=rule.id, due_date=rule.next_date)
        try:
            with db.begin_nested():
                db.add(reminder_entry)
                db.flush()
        except IntegrityError:
            logger.info("Recordatorio ya registrado concurrentemente para recurrente #%d", rule.id)
            continue

        subject, text_content, html_content = email_service.build_recurring_reminder_email(rule)
        sent = email_service.send_email(
            to_email=recipient,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

        if sent:
            db.commit()
            item_info["sent"] = True
            results.append(item_info)
        else:
            db.delete(reminder_entry)
            db.commit()
            item_info["sent"] = False
            item_info["reason"] = "Error al enviar correo por SMTP"
            results.append(item_info)

    return results


def send_test_email(to_email: str | None = None) -> dict:
    """Send a test email to verify SMTP settings."""
    recipient = to_email or config.NOTIFICATION_EMAIL or config.SMTP_USER
    if not recipient:
        return {
            "ok": False,
            "error": "No hay un correo destinatario configurado (NOTIFICATION_EMAIL o SMTP_USER).",
        }

    if not email_service.is_smtp_configured():
        return {
            "ok": False,
            "error": "Faltan variables de configuración de SMTP (SMTP_HOST, SMTP_USER o SMTP_PASSWORD).",
        }

    subject = "Agenda Financiera - Verificación de correo"
    text_content = (
        "¡Hola! Este es un correo de prueba desde tu Agenda Financiera.\n"
        "La configuración SMTP está funcionando correctamente."
    )
    html_content = """<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 24px; background-color: #0f172a; font-family: sans-serif; color: #f8fafc;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #1e293b; padding: 24px; border-radius: 12px; border: 1px solid #334155; text-align: center;">
    <h2 style="color: #4ade80; margin-top: 0;">✓ Configuración correcta</h2>
    <p style="color: #cbd5e1; font-size: 15px;">Tu Agenda Financiera está lista para enviar recordatorios por correo un día antes de cada vencimiento.</p>
  </div>
</body>
</html>
"""

    ok = email_service.send_email(
        to_email=recipient,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )

    if ok:
        return {"ok": True, "recipient": recipient, "message": "Correo de prueba enviado con éxito."}
    return {
        "ok": False,
        "recipient": recipient,
        "error": "No se pudo enviar el correo. Revisá los logs del servidor para más detalles.",
    }
