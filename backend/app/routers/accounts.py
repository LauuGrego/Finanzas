from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account
from app.money import to_cents, to_pesos
from app.schemas.account import AccountCreate, AccountList, AccountRead, AccountUpdate
from app.schemas.transaction import TransactionPage
from app.services import transaction_service as tx
from app.services.periods import current_period, month_bounds

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _read(db: Session, account: Account, month: str | None = None) -> AccountRead:
    period = month or current_period()
    start, end = month_bounds(period)
    income, expense = tx.summarize_cents(
        db, start, end, account_id=account.id, include_initial=False
    )
    month_balance = income - expense
    return AccountRead(
        id=account.id,
        name=account.name,
        type=account.type,
        initial_balance=to_pesos(account.initial_balance),
        active=account.active,
        created_at=account.created_at,
        balance=to_pesos(month_balance),
    )


@router.get("", response_model=AccountList)
def list_accounts(
    include_inactive: bool = Query(False),
    month: str | None = Query(None, description="YYYY-MM, defaults to current month"),
    db: Session = Depends(get_db),
) -> AccountList:
    query = select(Account).order_by(Account.active.desc(), Account.name)
    if not include_inactive:
        query = query.where(Account.active.is_(True))
    accounts = db.scalars(query).all()
    reads = [_read(db, account, month) for account in accounts]
    total = sum(a.balance for a in reads if a.active)
    return AccountList(accounts=reads, total_balance=round(total, 2))


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)) -> AccountRead:
    existing = db.scalar(select(Account).where(Account.name == payload.name))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese nombre")
    account = Account(
        name=payload.name,
        type=payload.type,
        initial_balance=to_cents(payload.initial_balance),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return _read(db, account)


@router.get("/{account_id}", response_model=AccountRead)
def get_account(account_id: int, db: Session = Depends(get_db)) -> AccountRead:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")
    return _read(db, account)


@router.get("/{account_id}/transactions", response_model=TransactionPage)
def account_transactions(
    account_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> TransactionPage:
    if db.get(Account, account_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")
    return tx.filter_transactions(db, account_id=account_id, limit=limit, offset=offset)


@router.put("/{account_id}", response_model=AccountRead)
def update_account(
    account_id: int, payload: AccountUpdate, db: Session = Depends(get_db)
) -> AccountRead:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")

    changes = payload.model_dump(exclude_unset=True)
    if "initial_balance" in changes:
        changes["initial_balance"] = to_cents(changes["initial_balance"])
    if "name" in changes:
        clash = db.scalar(
            select(Account).where(Account.name == changes["name"], Account.id != account_id)
        )
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese nombre")

    for field, value in changes.items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return _read(db, account)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def deactivate_account(account_id: int, db: Session = Depends(get_db)) -> None:
    """Accounts are never hard-deleted: history must stay readable."""
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")
    account.active = False
    db.commit()
