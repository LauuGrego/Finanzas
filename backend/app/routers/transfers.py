from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.money import to_pesos
from app.schemas.transaction import (
    CategoryRef,
    TransactionRead,
    TransferCreate,
    TransferRead,
)
from app.services import transaction_service as tx

router = APIRouter(prefix="/transfers", tags=["transfers"])


@router.post("", response_model=TransferRead, status_code=status.HTTP_201_CREATED)
def create_transfer(payload: TransferCreate, db: Session = Depends(get_db)) -> TransferRead:
    """Moving money between your own accounts is not spending, so it never touches categories."""
    try:
        transfer_id, movements = tx.create_transfer(db, payload.model_dump())
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    out, income = movements
    return TransferRead(
        transfer_id=transfer_id,
        date=payload.date,
        amount=to_pesos(out.amount),
        description=out.description,
        from_account=CategoryRef(id=out.account_id, name=out.account.name),
        to_account=CategoryRef(id=income.account_id, name=income.account.name),
        movements=[tx.to_read(out), tx.to_read(income)],
    )
