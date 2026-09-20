"""
===============================================================================
KSHETRA: Persistence Layer — CRUD Data-Access Functions
===============================================================================

STEP 2 OF THE PERSISTENCE PLAN (CRUD API foundation). Thin, reusable
data-access functions over the six models.py entities, called by
backend/routers/*.py. Keeping this logic out of the routers means the
routers stay focused on HTTP concerns (status codes, path/query params)
while this module owns the actual session/query work.

Does not import anything from ai-model/, backend/demo_fallback.py, or
backend/main.py, and is not imported by them either — this module has no
relationship to /predict's inference path (see Prediction note below).

Conventions used throughout:
  - Every `create_*` function takes a `*Create` schema (schemas.py) whose
    `id` is the caller-supplied, application-preserved ID (e.g. "P-0245").
    The router layer is responsible for checking for a pre-existing ID and
    returning 409 Conflict before calling create_* — these functions assume
    that check already happened and will raise IntegrityError otherwise.
  - Every `update_*` function takes the corresponding ORM instance plus a
    `*Update` schema, applies only the fields the caller actually sent
    (`exclude_unset=True`), and returns the refreshed instance.
  - Every `delete_*` function deletes the row outright; FK `ondelete`
    cascades (see models.py) handle dependents at the database level, so no
    manual cascade logic is duplicated here.
  - `Prediction` intentionally has no create/update/delete helpers in this
    step — it stays untouched (Step 3+ territory, and still not written to
    by anything in the running app).
"""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

import models
import schemas


# -----------------------------------------------------------------------------
# Project
# -----------------------------------------------------------------------------
def get_project(db: Session, project_id: str) -> Optional[models.Project]:
    return db.get(models.Project, project_id)


def list_projects(db: Session) -> List[models.Project]:
    return db.query(models.Project).order_by(models.Project.name).all()


