"""
KSHETRA: READ-ONLY router for the statutory clock engine (Step 6B, Phase 1).

Mounted at /api/legal in backend/main.py, following the exact same
degrade-gracefully import pattern already used for the Step 2 CRUD routers.
Does not touch /, /health, or /predict, and has no relationship to ai-model/
or backend/demo_fallback.py.

NO WRITE ENDPOINTS. No recomputation endpoint. No AI integration. Per the
Step 6B brief: "Create read-only endpoints first... Do NOT create automatic
recomputation endpoints yet. Do NOT connect this to ML." Writes only happen
via legal/db_crud.py, called directly by legal/seed_demo_db.py.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from legal import db_crud, db_schemas

router = APIRouter(prefix="/api/legal", tags=["legal"])


@router.get("/rules", response_model=List[db_schemas.RuleSetRead])
def list_rules(
    act: Optional[str] = None,
    approval_status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return db_crud.list_rule_sets(db, act=act, approval_status=approval_status)


@router.get("/rules/{rule_set_id}", response_model=db_schemas.RuleSetRead)
def get_rule(rule_set_id: str, db: Session = Depends(get_db)):
    obj = db_crud.get_rule_set(db, rule_set_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RuleSet not found.")
    return obj


@router.get("/events", response_model=List[db_schemas.AcquisitionEventRead])
def list_events(
    case_reference: Optional[str] = None,
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    applicable_act: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return db_crud.list_acquisition_events(
        db, case_reference=case_reference, project_id=project_id, parcel_id=parcel_id,
        applicable_act=applicable_act,
    )


@router.get("/stays", response_model=List[db_schemas.CourtStayEventRead])
def list_stays(case_reference: Optional[str] = None, db: Session = Depends(get_db)):
    return db_crud.list_court_stay_events(db, case_reference=case_reference)


@router.get("/extensions", response_model=List[db_schemas.ExtensionEvidenceRead])
def list_extensions(case_reference: Optional[str] = None, db: Session = Depends(get_db)):
    return db_crud.list_extension_evidence(db, case_reference=case_reference)


@router.get("/conflicts", response_model=List[db_schemas.EventConflictRead])
def list_conflicts(case_reference: Optional[str] = None, db: Session = Depends(get_db)):
    return db_crud.list_event_conflicts(db, case_reference=case_reference)


@router.get("/clocks", response_model=List[db_schemas.StatutoryClockRead])
def list_clocks(
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    applicable_act: Optional[str] = None,
    clock_status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return db_crud.list_statutory_clocks(
        db, project_id=project_id, parcel_id=parcel_id, applicable_act=applicable_act,
        clock_status=clock_status,
    )


@router.get("/clocks/{clock_id}", response_model=db_schemas.StatutoryClockRead)
def get_clock(clock_id: str, db: Session = Depends(get_db)):
    obj = db_crud.get_statutory_clock(db, clock_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="StatutoryClock not found.")
    return obj
