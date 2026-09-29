from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.enums import CategoryType


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: CategoryType
    icon: str | None = Field(default=None, max_length=40)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    type: CategoryType | None = None
    icon: str | None = Field(default=None, max_length=40)
    active: bool | None = None


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    active: bool
    created_at: datetime
