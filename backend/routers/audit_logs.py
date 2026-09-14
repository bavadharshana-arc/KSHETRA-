"""
KSHETRA: CRUD router for `audit_logs` (Step 2 of the persistence plan).

Mounted at /api/audit-logs in backend/main.py. Does not touch /, /health, or
/predict, and has no relationship to ai-model/ or backend/demo_fallback.py.

Deliberately GET + POST only: an audit trail is an immutable historical
record, so no PATCH/DELETE endpoint is exposed (see schemas.py — there is no
AuditLogUpdate schema for this exact reason).
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/audit-logs", tags=["audit_logs"])


@router.get("", response_model=List[schemas.AuditLogRead])
def list_audit_logs(
    parcel_id: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.list_audit_logs(db, parcel_id=parcel_id, limit=limit, offset=offset)


@router.post("", response_model=schemas.AuditLogRead, status_code=status.HTTP_201_CREATED)
def create_audit_log(payload: schemas.AuditLogCreate, db: Session = Depends(get_db)):
    if crud.get_audit_log(db, payload.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Audit log '{payload.id}' already exists.",
        )
    if payload.parcel_id is not None and crud.get_parcel(db, payload.parcel_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel '{payload.parcel_id}' not found.",
        )
    return crud.create_audit_log(db, payload)


@router.get("/{log_id}", response_model=schemas.AuditLogRead)
def get_audit_log(log_id: str, db: Session = Depends(get_db)):
    obj = crud.get_audit_log(db, log_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log not found.")
    return obj