def create_project(db: Session, payload: schemas.ProjectCreate) -> models.Project:
    obj = models.Project(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_project(db: Session, obj: models.Project, payload: schemas.ProjectUpdate) -> models.Project:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


def delete_project(db: Session, obj: models.Project) -> None:
    db.delete(obj)
    db.commit()


# -----------------------------------------------------------------------------
# Parcel
# -----------------------------------------------------------------------------
def get_parcel(db: Session, parcel_id: str) -> Optional[models.Parcel]:
    return db.get(models.Parcel, parcel_id)


def list_parcels(db: Session, project_id: Optional[str] = None) -> List[models.Parcel]:
    query = db.query(models.Parcel)
    if project_id is not None:
        query = query.filter(models.Parcel.project_id == project_id)
    return query.order_by(models.Parcel.id).all()


def create_parcel(db: Session, payload: schemas.ParcelCreate) -> models.Parcel:
    obj = models.Parcel(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_parcel(db: Session, obj: models.Parcel, payload: schemas.ParcelUpdate) -> models.Parcel:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


def delete_parcel(db: Session, obj: models.Parcel) -> None:
    db.delete(obj)
    db.commit()


# -----------------------------------------------------------------------------
# Alert
# -----------------------------------------------------------------------------
def get_alert(db: Session, alert_id: str) -> Optional[models.Alert]:
    return db.get(models.Alert, alert_id)


def list_alerts(
    db: Session,
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    status: Optional[str] = None,
) -> List[models.Alert]:
    query = db.query(models.Alert)
    if project_id is not None:
        query = query.filter(models.Alert.project_id == project_id)
    if parcel_id is not None:
        query = query.filter(models.Alert.parcel_id == parcel_id)
    if status is not None:
        query = query.filter(models.Alert.status == status)
    return query.order_by(models.Alert.created_at.desc()).all()


def create_alert(db: Session, payload: schemas.AlertCreate) -> models.Alert:
    obj = models.Alert(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_alert(db: Session, obj: models.Alert, payload: schemas.AlertUpdate) -> models.Alert:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


def delete_alert(db: Session, obj: models.Alert) -> None:
    db.delete(obj)
    db.commit()


# -----------------------------------------------------------------------------
# CaseAction
# -----------------------------------------------------------------------------
def get_case_action(db: Session, action_id: str) -> Optional[models.CaseAction]:
    return db.get(models.CaseAction, action_id)


def list_case_actions(db: Session, parcel_id: Optional[str] = None) -> List[models.CaseAction]:
    query = db.query(models.CaseAction)
    if parcel_id is not None:
        query = query.filter(models.CaseAction.parcel_id == parcel_id)
    return query.order_by(models.CaseAction.created_at.desc()).all()


def create_case_action(db: Session, payload: schemas.CaseActionCreate) -> models.CaseAction:
    obj = models.CaseAction(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_case_action(
    db: Session, obj: models.CaseAction, payload: schemas.CaseActionUpdate
) -> models.CaseAction:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


def delete_case_action(db: Session, obj: models.CaseAction) -> None:
    db.delete(obj)
    db.commit()


# -----------------------------------------------------------------------------
# AuditLog — immutable: create + read only (see schemas.py), no update/delete.
# -----------------------------------------------------------------------------
def get_audit_log(db: Session, log_id: str) -> Optional[models.AuditLog]:
    return db.get(models.AuditLog, log_id)


def list_audit_logs(
    db: Session,
    parcel_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[models.AuditLog]:
    query = db.query(models.AuditLog)
    if parcel_id is not None:
        query = query.filter(models.AuditLog.parcel_id == parcel_id)
    return query.order_by(models.AuditLog.created_at.desc()).offset(offset).limit(limit).all()


def create_audit_log(db: Session, payload: schemas.AuditLogCreate) -> models.AuditLog:
    obj = models.AuditLog(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


# -----------------------------------------------------------------------------
# Prediction (Step 3 of the persistence plan) — APPEND-ONLY: no update_* or
# delete_* function exists here on purpose. Every call to create_prediction
# inserts a new row; nothing in this module ever modifies or removes one.
# -----------------------------------------------------------------------------
def get_prediction(db: Session, prediction_id: str) -> Optional[models.Prediction]:
    return db.get(models.Prediction, prediction_id)


def create_prediction(db: Session, obj: models.Prediction) -> models.Prediction:
    """
    Takes an already-built (not-yet-persisted) models.Prediction instance —
    see backend/routers/predictions.py `_build_prediction_row`, which maps the
    raw run_prediction() output onto it — and inserts it. `id`/`created_at`
    use the column defaults declared in models.py (Step 1, untouched).
    """
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_project_predictions(db: Session, project_id: str) -> List[models.Prediction]:
    """Project-scoped prediction history only (scope == 'project'); a parcel-
    scoped prediction under this project has its own history via
    list_parcel_predictions, so it is not double-counted here. Ordered
    generated_at DESC with created_at DESC as a tiebreaker (generated_at is a
    minute-resolution display string, see inference_service._now_iso; two
    predictions in the same minute still sort correctly by the DB insert
    timestamp)."""
    return (
        db.query(models.Prediction)
        .filter(models.Prediction.project_id == project_id, models.Prediction.scope == "project")
        .order_by(models.Prediction.generated_at.desc(), models.Prediction.created_at.desc())
        .all()
    )


def latest_project_prediction(db: Session, project_id: str) -> Optional[models.Prediction]:
    return (
        db.query(models.Prediction)
        .filter(models.Prediction.project_id == project_id, models.Prediction.scope == "project")
        .order_by(models.Prediction.generated_at.desc(), models.Prediction.created_at.desc())
        .first()
    )


def list_parcel_predictions(db: Session, parcel_id: str) -> List[models.Prediction]:
    """Parcel-scoped prediction history, same deterministic ordering as
    list_project_predictions."""
    return (
        db.query(models.Prediction)
        .filter(models.Prediction.parcel_id == parcel_id)
        .order_by(models.Prediction.generated_at.desc(), models.Prediction.created_at.desc())
        .all()
    )


def latest_parcel_prediction(db: Session, parcel_id: str) -> Optional[models.Prediction]:
    return (
        db.query(models.Prediction)
        .filter(models.Prediction.parcel_id == parcel_id)
        .order_by(models.Prediction.generated_at.desc(), models.Prediction.created_at.desc())
        .first()
    )


# -----------------------------------------------------------------------------
# PredictionOutcome (Step 9B) — APPEND-ONLY, like Prediction above: no
# update_* or delete_* helper exists here on purpose (see models.py and
# schemas.py: there is no PredictionOutcomeUpdate schema either).
# -----------------------------------------------------------------------------
def create_prediction_outcome(db: Session, obj: models.PredictionOutcome) -> models.PredictionOutcome:
    """Takes an already-built (not-yet-persisted) models.PredictionOutcome
    instance — see backend/routers/prediction_outcomes.py, which derives
    project_id/parcel_id from the referenced Prediction row before
    constructing it — and inserts it."""
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_prediction_outcome(db: Session, outcome_id: str) -> Optional[models.PredictionOutcome]:
    return db.get(models.PredictionOutcome, outcome_id)


def list_prediction_outcomes(db: Session, prediction_id: str) -> List[models.PredictionOutcome]:
    return (
        db.query(models.PredictionOutcome)
        .filter(models.PredictionOutcome.prediction_id == prediction_id)
        .order_by(models.PredictionOutcome.created_at.desc())
        .all()
    )
