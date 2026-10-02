"""Core financial logic: balances, summaries, filtering.

All arithmetic happens on integer centavos so it stays exact.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from uuid import uuid4

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload

from app.enums import AccountType, TransactionType, enum_value
from app.models import Account, Category, Transaction
from app.money import format_pesos, to_cents, to_pesos
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


def initial_balances_total(db: Session, created_before: date | None = None) -> int:
    """Suma de los saldos iniciales, opcionalmente solo los anteriores a una fecha.

    El filtro por fecha es lo que permite que `summarize_cents` cuente el saldo
    inicial de una cuenta como ingreso en el mes en que se creo, sin que el
    grafico de evolucion lo sume dos veces: la semilla de ese grafico usa
    `created_before` para traer solo lo que ya existia antes de la ventana.
    """
    query = select(func.coalesce(func.sum(Account.initial_balance), 0)).where(
        Account.active.is_(True)
    )
    if created_before is not None:
        # `created_at` is a timestamp and the range is over dates, so the
        # comparison has to be made against the following midnight or an account
        # created on the last day of the period would fall outside.
        query = query.where(Account.created_at < datetime.combine(created_before, time.min))
    return db.scalar(query) or 0


# --------------------------------------------------------------------------- #
# Summaries
# --------------------------------------------------------------------------- #
def _initial_balances_in_period(
    db: Session, start: date, end: date, account_id: int | None = None
) -> int:
    """Saldos iniciales de las cuentas creadas dentro del período."""
    query = select(func.coalesce(func.sum(Account.initial_balance), 0)).where(
        Account.active.is_(True),
        Account.created_at >= datetime.combine(start, time.min),
        Account.created_at < datetime.combine(end + timedelta(days=1), time.min),
    )
    if account_id is not None:
        query = query.where(Account.id == account_id)
    return db.scalar(query) or 0


def summarize_cents(
    db: Session,
    start: date,
    end: date,
    account_id: int | None = None,
    include_initial: bool = True,
) -> tuple[int, int]:
    """Return (income, expense) in centavos for a date range.

    Transfer movements are excluded: moving money between your own accounts is
    not income or spending, even though they are stored as two movements.

    `include_initial` adds the starting balances of the accounts created inside the
    range, in the month of their creation. Without it, "Ingresos" shows 0 next to a
    "Dinero disponible" that does include them, and the two figures cannot be
    reconciled. Callers that render a single day turn it off: an initial balance
    did not arrive on any particular day — it was always there — so charging it to
    one would paint a day with a big income and no movement to explain it.
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

    if include_initial:
        income += _initial_balances_in_period(db, start, end, account_id)
    return income, expense


def summarize(
    db: Session,
    start: date,
    end: date,
    account_id: int | None = None,
    include_initial: bool = True,
) -> PeriodSummary:
    income, expense = summarize_cents(db, start, end, account_id, include_initial)
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
            Category.color,
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
        .group_by(Transaction.category_id, Category.name, Category.color)
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
            color=row.color,
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
                        color=transaction.category.color)
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


def blocks_spending(account: Account) -> bool:
    """Si esta cuenta es de las que no pueden quedar en negativo.

    Una cuenta de crédito es al revés: su saldo negativo ES la deuda, que es
    lo que significa una tarjeta. Bloquearle los gastos la volvería inútil.
    """
    return account.type != AccountType.CREDIT


def ensure_sufficient_funds(
    db: Session, account: Account, amount: int, *, already_counted: int = 0
) -> None:
    """Rechaza un gasto o una salida que la cuenta no puede cubrir.

    `already_counted` es lo que el saldo ya le descontó por el movimiento que se
    está por guardar. Al editar hay que devolverlo antes de comparar: si no, un
    gasto que ya estaba guardado no se podría volver a guardar ni igual.
    """
    if not blocks_spending(account):
        return
    available = account_balance(db, account) + already_counted
    if amount > available:
        raise ValueError(
            f"No hay suficiente dinero en {account.name}: "
            f"disponible {format_pesos(available)}, "
            f"necesitás {format_pesos(amount)}"
        )


def create_transaction(db: Session, payload: dict) -> Transaction:
    account, category = resolve_references(
        db, payload["account_id"], payload.get("category_id"), payload["type"]
    )
    amount = to_cents(payload["amount"])
    if payload["type"] == EXPENSE:
        ensure_sufficient_funds(db, account, amount)
    transaction = Transaction(
        account_id=account.id,
        category_id=category.id if category else payload.get("category_id"),
        type=payload["type"],
        amount=amount,
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
    account, _ = resolve_references(
        db, merged["account_id"], merged["category_id"], merged["type"]
    )

    amount = to_cents(changes["amount"]) if "amount" in changes else transaction.amount
    if merged["type"] == EXPENSE:
        # El saldo que se compara es el de la cuenta de destino. Si el movimiento
        # no se cambia de cuenta, hay que devolverle lo que este mismo movimiento
        # ya le habia descontado; si se muda de cuenta, el saldo de la nueva
        # todavia no lo tiene descontado.
        already_counted = 0
        if merged["account_id"] == transaction.account_id:
            already_counted = (
                -transaction.amount if transaction.type == INCOME else transaction.amount
            )
        ensure_sufficient_funds(db, account, amount, already_counted=already_counted)

    if "amount" in changes:
        transaction.amount = amount
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

    # A UUID, not something derived from the account ids and the amount. The
    # derived version could exceed the 36 characters of the column on large
    # amounts, which SQLite ignored but PostgreSQL rejects, and two identical
    # transfers in a row produced the same value.
    transfer_id = str(uuid4())
    amount = to_cents(payload["amount"])
    # La pata de salida es un gasto de la cuenta de origen, asi que es el mismo
    # control que un gasto: no se puede mover dinero que no esta.
    ensure_sufficient_funds(db, from_account, amount)
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
