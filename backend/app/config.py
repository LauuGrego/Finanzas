"""Runtime settings, read once from the environment.

Everything but the database has a development default so `uvicorn app.main:app`
keeps working with no setup. In a deployment the variables that matter are:

    DATABASE_URL       PostgreSQL. Required: no default, on purpose.
    FINANZAS_PASSWORD  turns on HTTP Basic auth (leave unset to disable it)
    FINANZAS_STATIC    where the built frontend lives
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


def _path(value: str | None, default: Path) -> Path:
    return Path(value).expanduser().resolve() if value else default


# Frontend
STATIC_DIR = _path(os.getenv("FINANZAS_STATIC"), REPO_DIR / "frontend" / "dist")

# Autenticación
PASSWORD = os.getenv("FINANZAS_PASSWORD", "")
USERNAME = os.getenv("FINANZAS_USER", "lautaro")

# CORS
def _origins() -> list[str]:
    raw = os.getenv("FINANZAS_CORS")
    if raw is None:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


CORS_ORIGINS = _origins()

# Base de datos
DATABASE_URL = os.getenv("DATABASE_URL", "")


def _database_url() -> str:
    """The connection string, or a message that says what to do.

    Read at call time rather than at import: `config` is imported by everything,
    and a missing variable should point at the one thing to fix instead of taking
    the whole process down with a bare `AttributeError` deep inside the engine.
    """
    if not DATABASE_URL:
        raise RuntimeError(
            "Falta DATABASE_URL.\n\n"
            "  En desarrollo:  docker compose up -d\n"
            "                  y exportá "
            "DATABASE_URL=postgresql+psycopg://finanzas:finanzas@127.0.0.1:5434/finanzas\n"
            "  En la nube:      la variable ya está puesta en Render."
        )
    return DATABASE_URL

# Sesión
SESSION_TTL_DAYS = int(os.getenv("FINANZAS_SESSION_DAYS", "30"))

# Email reminders (SMTP)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER", "")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() in ("true", "1", "yes")
NOTIFICATION_EMAIL = os.getenv("NOTIFICATION_EMAIL") or os.getenv("SMTP_USER", "")
CRON_SECRET = os.getenv("CRON_SECRET", "")


