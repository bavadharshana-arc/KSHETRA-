"""
KSHETRA: CRUD router for `case_actions` (Step 2 of the persistence plan).

Mounted at /api/case-actions in backend/main.py. Does not touch /, /health,
or /predict, and has no relationship to ai-model/ or backend/demo_fallback.py.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/case-actions", tags=["case_actions"])


@router.get("", response_model=List[schemas.CaseActionRead])
def list_case_actions(parcel_id: Optional[str] = None, db: Session = Depends(get_db)):
    return crud.list_case_actions(db, parcel_id=parcel_id)


@router.post("", response_model=schemas.CaseActionRead, status_code=status.HTTP_201_CREATED)
def create_case_action(payload: schemas.CaseActionCreate, db: Session = Depends(get_db)):
    if crud.get_case_action(db, payload.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Case action '{payload.id}' already exists.",
        )
    if crud.get_parcel(db, payload.parcel_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel '{payload.parcel_id}' not found.",
        )
    return crud.create_case_action(db, payload)


@router.get("/{action_id}", response_model=schemas.CaseActionRead)
def get_case_action(action_id: str, db: Session = Depends(get_db)):
    obj = crud.get_case_action(db, action_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case action not found.")
    return obj


@router.patch("/{action_id}", response_model=schemas.CaseActionRead)
def update_case_action(action_id: str, payload: schemas.CaseActionUpdate, db: Session = Depends(get_db)):
    obj = crud.get_case_action(db, action_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case action not found.")
    return crud.update_case_action(db, obj, payload)


@router.delete("/{action_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case_action(action_id: str, db: Session = Depends(get_db)):
    obj = crud.get_case_action(db, action_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case action not found.")
    crud.delete_case_action(db, obj)
    return None
