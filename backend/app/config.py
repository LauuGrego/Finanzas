"""Runtime settings, read once from the environment.

Everything has a development default so `uvicorn app.main:app` keeps working
with no setup. In a deployment the three variables that matter are:

    FINANZAS_DB        where the SQLite file lives
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


# The database is a single file. On a server it belongs outside the repo, in a
# directory that gets backed up, hence the env var.
DB_PATH = _path(os.getenv("FINANZAS_DB"), BACKEND_DIR / "finance.db")

# Where `npm run build` puts the frontend. If it is missing the API still
# serves; only the browser UI is unavailable.
STATIC_DIR = _path(os.getenv("FINANZAS_STATIC"), REPO_DIR / "frontend" / "dist")

# Empty means no auth. Set it before exposing the app to a network.
PASSWORD = os.getenv("FINANZAS_PASSWORD", "")
USERNAME = os.getenv("FINANZAS_USER", "lautaro")

# El frontend puede venir de otro dominio, que es lo que pasa en el deploy
# partido: Vercel sirve la app y Render solo la API. Son dos orígenes distintos,
# asi que CORS no es opcional ahi. Sin esto el navegador manda un preflight que
# Render rechaza con "Disallowed CORS origin" y el fetch falla entero, que es lo
# que pasa si la variable queda sin poner. Varios origins van separados por coma.
# `*` abre todo, pero con credenciales el navegador lo va a rechazar igual, asi
# que conviene poner el origin exacto.
#
# La comparacion de CORSMiddleware es de cadena exacta, asi que se saca la barra
# final: un origin por definicion no la lleva y es el error que mas se cuela al
# copiar la URL del navegador, que siempre viene con barra.
def _origins() -> list[str]:
    raw = os.getenv("FINANZAS_CORS")
    if raw is None:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


CORS_ORIGINS = _origins()

# The database connection. Leave it unset to keep using the local SQLite file,
# which is what development and the test suite do. In the cloud it points at the
# managed PostgreSQL, because a free-tier app host has no persistent disk.
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Render and Vercel are different sites, so the session cookie has to be
# SameSite=None to survive the cross-origin call. Browsers only accept that
# over HTTPS, which is why the flag is decided per request instead of in config.
# See app/auth.py.
SESSION_TTL_DAYS = int(os.getenv("FINANZAS_SESSION_DAYS", "30"))
