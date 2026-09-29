from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.enums import CategoryType
from app.models import Category
from app.schemas.category import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def list_categories(
    type: CategoryType | None = None,
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
) -> list[Category]:
    query = select(Category).order_by(Category.type.desc(), Category.name)
    if type is not None:
        query = query.where(Category.type == type)
    if not include_inactive:
        query = query.where(Category.active.is_(True))
    return list(db.scalars(query).all())


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)) -> Category:
    existing = db.scalar(select(Category).where(Category.name == payload.name))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una categoría con ese nombre")
    category = Category(name=payload.name, type=payload.type, color=payload.color)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)
) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")

    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        clash = db.scalar(
            select(Category).where(Category.name == changes["name"], Category.id != category_id)
        )
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una categoría con ese nombre")
    for field, value in changes.items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def deactivate_category(category_id: int, db: Session = Depends(get_db)) -> None:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")
    category.active = False
    db.commit()
