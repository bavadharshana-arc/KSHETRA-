"""
KSHETRA: Prediction-outcome persistence router (Step 9B of the persistence
plan).

Records the eventual real-world outcome of an already-persisted `Prediction`
row (backend/routers/predictions.py, UNMODIFIED aside from now storing
`model_version` — see that file). Deliberately exposes no PATCH/DELETE:
outcomes are an append-only evidentiary trail, never edited or removed (see
schemas.py — there is no PredictionOutcomeUpdate schema, and crud.py has no
update_prediction_outcome / delete_prediction_outcome helper, on purpose).

Mounted in backend/main.py alongside the Step 2/3 persistence routers, guarded
by the same _PERSISTENCE_IMPORT_ERROR fallback. Has no relationship to
ai-model/, inference_service.py, or /predict.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import crud
import models
import schemas
from database import get_db

router = APIRouter(tags=["prediction_outcomes"])


@router.post(
    "/api/predictions/{prediction_id}/outcomes",
    response_model=schemas.PredictionOutcomeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_prediction_outcome(
    prediction_id: str, payload: schemas.PredictionOutcomeCreate, db: Session = Depends(get_db)
):
    prediction = crud.get_prediction(db, prediction_id)
    if prediction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Prediction '{prediction_id}' not found."
        )

    # project_id/parcel_id are ALWAYS taken from the referenced Prediction
    # row itself, never from the request body (schemas.PredictionOutcomeCreate
    # has no such fields) — this is what guarantees the outcome's linkage can
    # never disagree with the prediction it belongs to.
    obj = models.PredictionOutcome(
        prediction_id=prediction.id,
        project_id=prediction.project_id,
        parcel_id=prediction.parcel_id,
        **payload.model_dump(),
    )
    return crud.create_prediction_outcome(db, obj)


@router.get("/api/predictions/{prediction_id}/outcomes", response_model=List[schemas.PredictionOutcomeRead])
def list_prediction_outcomes(prediction_id: str, db: Session = Depends(get_db)):
    if crud.get_prediction(db, prediction_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Prediction '{prediction_id}' not found."
        )
    return crud.list_prediction_outcomes(db, prediction_id)


@router.get("/api/prediction-outcomes/{outcome_id}", response_model=schemas.PredictionOutcomeRead)
def get_prediction_outcome(outcome_id: str, db: Session = Depends(get_db)):
    obj = crud.get_prediction_outcome(db, outcome_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction outcome not found.")
    return obj
