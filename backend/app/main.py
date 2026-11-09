from __future__ import annotations

import asyncio
import hmac
import logging
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import auth, config
from app.database import Base, SessionLocal, engine, sync_sequences
from app.enums import AccountType, CategoryType
from app.models import Account, Category
from app.routers import (
    accounts,
    budget,
    categories,
    dashboard,
    goal,
    installment,
    recurring,
    transactions,
    transfers,
)
from app.services import reminder_service

# Categorías y cuentas por defecto
DEFAULT_CATEGORIES: list[tuple[str, CategoryType, str]] = [
    ("Comida", CategoryType.EXPENSE, "#d98c2b"),
    ("Transporte", CategoryType.EXPENSE, "#8b98a5"),
    ("Servicios", CategoryType.EXPENSE, "#5fb8cf"),
    ("Entretenimiento", CategoryType.EXPENSE, "#a98cc4"),
    ("Compras", CategoryType.EXPENSE, "#d4655d"),
    ("Salud", CategoryType.EXPENSE, "#6fae7a"),
    ("Otros", CategoryType.EXPENSE, "#a8b04e"),
    ("Sueldo", CategoryType.INCOME, "#c9a227"),
    ("Freelance", CategoryType.INCOME, "#c47d4a"),
    ("Otros ingresos", CategoryType.INCOME, "#c9707f"),
]

DEFAULT_ACCOUNTS: list[tuple[str, AccountType]] = [
    ("Banco", AccountType.BANK),
    ("Billetera virtual", AccountType.WALLET),
    ("Efectivo", AccountType.CASH),
]



def seed_defaults(db: Session, *, with_accounts: bool = True) -> None:
    """Fill an empty database with a starting set. Idempotent.

    Both blocks are gated on the table being empty rather than on missing
    names, so an account the user deliberately deactivated or deleted is not
    resurrected on the next start.
    """
    if db.scalar(select(func.count(Category.id))) == 0:
        db.add_all(
            Category(name=name, type=type_, color=color)
            for name, type_, color in DEFAULT_CATEGORIES
        )
        db.commit()
    if with_accounts and db.scalar(select(func.count(Account.id))) == 0:
        db.add_all(
            Account(name=name, type=type_, initial_balance=0)
            for name, type_ in DEFAULT_ACCOUNTS
        )
        db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        try:
            sync_sequences(db)
        except Exception:
            logger.exception("No se pudieron sincronizar las secuencias de Postgres")
        seed_defaults(db)
        try:
            reminder_service.check_and_send_reminders(db)
        except Exception:
            logger.exception("No se pudieron verificar los recordatorios en el arranque")

    async def _periodic_reminders_worker():
        while True:
            try:
                await asyncio.sleep(3600)
                with SessionLocal() as db:
                    reminder_service.check_and_send_reminders(db)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error en la verificación periódica de recordatorios")

    worker_task = asyncio.create_task(_periodic_reminders_worker())
    try:
        yield
    finally:
        worker_task.cancel()


app = FastAPI(
    title="Agenda Financiera",
    description="API personal para llevar cuentas, movimientos y saldos en el tiempo.",
    version="0.1.0",
    lifespan=lifespan,
)

OPEN_PATHS = frozenset(
    {"/api/health", "/api/login", "/api/logout", "/api/session", "/docs", "/openapi.json"}
)


def is_secure(request: Request) -> bool:
    """Whether the client reached us over HTTPS, even behind a proxy.

    Render terminates TLS and forwards X-Forwarded-Proto, so request.url.scheme
    alone would read http and the cookie would come back SameSite=Lax, which
    the browser then drops on the cross-site call from Vercel.
    """
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


logger = logging.getLogger("finanzas")


# Middleware
@app.middleware("http")
async def readable_failures(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Fallo sin manejar en %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Error interno del servidor."},
        )


