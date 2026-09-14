"""
KSHETRA: CRUD router for `parcels` (Step 2 of the persistence plan).

Mounted at /api/parcels in backend/main.py. Does not touch /, /health, or
/predict, and has no relationship to ai-model/ or backend/demo_fallback.py.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/parcels", tags=["parcels"])


@router.get("", response_model=List[schemas.ParcelRead])
def list_parcels(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    return crud.list_parcels(db, project_id=project_id)


@router.post("", response_model=schemas.ParcelRead, status_code=status.HTTP_201_CREATED)
def create_parcel(payload: schemas.ParcelCreate, db: Session = Depends(get_db)):
    if crud.get_parcel(db, payload.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Parcel '{payload.id}' already exists.",
        )
    if crud.get_project(db, payload.project_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{payload.project_id}' not found.",
        )
    return crud.create_parcel(db, payload)


@router.get("/{parcel_id}", response_model=schemas.ParcelRead)
def get_parcel(parcel_id: str, db: Session = Depends(get_db)):
    obj = crud.get_parcel(db, parcel_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parcel not found.")
    return obj


@router.patch("/{parcel_id}", response_model=schemas.ParcelRead)
def update_parcel(parcel_id: str, payload: schemas.ParcelUpdate, db: Session = Depends(get_db)):
    obj = crud.get_parcel(db, parcel_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parcel not found.")
    if payload.project_id is not None and crud.get_project(db, payload.project_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{payload.project_id}' not found.",
        )
    return crud.update_parcel(db, obj, payload)


@router.delete("/{parcel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_parcel(parcel_id: str, db: Session = Depends(get_db)):
    obj = crud.get_parcel(db, parcel_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parcel not found.")
    # Deleting a parcel cascades to its alerts/case_actions/predictions and
    # SET NULLs its audit_logs.parcel_id (see models.py — verified in Step 1).
    crud.delete_parcel(db, obj)
    return None
