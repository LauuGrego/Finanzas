from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account
from app.money import to_pesos
from app.schemas.account import AccountCreate, AccountList, AccountRead, AccountUpdate
from app.schemas.transaction import TransactionPage
from app.services import transaction_service as tx

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _read(db: Session, account: Account) -> AccountRead:
    return AccountRead(
        id=account.id,
        name=account.name,
        type=account.type,
        initial_balance=to_pesos(account.initial_balance),
        active=account.active,
        created_at=account.created_at,
        balance=to_pesos(tx.account_balance(db, account)),
    )


@router.get("", response_model=AccountList)
def list_accounts(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
) -> AccountList:
    query = select(Account).order_by(Account.active.desc(), Account.name)
    if not include_inactive:
        query = query.where(Account.active.is_(True))
    accounts = db.scalars(query).all()
    reads = [_read(db, account) for account in accounts]
    total = sum(tx.account_balance(db, a) for a in accounts if a.active)
    return AccountList(accounts=reads, total_balance=to_pesos(total))


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)) -> AccountRead:
    existing = db.scalar(select(Account).where(Account.name == payload.name))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese nombre")
    account = Account(
        name=payload.name,
        type=payload.type,
        initial_balance=int(payload.initial_balance * 100),
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
        changes["initial_balance"] = int(changes["initial_balance"] * 100)
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
