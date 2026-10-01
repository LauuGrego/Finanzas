from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Budget, Category
from app.money import to_cents
from app.schemas.budget import (
    BudgetCheck,
    BudgetCreate,
    BudgetCreated,
    BudgetList,
    BudgetRead,
    BudgetUpdate,
)
from app.services import budget_service as svc
from app.services.periods import current_period

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=BudgetList)
def list_budgets(
    period: str | None = Query(None, description="YYYY-MM; por defecto el mes actual"),
    db: Session = Depends(get_db),
) -> BudgetList:
    try:
        return svc.get_list(db, period or current_period())
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.get("/check", response_model=BudgetCheck)
def check_budget(
    category_id: int = Query(..., description="Categoría del movimiento"),
    period: str | None = Query(None, description="YYYY-MM; por defecto el mes actual"),
    exclude_transaction_id: int | None = Query(
        None, description="Movimiento que se está editando, para no contarlo dos veces"
    ),
    db: Session = Depends(get_db),
) -> BudgetCheck:
    """Presupuesto de una categoría en un mes, para el modal de movimiento.

    Declarado antes que `/{budget_id}` a propósito: si no, FastAPI intentaría
    parsear "check" como un entero y devolvería un 422 en vez de la respuesta.
    """
    try:
        return svc.check(db, category_id, period or current_period(), exclude_transaction_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.post("", response_model=BudgetCreated, status_code=status.HTTP_201_CREATED)
def create_budget(payload: BudgetCreate, db: Session = Depends(get_db)) -> BudgetCreated:
    try:
        category = db.get(Category, payload.category_id)
        if category is None:
            raise ValueError(f"La categoría '{payload.category_id}' no existe")
        if not category.active:
            raise ValueError(f"La categoría '{category.name}' está dada de baja")
        return svc.create(
            db,
            category_id=payload.category_id,
            period=payload.period,
            amount=to_cents(payload.amount),
            repeat_months=payload.repeat_months,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.put("/{budget_id}", response_model=BudgetRead)
def update_budget(budget_id: int, payload: BudgetUpdate, db: Session = Depends(get_db)) -> BudgetRead:
    budget = _get(db, budget_id)
    amount = to_cents(payload.amount) if payload.amount is not None else None
    return svc.update(db, budget, amount, payload.apply_forward)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_budget(budget_id: int, db: Session = Depends(get_db)) -> None:
    budget = _get(db, budget_id)
    svc.delete(db, budget)


def _get(db: Session, budget_id: int) -> Budget:
    budget = db.scalar(
        select(Budget)
        .options(selectinload(Budget.category))
        .where(Budget.id == budget_id)
    )
    if budget is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El presupuesto no existe")
    return budget