@app.middleware("http")
async def require_session(request: Request, call_next):
    """Gate every API call behind the password, when one is configured.

    Off by default so local development needs no setup. The public URL of a free
    tier is exactly the case it exists for: without it, a financial history is
    one guessed path away.
    """
    if not config.PASSWORD:
        return await call_next(request)

    path = request.url.path
    # Allow static assets and SPA shell through so the login UI can render.
    # Protected financial data lives entirely under /api/*.
    if not path.startswith("/api") or path in OPEN_PATHS:
        return await call_next(request)

    if config.CRON_SECRET:
        token = request.headers.get("x-cron-secret")
        if token and hmac.compare_digest(token, config.CRON_SECRET):
            return await call_next(request)

    if auth.verify(request.cookies.get(auth.COOKIE)) or auth.check_basic(
        request.headers.get("authorization", "")
    ):
        return await call_next(request)

    return JSONResponse(
        status_code=401,
        content={"detail": "Necesitás iniciar sesión."},
    )


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Rate limiting en memoria para /api/login por IP
LOGIN_ATTEMPTS: dict[str, list[float]] = {}
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 60


def check_login_rate_limit(ip: str) -> None:
    now = time.time()
    attempts = [t for t in LOGIN_ATTEMPTS.get(ip, []) if now - t < LOGIN_WINDOW_SECONDS]
    if len(attempts) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos fallidos. Esperá un minuto antes de reintentar.",
        )
    LOGIN_ATTEMPTS[ip] = attempts


def record_login_failure(ip: str) -> None:
    now = time.time()
    attempts = [t for t in LOGIN_ATTEMPTS.get(ip, []) if now - t < LOGIN_WINDOW_SECONDS]
    attempts.append(now)
    LOGIN_ATTEMPTS[ip] = attempts


def reset_login_attempts(ip: str) -> None:
    LOGIN_ATTEMPTS.pop(ip, None)


class LoginRequest(BaseModel):
    password: str


@app.post("/api/login", tags=["meta"])
def login(payload: LoginRequest, request: Request, response: Response) -> dict[str, bool]:
    """Check the password and hand back a signed session cookie.

    Deliberately does not say how wrong it was, and answers the same way for an
    unknown user, so the endpoint cannot be used to test passwords.
    """
    client_ip = request.client.host if request.client else "unknown"
    check_login_rate_limit(client_ip)
    if config.PASSWORD and not hmac.compare_digest(payload.password, config.PASSWORD):
        record_login_failure(client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Clave incorrecta")
    reset_login_attempts(client_ip)
    auth.issue_cookie(response, secure=is_secure(request))
    return {"ok": True}


@app.post("/api/logout", tags=["meta"])
def logout(request: Request, response: Response) -> dict[str, bool]:
    auth.clear_cookie(response, secure=is_secure(request))
    return {"ok": True}


@app.get("/api/session", tags=["meta"])
def session(request: Request) -> dict[str, str | bool]:
    """Tell the frontend whether the cookie is still good, and where data lives.

    Answers 200 either way instead of 401, so the app can decide between the
    login screen and the dashboard without treating "not logged in" as an error.

    `storage` is here because the frontend cannot tell it on its own: whether
    `VITE_API_URL` is set says who serves the API, not what the data lives in.
    `password_required` says whether there is a session to end.
    """
    return {
        "authenticated": (
            True if not config.PASSWORD else auth.verify(request.cookies.get(auth.COOKIE))
        ),
        "storage": engine.dialect.name,
        "password_required": bool(config.PASSWORD),
    }


# Routers
for router in (
    accounts,
    categories,
    transactions,
    transfers,
    dashboard,
    recurring,
    installment,
    budget,
    goal,
):
    app.include_router(router.router, prefix="/api")


@app.api_route("/api/health", methods=["GET", "HEAD"], tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# The frontend
STATIC = config.STATIC_DIR


def _spa_response(request: Request) -> Response:
    """Serve a real file if it exists, otherwise index.html.

    The SPA owns the routes, so /agenda has to come back as index.html and let
    React Router sort it out. Anything that does exist is served as-is.
    """
    index = STATIC / "index.html"
    if not index.is_file():
        return PlainTextResponse(
            "El frontend no está compilado.\n\n"
            "Corré `npm run build` en la carpeta frontend.\n"
            f"Se lo busca en: {STATIC}\n",
            status_code=503,
        )

    relative = request.path_params.get("path", "")
    candidate = (STATIC / relative).resolve()
    if relative and candidate.is_relative_to(STATIC) and candidate.is_file():
        return FileResponse(candidate)

    return FileResponse(index, headers={"Cache-Control": "no-cache"})


if (STATIC / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")



@app.get("/{path:path}", include_in_schema=False)
def spa(path: str, request: Request) -> Response:
    return _spa_response(request)
