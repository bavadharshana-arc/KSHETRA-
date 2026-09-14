"""
KSHETRA: CRUD router for `alerts` (Step 2 of the persistence plan).

Mounted at /api/alerts in backend/main.py. Does not touch /, /health, or
/predict, and has no relationship to ai-model/ or backend/demo_fallback.py.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=List[schemas.AlertRead])
def list_alerts(
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    # Query param stays "status" (matches Alert.status); the Python parameter
    # is named status_filter only to avoid shadowing fastapi.status used below.
    status_filter: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
):
    return crud.list_alerts(db, project_id=project_id, parcel_id=parcel_id, status=status_filter)


@router.post("", response_model=schemas.AlertRead, status_code=status.HTTP_201_CREATED)
def create_alert(payload: schemas.AlertCreate, db: Session = Depends(get_db)):
    if crud.get_alert(db, payload.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Alert '{payload.id}' already exists.",
        )
    if crud.get_project(db, payload.project_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{payload.project_id}' not found.",
        )
    if crud.get_parcel(db, payload.parcel_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel '{payload.parcel_id}' not found.",
        )
    return crud.create_alert(db, payload)


@router.get("/{alert_id}", response_model=schemas.AlertRead)
def get_alert(alert_id: str, db: Session = Depends(get_db)):
    obj = crud.get_alert(db, alert_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")
    return obj


@router.patch("/{alert_id}", response_model=schemas.AlertRead)
def update_alert(alert_id: str, payload: schemas.AlertUpdate, db: Session = Depends(get_db)):
    obj = crud.get_alert(db, alert_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")
    return crud.update_alert(db, obj, payload)


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(alert_id: str, db: Session = Depends(get_db)):
    obj = crud.get_alert(db, alert_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")
    crud.delete_alert(db, obj)
    return None
