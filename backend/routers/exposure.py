"""
KSHETRA: READ-ONLY router for the exposure/priority engine (Step 8B).

Mounted at /api/exposure (plus two convenience routes nested under
/api/projects and /api/parcels) in backend/main.py, following the exact same
degrade-gracefully import pattern already used for the Step 6B legal router
and Step 7B blockers router. Does not touch /, /health, /predict, or any
other existing router.

NO WRITE ENDPOINTS. No recomputation endpoint. No AI integration. Mirrors
backend/routers/blockers.py's "read-only first" discipline -- writes only
happen via exposure/db_crud.py (`persist_case_assessment`,
`assess_and_persist_for_case`), called from a script/seed context, never
through this HTTP surface (docs/step8a-exposure-priority-audit.md Section 16).
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from blockers import db_crud as blockers_db_crud
from database import get_db
from exposure import db_crud, db_schemas

router = APIRouter(prefix="/api/exposure", tags=["exposure"])
projects_router = APIRouter(prefix="/api/projects", tags=["exposure"])
parcels_router = APIRouter(prefix="/api/parcels", tags=["exposure"])

_VALID_EXPOSURE_BANDS = {"LOW", "MODERATE", "HIGH", "CRITICAL"}
_VALID_PRIORITY_BANDS = {"WATCH", "MONITOR", "SOON", "ACT_NOW"}


def _validate_band(min_band: Optional[str], valid: set) -> Optional[str]:
    if min_band is None:
        return None
    band = min_band.upper()
    if band not in valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"min_band must be one of {sorted(valid)}.",
        )
    return band


def _with_context(db: Session, record) -> db_schemas.ExposureAssessmentWithContextRead:
    """Inlines the primary blocker's owner/action summary -- read verbatim
    from the already-persisted `BlockerRecord`/`BlockerActionRecord`, never a
    new computation (Section 13/14: 'No new owner-assignment logic' / 'No
    new action-selection algorithm'). Mirrors how
    `backend/routers/blockers.py`'s own `_with_evidence_and_actions` inlines
    related rows."""
    schema = db_schemas.ExposureAssessmentWithContextRead.model_validate(record)
    if record.primary_blocker_id is not None:
        blocker = blockers_db_crud.get_blocker(db, record.primary_blocker_id)
        if blocker is not None:
            schema.owner_role = blocker.owner_role
            schema.responsible_authority = blocker.responsible_authority
    if record.recommended_action_id is not None:
        actions = blockers_db_crud.list_blocker_actions(db, record.primary_blocker_id or "")
        match = next((a for a in actions if a.id == record.recommended_action_id), None)
        if match is not None:
            schema.recommended_action_type = match.action_type
            schema.recommended_action_rationale = match.rationale
    return schema


@router.get("", response_model=List[db_schemas.ExposureAssessmentRead])
def list_exposure_assessments(
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    case_reference: Optional[str] = None,
    min_band: Optional[str] = Query(default=None, description="LOW | MODERATE | HIGH | CRITICAL"),
    latest_only: bool = True,
    db: Session = Depends(get_db),
):
    band = _validate_band(min_band, _VALID_EXPOSURE_BANDS)
    return db_crud.list_exposure_assessments(
        db, project_id=project_id, parcel_id=parcel_id, case_reference=case_reference, min_band=band, latest_only=latest_only
    )


@router.get("/priority-queue", response_model=List[db_schemas.ExposureAssessmentWithContextRead])
def get_priority_queue(
    project_id: Optional[str] = None,
    limit: Optional[int] = Query(default=None, ge=1),
    min_band: Optional[str] = Query(default=None, description="WATCH | MONITOR | SOON | ACT_NOW"),
    db: Session = Depends(get_db),
):
    """The actual answer to 'what should I act on first' -- ranked by
    `priority_score` desc across cases, deterministically tie-broken by
    `case_reference` (Section 16/17). Declared BEFORE the `/{assessment_id}`
    route so FastAPI never matches the literal path segment
    'priority-queue' as an assessment id."""
    band = _validate_band(min_band, _VALID_PRIORITY_BANDS)
    records = db_crud.priority_queue(db, project_id=project_id, limit=limit, min_band=band)
    return [_with_context(db, r) for r in records]


@router.get("/{assessment_id}", response_model=db_schemas.ExposureAssessmentWithContextRead)
def get_exposure_assessment(assessment_id: str, db: Session = Depends(get_db)):
    record = db_crud.get_exposure_assessment(db, assessment_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exposure assessment not found.")
    return _with_context(db, record)


@projects_router.get("/{project_id}/exposure", response_model=List[db_schemas.ExposureAssessmentRead])
def list_project_exposure(project_id: str, db: Session = Depends(get_db)):
    return db_crud.list_exposure_assessments(db, project_id=project_id, latest_only=True)


@projects_router.get("/{project_id}/exposure/latest", response_model=Optional[db_schemas.ExposureAssessmentWithContextRead])
def get_project_latest_exposure(project_id: str, db: Session = Depends(get_db)):
    record = db_crud.get_latest_project_assessment(db, project_id)
    return _with_context(db, record) if record is not None else None


@parcels_router.get("/{parcel_id}/exposure", response_model=List[db_schemas.ExposureAssessmentRead])
def list_parcel_exposure(parcel_id: str, db: Session = Depends(get_db)):
    return db_crud.list_exposure_assessments(db, parcel_id=parcel_id, latest_only=True)


@parcels_router.get("/{parcel_id}/exposure/latest", response_model=Optional[db_schemas.ExposureAssessmentWithContextRead])
def get_parcel_latest_exposure(parcel_id: str, db: Session = Depends(get_db)):
    record = db_crud.get_latest_parcel_assessment(db, parcel_id)
    return _with_context(db, record) if record is not None else None
