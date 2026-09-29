from __future__ import annotations

import base64
import hmac
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import config
from app.database import Base, SessionLocal, engine
from app.enums import AccountType, CategoryType
from app.models import Account, Category
from app.routers import accounts, categories, dashboard, transactions, transfers

# Colours pulled toward the armour palette: copper, steel, arc cyan, gold.
# Ten hues that stay separable inside a pie chart, none of them neon.
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

# The three places money actually sits: physical, bank and virtual wallet.
# Starting balances are zero on purpose: whatever was there before the app
# existed belongs in `initial_balance` the first time the user touches it.
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
        seed_defaults(db)
    yield


app = FastAPI(
    title="Agenda Financiera",
    description="API personal para llevar cuentas, movimientos y saldos en el tiempo.",
    version="0.1.0",
    lifespan=lifespan,
)

# The frontend runs on its own dev server, so it needs CORS during development.
# In production it is served from this same origin and CORS is inert.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_password(request: Request, call_next):
    """HTTP Basic auth, enabled only when FINANZAS_PASSWORD is set.

    The app has no user model on purpose, and this is the cheapest thing that
    keeps a public URL from handing over a full financial history. Browsers and
    phones handle the challenge natively, so there is no login screen to build.
    """
    if not config.PASSWORD or request.url.path == "/api/health":
        return await call_next(request)

    header = request.headers.get("authorization", "")
    scheme, _, encoded = header.partition(" ")
    if scheme.lower() == "basic":
        try:
            decoded = base64.b64decode(encoded).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            decoded = ""
        user, _, password = decoded.partition(":")
        # compare_digest on both halves: a plain == leaks length and prefix.
        ok = hmac.compare_digest(user, config.USERNAME) & hmac.compare_digest(
            password, config.PASSWORD
        )
        if ok:
            return await call_next(request)

    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Finanzas", charset="UTF-8"'},
        content="Se necesita usuario y contraseña.",
        media_type="text/plain",
    )


# The API lives under /api so the built frontend can own the root and every
# other path. The Vite dev server proxies /api to here without rewriting it.
for router in (accounts, categories, transactions, transfers, dashboard):
    app.include_router(router.router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# The frontend
# --------------------------------------------------------------------------- #

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
    # Refuse anything that escapes the build directory via ../.
    if relative and candidate.is_relative_to(STATIC) and candidate.is_file():
        return FileResponse(candidate)

    # The one file that must never be cached: it points at the hashed assets.
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


if (STATIC / "assets").is_dir():
    # Hashed filenames, so they can be cached hard.
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str, request: Request) -> Response:
    return _spa_response(request)
