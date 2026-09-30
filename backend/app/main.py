from __future__ import annotations

import hmac
import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import auth, config
from app.database import Base, SessionLocal, engine
from app.enums import AccountType, CategoryType
from app.models import Account, Category
from app.routers import accounts, categories, dashboard, recurring, transactions, transfers

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

# Endpoints that have to answer before you can log in, or to find out that you
# need to. Everything else waits behind the middleware.
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


# Se registra PRIMERO a proposito, asi que queda como el middleware mas interno:
# todo lo que hay del router hacia abajo esta dentro de el, y la respuesta que
# arma vuelve a salir por require_session y por CORSMiddleware, que es lo que le
# pone access-control-allow-origin.
#
# Sin esto, una excepcion sube hasta ServerErrorMiddleware, que esta por fuera
# de CORSMiddleware: el 500 vuelve sin cabeceras de CORS, el navegador no se lo
# entrega a la pagina y del lado del JS lo unico que aparece es "Failed to
# fetch". Se pierden el status, el path y el tipo de error, que es justo lo que
# hace que un 500 termine siendo una pregunta en vez de una linea de log.
@app.middleware("http")
async def readable_failures(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Fallo sin manejar en %s %s", request.method, request.url.path)
        # El detalle del crash va al log, no a la respuesta: la respuesta la lee
        # cualquiera que conozca la URL.
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
    if not config.PASSWORD or request.url.path in OPEN_PATHS:
        return await call_next(request)

    if auth.verify(request.cookies.get(auth.COOKIE)) or auth.check_basic(
        request.headers.get("authorization", "")
    ):
        return await call_next(request)

    return JSONResponse(
        status_code=401,
        content={"detail": "Necesitás iniciar sesión."},
    )


# El frontend corre en otro dominio en el deploy partido, asi que CORS hace
# falta ahi, no solo en desarrollo. allow_credentials obliga a nombrar los
# origins explicitos: el navegador rechaza el wildcard en una request que lleva
# la cookie de sesion.
#
# Esto va despues del middleware de arriba a proposito, y el orden no es
# cosmetico. Cada add_middleware se inserta al principio de la pila, asi que el
# ultimo que se registra es el de mas afuera. Con CORS registrado primero,
# require_session queda por fuera y su 401 se devuelve sin pasar por CORS: la
# respuesta llega sin access-control-allow-origin y el navegador no la deja
# leer. Del lado del JS eso se ve como "Fetch failed" y no como un 401, el
# manejador de sesion vencida nunca se entera y la app se queda mostrando
# listas vacias en vez de volver al login.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    password: str


@app.post("/api/login", tags=["meta"])
def login(payload: LoginRequest, request: Request, response: Response) -> dict[str, bool]:
    """Check the password and hand back a signed session cookie.

    Deliberately does not say how wrong it was, and answers the same way for an
    unknown user, so the endpoint cannot be used to test passwords.
    """
    if config.PASSWORD and not hmac.compare_digest(payload.password, config.PASSWORD):
        raise HTTPException(status_code=401, detail="Clave incorrecta")
    auth.issue_cookie(response, secure=is_secure(request))
    return {"ok": True}


@app.post("/api/logout", tags=["meta"])
def logout(request: Request, response: Response) -> dict[str, bool]:
    auth.clear_cookie(response, secure=is_secure(request))
    return {"ok": True}


@app.get("/api/session", tags=["meta"])
def session(request: Request) -> dict[str, bool]:
    """Tell the frontend whether the cookie is still good.

    Answers 200 either way instead of 401, so the app can decide between the
    login screen and the dashboard without treating "not logged in" as an error.
    """
    if not config.PASSWORD:
        return {"authenticated": True}
    return {"authenticated": auth.verify(request.cookies.get(auth.COOKIE))}


# The API lives under /api so the built frontend can own the root and every
# other path. The Vite dev server proxies /api to here without rewriting it.
for router in (accounts, categories, transactions, transfers, dashboard, recurring):
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
