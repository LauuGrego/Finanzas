from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Recurring
from app.money import to_cents
from app.schemas.recurring import (
    RecurringCreate,
    RecurringList,
    RecurringRead,
    RecurringUpdate,
)
from app.services import recurring_service as rec
from app.services import reminder_service
from app.services.scheduling import resolve_references

router = APIRouter(prefix="/recurring", tags=["recurring"])


@router.get("", response_model=RecurringList)
def list_recurring(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
) -> RecurringList:
    query = (
        select(Recurring)
        .options(selectinload(Recurring.category), selectinload(Recurring.account))
        .order_by(Recurring.active.desc(), Recurring.next_date)
    )
    if not include_inactive:
        query = query.where(Recurring.active.is_(True))
    rules = db.scalars(query).all()
    return RecurringList(items=[rec.to_read(r) for r in rules], total=len(rules))


@router.post("", response_model=RecurringRead, status_code=status.HTTP_201_CREATED)
def create_recurring(payload: RecurringCreate, db: Session = Depends(get_db)) -> RecurringRead:
    try:
        resolve_references(db, payload.account_id, payload.category_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    rule = Recurring(
        account_id=payload.account_id,
        category_id=payload.category_id,
        amount=to_cents(payload.amount),
        description=payload.description,
        frequency=payload.frequency,
        next_date=payload.next_date,
        anchor_day=payload.next_date.day,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rec.to_read(rule)


@router.post("/generate", response_model=dict)
def generate_recurring(
    db: Session = Depends(get_db),
    today: date | None = Query(None, description="Override the clock; for tests"),
) -> dict:
    """Catch up on everything that came due, and report how much that was.

    Its own endpoint rather than a side effect of the dashboard because it writes.
    The frontend calls it once when the app opens, which is the only reliable
    moment: the server sleeps between uses, so nothing else would ever run it.
    Also checks and sends email reminders for recurring transactions due tomorrow.
    """
    written = rec.generate_due(db, today)
    reminder_service.check_and_send_reminders(db, today)
    return {"generated": written}


@router.post("/reminders/send", response_model=dict)
@router.get("/reminders/send", response_model=dict)
def send_reminders(
    db: Session = Depends(get_db),
    today: date | None = Query(None, description="Override the clock; for tests"),
) -> dict:
    """Check active recurrings due tomorrow and send reminder emails."""
    results = reminder_service.check_and_send_reminders(db, today)
    return {"checked": True, "results": results}


@router.post("/reminders/test", response_model=dict)
def test_reminder_email(
    to_email: str | None = Query(None, description="Optional override email for testing"),
) -> dict:
    """Send a test email to verify SMTP configuration."""
    result = reminder_service.send_test_email(to_email)
    if not result.get("ok"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, result.get("error", "Error enviando correo de prueba")
        )
    return result


@router.get("/{recurring_id}", response_model=RecurringRead)
def get_recurring(recurring_id: int, db: Session = Depends(get_db)) -> RecurringRead:
    rule = _get(db, recurring_id)
    return rec.to_read(rule)


@router.put("/{recurring_id}", response_model=RecurringRead)
def update_recurring(
    recurring_id: int, payload: RecurringUpdate, db: Session = Depends(get_db)
) -> RecurringRead:
    rule = _get(db, recurring_id)
    changes = payload.model_dump(exclude_unset=True)

    if "amount" in changes:
        changes["amount"] = to_cents(changes["amount"])
    if {"account_id", "category_id"} & changes.keys():
        try:
            resolve_references(
                db,
                changes.get("account_id", rule.account_id),
                changes.get("category_id", rule.category_id),
            )
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    if "next_date" in changes and changes["next_date"] is not None:
        changes["anchor_day"] = changes["next_date"].day


    for field, value in changes.items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rec.to_read(rule)


@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_recurring(recurring_id: int, db: Session = Depends(get_db)) -> None:
    """Remove the rule. Movements it already wrote stay where they are.

    They are real transactions by then and the history has to keep reading true.
    To stop a rule that has not fired yet, deactivate it instead.
    """
    rule = _get(db, recurring_id)
    db.delete(rule)
    db.commit()


def _get(db: Session, recurring_id: int) -> Recurring:
    rule = db.scalar(
        select(Recurring)
        .options(selectinload(Recurring.category), selectinload(Recurring.account))
        .where(Recurring.id == recurring_id)
    )
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El recurrente no existe")
    return rule
