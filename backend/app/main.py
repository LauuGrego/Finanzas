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

# Colours are chosen to stay distinguishable from each other on the dark UI.
DEFAULT_CATEGORIES: list[tuple[str, CategoryType, str]] = [
    ("Comida", CategoryType.EXPENSE, "#fbbf24"),
    ("Transporte", CategoryType.EXPENSE, "#60a5fa"),
    ("Servicios", CategoryType.EXPENSE, "#22d3ee"),
    ("Entretenimiento", CategoryType.EXPENSE, "#c084fc"),
    ("Compras", CategoryType.EXPENSE, "#f472b6"),
    ("Salud", CategoryType.EXPENSE, "#4ade80"),
    ("Otros", CategoryType.EXPENSE, "#94a3b8"),
    ("Sueldo", CategoryType.INCOME, "#34d399"),
    ("Freelance", CategoryType.INCOME, "#818cf8"),
    ("Otros ingresos", CategoryType.INCOME, "#fb923c"),
]


def seed_defaults(db: Session, *, with_accounts: bool = True) -> None:
    """Fill an empty database with a starting set of categories. Idempotent."""
    if db.scalar(select(func.count(Category.id))) == 0:
        db.add_all(
            Category(name=name, type=type_, color=color)
            for name, type_, color in DEFAULT_CATEGORIES
        )
        db.commit()
    if with_accounts and db.scalar(select(func.count(Account.id))) == 0:
        db.add_all(
            [
                Account(name="Banco", type=AccountType.BANK, initial_balance=0),
                Account(name="Efectivo", type=AccountType.CASH, initial_balance=0),
            ]
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
