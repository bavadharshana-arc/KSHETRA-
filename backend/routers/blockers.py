"""
KSHETRA: READ-ONLY router for the B1-B4 blocker engine (Step 7B).

Mounted at /api/blockers (plus two convenience routes nested under
/api/projects and /api/parcels) in backend/main.py, following the exact
same degrade-gracefully import pattern already used for the Step 6B legal
router (backend/routers/legal.py). Does not touch /, /health, /predict, or
any other existing router.

NO WRITE ENDPOINTS. No recomputation endpoint. No AI integration. Mirrors
the Step 6B brief's "read-only first" discipline -- writes only happen via
blockers/db_crud.py (`persist_case_evaluation`,
`evaluate_and_persist_for_parcel`), called from a script/seed context, never
through this HTTP surface.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from blockers import db_crud, db_schemas
from database import get_db

router = APIRouter(prefix="/api/blockers", tags=["blockers"])
projects_router = APIRouter(prefix="/api/projects", tags=["blockers"])
parcels_router = APIRouter(prefix="/api/parcels", tags=["blockers"])


def _with_evidence_and_actions(db: Session, record) -> db_schemas.BlockerWithEvidenceRead:
    schema = db_schemas.BlockerWithEvidenceRead.model_validate(record)
    schema.evidence = [
        db_schemas.BlockerEvidenceRead.model_validate(row) for row in db_crud.list_blocker_evidence(db, record.id)
    ]
    schema.actions = [
        db_schemas.BlockerActionRead.model_validate(row) for row in db_crud.list_blocker_actions(db, record.id)
    ]
    return schema


@router.get("", response_model=List[db_schemas.BlockerRead])
def list_blockers(
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    blocker_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    latest_only: bool = True,
    db: Session = Depends(get_db),
):
    return db_crud.list_blockers(
        db,
        project_id=project_id,
        parcel_id=parcel_id,
        blocker_type=blocker_type,
        status=status_filter,
        latest_only=latest_only,
    )


@router.get("/{blocker_id}", response_model=db_schemas.BlockerWithEvidenceRead)
def get_blocker(blocker_id: str, db: Session = Depends(get_db)):
    record = db_crud.get_blocker(db, blocker_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocker not found.")
    return _with_evidence_and_actions(db, record)


@router.get("/{blocker_id}/evidence", response_model=List[db_schemas.BlockerEvidenceRead])
def get_blocker_evidence(blocker_id: str, db: Session = Depends(get_db)):
    if db_crud.get_blocker(db, blocker_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocker not found.")
    return db_crud.list_blocker_evidence(db, blocker_id)


@router.get("/{blocker_id}/actions", response_model=List[db_schemas.BlockerActionRead])
def get_blocker_actions(blocker_id: str, db: Session = Depends(get_db)):
    if db_crud.get_blocker(db, blocker_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocker not found.")
    return db_crud.list_blocker_actions(db, blocker_id)


@projects_router.get("/{project_id}/blockers", response_model=List[db_schemas.BlockerRead])
def list_project_blockers(project_id: str, db: Session = Depends(get_db)):
    return db_crud.list_blockers(db, project_id=project_id, latest_only=True)


@projects_router.get("/{project_id}/blockers/primary", response_model=Optional[db_schemas.BlockerRead])
def get_project_primary_blocker(project_id: str, db: Session = Depends(get_db)):
    return db_crud.get_primary_blocker(db, project_id=project_id)


@parcels_router.get("/{parcel_id}/blockers", response_model=List[db_schemas.BlockerRead])
def list_parcel_blockers(parcel_id: str, db: Session = Depends(get_db)):
    return db_crud.list_blockers(db, parcel_id=parcel_id, latest_only=True)
