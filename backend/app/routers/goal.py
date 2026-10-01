from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Goal
from app.schemas.goal import GoalCreate, GoalList, GoalRead, GoalUpdate
from app.services import goal_service as svc

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("", response_model=GoalList)
def list_goals(
    include_inactive: bool = Query(False, description="Incluye las metas pausadas"),
    db: Session = Depends(get_db),
) -> GoalList:
    return svc.list_goals(db, include_inactive)


@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)) -> GoalRead:
    try:
        return svc.create(db, payload)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.put("/{goal_id}", response_model=GoalRead)
def update_goal(goal_id: int, payload: GoalUpdate, db: Session = Depends(get_db)) -> GoalRead:
    goal = _get(db, goal_id)
    try:
        return svc.update(db, goal, payload)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_goal(goal_id: int, db: Session = Depends(get_db)) -> None:
    svc.delete(db, _get(db, goal_id))


def _get(db: Session, goal_id: int) -> Goal:
    goal = db.scalar(select(Goal).where(Goal.id == goal_id))
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La meta no existe")
    return goal
