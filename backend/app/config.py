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

# The frontend is served from the same origin in production, so CORS is only
# needed for the Vite dev server. `FINANZAS_CORS=*` opens it up if a separate
# frontend host is ever used.
def _origins() -> list[str]:
    raw = os.getenv("FINANZAS_CORS")
    if raw is None:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    return [item.strip() for item in raw.split(",") if item.strip()]


CORS_ORIGINS = _origins()
