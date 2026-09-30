from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Installment
from app.money import to_cents
from app.schemas.installment import (
    InstallmentCreate,
    InstallmentList,
    InstallmentRead,
    InstallmentUpdate,
)
from app.services import installment_service as inst
from app.services.scheduling import resolve_references

router = APIRouter(prefix="/installments", tags=["installments"])


@router.get("", response_model=InstallmentList)
def list_installments(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
) -> InstallmentList:
    query = (
        select(Installment)
        .options(selectinload(Installment.category), selectinload(Installment.account))
        .order_by(Installment.active.desc(), Installment.next_date)
    )
    if not include_inactive:
        query = query.where(Installment.active.is_(True))
    plans = db.scalars(query).all()
    return InstallmentList(items=[inst.to_read(p) for p in plans], total=len(plans))


@router.post("", response_model=InstallmentRead, status_code=status.HTTP_201_CREATED)
def create_installment(
    payload: InstallmentCreate, db: Session = Depends(get_db)
) -> InstallmentRead:
    try:
        resolve_references(db, payload.account_id, payload.category_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    plan = Installment(
        account_id=payload.account_id,
        category_id=payload.category_id,
        amount=to_cents(payload.amount),
        description=payload.description,
        total_count=payload.total_count,
        next_date=payload.next_date,
        # The day the plan was set up for, kept so that a short month cannot drag
        # the whole plan onto the 28th for the rest of its life.
        anchor_day=payload.next_date.day,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return inst.to_read(plan)


@router.post("/generate", response_model=dict)
def generate_installments(
    db: Session = Depends(get_db),
    today: date | None = Query(None, description="Override the clock; for tests"),
) -> dict:
    """Catch up on every installment that came due, and report how many.

    Its own endpoint, called once when the app opens, for the same reason the
    recurring one exists: the server sleeps between uses, so nothing else would
    ever run it.
    """
    written = inst.generate_due(db, today)
    return {"generated": written}


@router.get("/{installment_id}", response_model=InstallmentRead)
def get_installment(installment_id: int, db: Session = Depends(get_db)) -> InstallmentRead:
    plan = _get(db, installment_id)
    return inst.to_read(plan)


@router.put("/{installment_id}", response_model=InstallmentRead)
def update_installment(
    installment_id: int, payload: InstallmentUpdate, db: Session = Depends(get_db)
) -> InstallmentRead:
    plan = _get(db, installment_id)
    changes = payload.model_dump(exclude_unset=True)

    if "amount" in changes:
        changes["amount"] = to_cents(changes["amount"])
    if {"account_id", "category_id"} & changes.keys():
        try:
            resolve_references(
                db,
                changes.get("account_id", plan.account_id),
                changes.get("category_id", plan.category_id),
            )
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    if "next_date" in changes and changes["next_date"] is not None:
        # Moving the date by hand means starting over from there, and the anchor
        # moves with it, exactly as it does on a recurring rule.
        changes["anchor_day"] = changes["next_date"].day

    for field, value in changes.items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    return inst.to_read(plan)


@router.delete(
    "/{installment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
def delete_installment(installment_id: int, db: Session = Depends(get_db)) -> None:
    """Remove the plan. Installments it already wrote stay where they are.

    They are real transactions by then and the history has to keep reading true.
    To stop a plan that still has installments left, deactivate it instead.
    """
    plan = _get(db, installment_id)
    db.delete(plan)
    db.commit()


def _get(db: Session, installment_id: int) -> Installment:
    plan = db.scalar(
        select(Installment)
        .options(selectinload(Installment.category), selectinload(Installment.account))
        .where(Installment.id == installment_id)
    )
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La cuota no existe")
    return plan
