from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import TYPE_CHECKING

from app import config
from app.money import format_pesos

if TYPE_CHECKING:
    from app.models.recurring import Recurring

logger = logging.getLogger("finanzas.email")


def is_smtp_configured() -> bool:
    """Return True if the minimum required SMTP credentials are set."""
    return bool(config.SMTP_HOST and config.SMTP_USER and config.SMTP_PASSWORD)


def send_email(
    *,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
) -> bool:
    """Send an email via SMTP.

    Returns True if sent successfully, or False if configuration is missing
    or sending failed.
    """
    if not is_smtp_configured():
        logger.warning("SMTP no está configurado. No se envió el correo a %s.", to_email)
        return False

    sender = config.SMTP_FROM or config.SMTP_USER
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Agenda Financiera <{sender}>"
    msg["To"] = to_email

    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        if config.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as server:
                server.login(config.SMTP_USER, config.SMTP_PASSWORD)
                server.sendmail(sender, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as server:
                if config.SMTP_USE_TLS:
                    server.starttls()
                server.login(config.SMTP_USER, config.SMTP_PASSWORD)
                server.sendmail(sender, [to_email], msg.as_string())

        logger.info("Correo enviado exitosamente a %s: %s", to_email, subject)
        return True
    except Exception as exc:
        logger.exception("Error al enviar correo SMTP a %s: %s", to_email, exc)
        return False


def build_recurring_reminder_email(rule: Recurring) -> tuple[str, str, str]:
    """Build subject, plain-text body, and responsive HTML email for a recurring rule."""
    is_income = rule.category and rule.category.type == "INCOME"
    kind_text = "Ingreso" if is_income else "Gasto"
    kind_badge = "INGRESO RECURRENTE" if is_income else "GASTO RECURRENTE"
    badge_bg = "#15803d" if is_income else "#b91c1c"
    badge_color = "#ffffff"
    amount_str = f"$ {format_pesos(rule.amount)}"

    concept = rule.description or (rule.category.name if rule.category else "Recurrente")
    category_name = rule.category.name if rule.category else "Sin categoría"
    category_color = rule.category.color if rule.category else "#64748b"
    account_name = rule.account.name if rule.account else "Cuenta principal"
    due_date_str = rule.next_date.strftime("%d/%m/%Y")
    frequency_str = "Mensual" if rule.frequency == "MONTHLY" else "Semanal"

    if is_income:
        subject = f"💰 Recordatorio: Mañana ingresa {concept} ({amount_str})"
    else:
        subject = f"🔔 Recordatorio: Mañana vence {concept} ({amount_str})"

    text_content = f"""Recordatorio de Agenda Financiera
=====================================
Tipo: {kind_badge}
Concepto: {concept}
Monto: {amount_str}
Fecha de impacto: Mañana ({due_date_str})
Cuenta: {account_name}
Categoría: {category_name}
Frecuencia: {frequency_str}

Este es un recordatorio automático de tu Agenda Financiera.
"""

    html_content = f"""<!DOCTYPE html>

<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);">
    <!-- Header -->
    <tr>
      <td style="padding: 24px 28px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-bottom: 1px solid #334155;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <span style="display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; border-radius: 9999px; background-color: {badge_bg}; color: {badge_color};">
                {kind_badge}
              </span>
              <h1 style="margin: 12px 0 4px 0; font-size: 20px; font-weight: 600; color: #f8fafc;">
                Vence mañana
              </h1>
              <p style="margin: 0; font-size: 14px; color: #94a3b8;">
                {concept}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Amount Card -->
    <tr>
      <td style="padding: 24px 28px 12px 28px;">
        <div style="background-color: #0f172a; border-radius: 12px; padding: 18px 20px; border: 1px solid #334155; text-align: center;">
          <div style="font-size: 12px; font-weight: 500; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
            Monto a {'cobrar' if is_income else 'pagar'}
          </div>
          <div style="font-size: 32px; font-weight: 700; color: {'#4ade80' if is_income else '#f87171'}; letter-spacing: -0.02em;">
            {amount_str}
          </div>
        </div>
      </td>
    </tr>

    <!-- Details -->
    <tr>
      <td style="padding: 12px 28px 24px 28px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="8" style="font-size: 14px; color: #cbd5e1;">
          <tr style="border-bottom: 1px solid #334155;">
            <td style="color: #94a3b8; padding: 10px 0;">Fecha programada</td>
            <td align="right" style="font-weight: 600; color: #f8fafc; padding: 10px 0;">Mañana ({due_date_str})</td>
          </tr>
          <tr style="border-bottom: 1px solid #334155;">
            <td style="color: #94a3b8; padding: 10px 0;">Categoría</td>
            <td align="right" style="padding: 10px 0;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: {category_color}; margin-right: 6px;"></span>
              <span style="font-weight: 500; color: #f8fafc;">{category_name}</span>
            </td>
          </tr>
          <tr style="border-bottom: 1px solid #334155;">
            <td style="color: #94a3b8; padding: 10px 0;">Cuenta</td>
            <td align="right" style="font-weight: 500; color: #f8fafc; padding: 10px 0;">{account_name}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 10px 0;">Frecuencia</td>
            <td align="right" style="font-weight: 500; color: #f8fafc; padding: 10px 0;">{frequency_str}</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 16px 28px 24px 28px; background-color: #0f172a; border-top: 1px solid #334155; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
          Agenda Financiera &bull; Recordatorio automático de vencimientos
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return subject, text_content, html_content
