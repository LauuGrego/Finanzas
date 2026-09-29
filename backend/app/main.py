from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(transfers.router)
app.include_router(dashboard.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
