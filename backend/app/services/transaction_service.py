"""Core financial logic: balances, summaries, filtering.

All arithmetic happens on integer centavos so it stays exact.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload

from app.enums import TransactionType, enum_value
from app.models import Account, Category, Transaction
from app.money import to_cents, to_pesos
from app.schemas.reports import CategoryTotal, PeriodSummary
from app.schemas.transaction import CategoryRef, TransactionPage, TransactionRead

INCOME = TransactionType.INCOME
EXPENSE = TransactionType.EXPENSE


# --------------------------------------------------------------------------- #
# Balances
# --------------------------------------------------------------------------- #
def account_balance(db: Session, account: Account) -> int:
    """Saldo = saldo inicial + ingresos - gastos."""
    # GROUP BY is required: without it the aggregate collapses every row into one
    # and `type` would take an arbitrary value.
    movements = db.execute(
        select(Transaction.type, func.sum(Transaction.amount))
        .where(Transaction.account_id == account.id)
        .group_by(Transaction.type)
    ).all()
    total = account.initial_balance
    for type_, amount in movements:
        total += amount if type_ == INCOME else -amount
    return total


def total_balance(db: Session) -> int:
    """Available money: the sum of the balances of the active accounts."""
    accounts = db.scalars(select(Account).where(Account.active.is_(True))).all()
    return sum(account_balance(db, account) for account in accounts)


def initial_balances_total(db: Session) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(Account.initial_balance), 0)).where(
            Account.active.is_(True)
        )
    ) or 0


# --------------------------------------------------------------------------- #
# Summaries
# --------------------------------------------------------------------------- #
def summarize_cents(
    db: Session, start: date, end: date, account_id: int | None = None
) -> tuple[int, int]:
    """Return (income, expense) in centavos for a date range.

    Transfer movements are excluded: moving money between your own accounts is
    not income or spending, even though they are stored as two movements.
    """
    query = select(Transaction.type, func.sum(Transaction.amount)).where(
        Transaction.date >= start,
        Transaction.date <= end,
        Transaction.transfer_id.is_(None),
    )
    if account_id is not None:
        query = query.where(Transaction.account_id == account_id)
    # GROUP BY keeps incomes and expenses apart; without it SQL would merge every
    # row into a single one and report a meaningless type.
    query = query.group_by(Transaction.type)

    income = expense = 0
    for type_, amount in db.execute(query).all():
        if type_ == INCOME:
            income += amount
        else:
            expense += amount
    return income, expense


def summarize(
    db: Session, start: date, end: date, account_id: int | None = None
) -> PeriodSummary:
    income, expense = summarize_cents(db, start, end, account_id)
    return PeriodSummary(
        income=to_pesos(income),
        expense=to_pesos(expense),
        balance=to_pesos(income - expense),
    )


def expenses_by_category(
    db: Session, start: date, end: date, account_id: int | None = None
) -> list[CategoryTotal]:
    query = (
        select(
            Transaction.category_id,
            Category.name,
            Category.icon,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .join(Category, Category.id == Transaction.category_id, isouter=True)
        .where(
            Transaction.type == EXPENSE,
            Transaction.date >= start,
            Transaction.date <= end,
            # A transfer out of an account is not a category expense.
            Transaction.transfer_id.is_(None),
        )
        .group_by(Transaction.category_id, Category.name, Category.icon)
        .order_by(func.sum(Transaction.amount).desc())
    )
    if account_id is not None:
        query = query.where(Transaction.account_id == account_id)

    rows = db.execute(query).all()
    grand_total = sum(row.total for row in rows) or 1
    return [
        CategoryTotal(
            category_id=row.category_id,
            category_name=row.name or "Sin categoría",
            icon=row.icon,
            total=to_pesos(row.total),
            percentage=round(row.total * 100 / grand_total, 1),
            count=row.count,
        )
        for row in rows
    ]


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #
def base_query() -> Select:
    return select(Transaction).options(
        joinedload(Transaction.category), joinedload(Transaction.account)
    )


def filter_transactions(
    db: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    type_: TransactionType | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> TransactionPage:
    query = base_query()
    count_query = select(func.count(Transaction.id))

    conditions = []
    if start is not None:
        conditions.append(Transaction.date >= start)
    if end is not None:
        conditions.append(Transaction.date <= end)
    if account_id is not None:
        conditions.append(Transaction.account_id == account_id)
    if category_id is not None:
        conditions.append(Transaction.category_id == category_id)
    if type_ is not None:
        conditions.append(Transaction.type == type_)
    if search:
        pattern = f"%{search.strip()}%"
        conditions.append(Transaction.description.ilike(pattern))

    for condition in conditions:
        query = query.where(condition)
        count_query = count_query.where(condition)

    total = db.scalar(count_query) or 0
    rows = db.scalars(
        query.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(limit).offset(offset)
    ).all()
    return TransactionPage(
        items=[to_read(row) for row in rows], total=total, limit=limit, offset=offset
    )


def get_transaction(db: Session, transaction_id: int) -> Transaction | None:
    return db.scalar(base_query().where(Transaction.id == transaction_id))


def to_read(transaction: Transaction) -> TransactionRead:
    signed = (
        transaction.amount
        if transaction.type == INCOME
        else -transaction.amount
    )
    return TransactionRead(
        id=transaction.id,
        account_id=transaction.account_id,
        category_id=transaction.category_id,
        type=transaction.type,
        amount=to_pesos(transaction.amount),
        description=transaction.description,
        date=transaction.date,
        transfer_id=transaction.transfer_id,
        created_at=transaction.created_at,
        account_name=transaction.account.name if transaction.account else None,
        category=(
            CategoryRef(id=transaction.category.id, name=transaction.category.name,
                        icon=transaction.category.icon)
            if transaction.category
            else None
        ),
        signed_amount=to_pesos(signed),
    )


# --------------------------------------------------------------------------- #
# Writes
# --------------------------------------------------------------------------- #
def resolve_references(
    db: Session, account_id: int, category_id: int | None, type_: TransactionType
) -> tuple[Account, Category | None]:
    """Validate the account/category exist and that the category matches the type."""
    account = db.get(Account, account_id)
    if account is None:
        raise LookupError(f"No existe la cuenta {account_id}")
    if not account.active:
        raise ValueError(f"La cuenta '{account.name}' está dada de baja")

    category = None
    if category_id is not None:
        category = db.get(Category, category_id)
        if category is None:
            raise LookupError(f"No existe la categoría {category_id}")
        if not category.active:
            raise ValueError(f"La categoría '{category.name}' está dada de baja")
        if category.type != type_:
            raise ValueError(
                f"La categoría '{category.name}' es de tipo {enum_value(category.type)} "
                f"y el movimiento es {enum_value(type_)}"
            )
    return account, category


def create_transaction(db: Session, payload: dict) -> Transaction:
    account, category = resolve_references(
        db, payload["account_id"], payload.get("category_id"), payload["type"]
    )
    transaction = Transaction(
        account_id=account.id,
        category_id=category.id if category else payload.get("category_id"),
        type=payload["type"],
        amount=to_cents(payload["amount"]),
        description=payload.get("description"),
        date=payload["date"],
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def apply_update(db: Session, transaction: Transaction, changes: dict) -> Transaction:
    merged = {
        "account_id": changes.get("account_id", transaction.account_id),
        "category_id": changes.get("category_id", transaction.category_id),
        "type": changes.get("type", transaction.type),
    }
    if "type" in changes and transaction.category_id is None:
        raise ValueError("Un movimiento de tipo ingreso o gasto necesita una categoría")
    resolve_references(db, merged["account_id"], merged["category_id"], merged["type"])

    if "amount" in changes:
        transaction.amount = to_cents(changes["amount"])
    if "description" in changes:
        transaction.description = changes["description"]
    if "date" in changes:
        transaction.date = changes["date"]
    transaction.account_id = merged["account_id"]
    transaction.category_id = merged["category_id"]
    transaction.type = merged["type"]

    db.commit()
    db.refresh(transaction)
    return transaction


def create_transfer(db: Session, payload: dict) -> tuple[str, list[Transaction]]:
    """A transfer is two linked movements: money leaves one account, enters another."""
    if payload["from_account_id"] == payload["to_account_id"]:
        raise ValueError("Las cuentas de origen y destino deben ser distintas")

    from_account, _ = resolve_references(
        db, payload["from_account_id"], None, EXPENSE
    )
    to_account, _ = resolve_references(db, payload["to_account_id"], None, INCOME)

    transfer_id = f"tr_{from_account.id}_{to_account.id}_{to_cents(payload['amount'])}"
    amount = to_cents(payload["amount"])
    description = payload.get("description") or f"Transferencia {from_account.name} → {to_account.name}"

    out = Transaction(
        account_id=from_account.id,
        type=EXPENSE,
        amount=amount,
        description=description,
        date=payload["date"],
        transfer_id=transfer_id,
    )
    income = Transaction(
        account_id=to_account.id,
        type=INCOME,
        amount=amount,
        description=description,
        date=payload["date"],
        transfer_id=transfer_id,
    )
    db.add_all([out, income])
    db.commit()
    db.refresh(out)
    db.refresh(income)
    return transfer_id, [out, income]
