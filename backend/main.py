"""
===============================================================================
KSHETRA: Land Acquisition Delay Prediction AI Service
FastAPI Backend (main.py)
===============================================================================

DISCLOSURE & ETHICAL NOTICE:
This backend is a PROTOTYPE DEMONSTRATION SERVICE (POC).
The underlying models (LightGBM, SHAP, and Cox Survival Analysis) are trained
exclusively on synthetic demonstration data. This API does NOT provide official
government determinations or verified judicial predictions.

PREDICTION MODES
----------------
Every /predict response carries `meta.mode`:
  * "live-model"    - produced by the trained LightGBM + SHAP + Cox pipeline.
  * "demo-fallback" - the trained pipeline was unavailable for this request, so a
                      DETERMINISTIC rule-based estimate (backend/demo_fallback.py)
                      was returned instead. Same input -> same output, never random.
The frontend surfaces this distinction to the user.
"""

import os
import sys
import traceback
from contextlib import asynccontextmanager
from typing import Any, Dict, List

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure this directory is on the Python import path for the flat-import
# convention used throughout backend/ (inference_service, routers, etc.).
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# -----------------------------------------------------------------------------
# Reusable ML inference (Step 3A of the persistence plan) — extracted from
# this file into backend/inference_service.py, UNCHANGED, so /predict below
# and the new prediction-persistence router (Step 3C) call the exact same
# function and can never diverge. inference_service.py owns the ai-model
# imports, the model-preload/health machinery, and the CaseInput schema; it
# has no knowledge that a database exists (no sqlalchemy import anywhere in
# it), which is what guarantees a database outage can never affect /predict.
# -----------------------------------------------------------------------------
from inference_service import (
    CaseInput,
    COX_MODEL_INFO,
    LGBM_MODEL_INFO,
    MODEL_IMPORT_ERROR,
    MODELS_STATE,
    TRAINING_FEATURE_DIST,
    live_models_ready,
    preload_models,
    run_prediction,
)

# -----------------------------------------------------------------------------
# Persistence layer (Step 2 CRUD + Step 3C prediction persistence) — CRUD/
# prediction routers over the SQLite database from Step 1 (backend/database.py,
# models.py). This is ADDITIVE ONLY: /, /health, and /predict below never
# depend on this import succeeding and are completely unaffected by it.
# Mirrors the ai-model degrade-don't-crash pattern above — if the persistence
# layer can't be imported for any reason, the service still boots and the
# existing prediction endpoints keep working; only the new /api/* routes
# would be unavailable.
# -----------------------------------------------------------------------------
_PERSISTENCE_IMPORT_ERROR: str | None = None
try:
    from routers import alerts as alerts_router
    from routers import audit_logs as audit_logs_router
    from routers import case_actions as case_actions_router
    from routers import parcels as parcels_router
    from routers import predictions as predictions_router
    from routers import prediction_outcomes as prediction_outcomes_router
    from routers import projects as projects_router
except Exception as e:  # noqa: BLE001 - degrade instead of failing the whole service
    _PERSISTENCE_IMPORT_ERROR = f"{type(e).__name__}: {e}"
    alerts_router = audit_logs_router = case_actions_router = None  # type: ignore
    parcels_router = predictions_router = prediction_outcomes_router = projects_router = None  # type: ignore

# -----------------------------------------------------------------------------
# Statutory clock engine (Step 6B, Phase 1) — READ-ONLY router over the
# backend/legal/ package. Same degrade-gracefully pattern as the persistence
# layer above: a failure here never affects /, /health, /predict, or the
# /api/* routers mounted above. No write endpoint, no recomputation
# endpoint, and no relationship to ai-model/, inference_service.py, or
# /predict — see backend/legal/__init__.py.
# -----------------------------------------------------------------------------
_LEGAL_IMPORT_ERROR: str | None = None
try:
    from routers import legal as legal_router
except Exception as e:  # noqa: BLE001 - degrade instead of failing the whole service
    _LEGAL_IMPORT_ERROR = f"{type(e).__name__}: {e}"
    legal_router = None  # type: ignore

# -----------------------------------------------------------------------------
# B1-B4 blocker engine (Step 7B) -- READ-ONLY router over the backend/blockers/
# package. Same degrade-gracefully pattern as the legal router above: a
# failure here never affects /, /health, /predict, or any other router
# mounted above. No write endpoint, no recomputation endpoint, and no
# relationship to ai-model/, inference_service.py, or /predict -- see
# backend/blockers/__init__.py.
# -----------------------------------------------------------------------------
_BLOCKERS_IMPORT_ERROR: str | None = None
try:
    from routers import blockers as blockers_router
except Exception as e:  # noqa: BLE001 - degrade instead of failing the whole service
    _BLOCKERS_IMPORT_ERROR = f"{type(e).__name__}: {e}"
    blockers_router = None  # type: ignore

# -----------------------------------------------------------------------------
# Exposure & Priority engine (Step 8B) -- READ-ONLY router over the backend/
# exposure/ package. Same degrade-gracefully pattern as the legal/blockers
# routers above: a failure here never affects /, /health, /predict, or any
# other router mounted above. No write endpoint, no recomputation endpoint,
# and no relationship to ai-model/, inference_service.py, or /predict -- see
# backend/exposure/__init__.py.
# -----------------------------------------------------------------------------
_EXPOSURE_IMPORT_ERROR: str | None = None
try:
    from routers import exposure as exposure_router
except Exception as e:  # noqa: BLE001 - degrade instead of failing the whole service
    _EXPOSURE_IMPORT_ERROR = f"{type(e).__name__}: {e}"
    exposure_router = None  # type: ignore


@asynccontextmanager
async def lifespan(_app: FastAPI):
    preload_models()
    yield


# -----------------------------------------------------------------------------
# FastAPI App Initialization
# -----------------------------------------------------------------------------
app = FastAPI(
    title="KSHETRA AI Backend",
    description=(
        "Unified Land Acquisition Decision Support API combining LightGBM binary "
        "classification, SHAP explainability, and Cox proportional hazards survival "
        "analysis, with a deterministic demo fallback."
    ),
    version="1.1.0-demo",
    lifespan=lifespan,
)

# CORS for the local React (Vite) dev/preview server. Explicit origins are listed
# for clarity; the regex additionally accepts any localhost / 127.0.0.1 port so a
# Vite auto-bumped port (5174, 5175, ...) still works. Wildcard + credentials is
# never used (the CORS spec forbids it).
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,
    # PATCH/DELETE added in Step 2 for the new persistence-layer CRUD routers
    # below (/api/*). / , /health and /predict only ever use GET/POST, so
    # this widening changes nothing about their existing behavior.
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# Persistence layer CRUD routers (Step 2) — mounted under /api/*, additive
# only. See the _PERSISTENCE_IMPORT_ERROR import block above: if the
# persistence layer failed to import, these routes are simply not mounted
# and every other endpoint in this file is unaffected.
# -----------------------------------------------------------------------------
if _PERSISTENCE_IMPORT_ERROR is None:
    app.include_router(projects_router.router)
    app.include_router(parcels_router.router)
    app.include_router(alerts_router.router)
    app.include_router(case_actions_router.router)
    app.include_router(audit_logs_router.router)
    app.include_router(predictions_router.router)
    app.include_router(prediction_outcomes_router.router)
else:
    print(f"[WARN] Persistence layer unavailable, /api/* routes not mounted: {_PERSISTENCE_IMPORT_ERROR}")

if _LEGAL_IMPORT_ERROR is None:
    app.include_router(legal_router.router)
else:
    print(f"[WARN] Legal engine unavailable, /api/legal/* routes not mounted: {_LEGAL_IMPORT_ERROR}")

if _BLOCKERS_IMPORT_ERROR is None:
    app.include_router(blockers_router.router)
    app.include_router(blockers_router.projects_router)
    app.include_router(blockers_router.parcels_router)
else:
    print(f"[WARN] Blocker engine unavailable, /api/blockers/* routes not mounted: {_BLOCKERS_IMPORT_ERROR}")

if _EXPOSURE_IMPORT_ERROR is None:
    app.include_router(exposure_router.router)
    app.include_router(exposure_router.projects_router)
    app.include_router(exposure_router.parcels_router)
else:
    print(f"[WARN] Exposure engine unavailable, /api/exposure/* routes not mounted: {_EXPOSURE_IMPORT_ERROR}")


# -----------------------------------------------------------------------------
# Structured error handling (no stack traces to the client)
# -----------------------------------------------------------------------------
def _error_body(code: str, message: str, hint: str, detail: Any = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {"error": {"code": code, "message": message, "hint": hint}}
    if detail is not None:
        body["error"]["detail"] = detail
    return body


@app.exception_handler(RequestValidationError)
async def _validation_handler(_req: Request, exc: RequestValidationError):
    fields = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
        fields.append({"field": loc or "(body)", "problem": err.get("msg", "invalid value")})
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_body(
            "INVALID_INPUT",
            "The prediction request contained values that are out of range or not allowed.",
            "Check the highlighted fields and try again.",
            detail=fields,
        ),
    )


@app.exception_handler(Exception)
async def _unhandled_handler(_req: Request, exc: Exception):  # noqa: BLE001
    # Log the full trace server-side only.
    print("[ERROR] Unhandled exception:\n" + "".join(traceback.format_exception(exc)))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_body(
            "INTERNAL_ERROR",
            "The prediction service hit an unexpected problem while processing the request.",
            "Please retry in a moment. If it keeps happening, restart the KSHETRA backend service.",
        ),
    )


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "service": "KSHETRA Land Acquisition AI Backend",
        "version": "1.1.0-demo",
        "endpoints": ["/health", "/predict"],
        "prediction_mode": "live-model" if live_models_ready() else "demo-fallback",
    }


@app.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> Dict[str, Any]:
    live_ready = live_models_ready()
    return {
        # `status` stays "healthy" whenever the API can serve a prediction — the
        # deterministic fallback guarantees that — so the frontend never shows a
        # hard-down state just because a model artifact is missing.
        "status": "healthy",
        "service": "KSHETRA Land Acquisition AI Backend",
        "version": "1.1.0-demo",
        "environment": "synthetic-demo-poc",
        "prediction_mode": "live-model" if live_ready else "demo-fallback",
        "models_loaded": {
            "lightgbm_binary_classifier": MODELS_STATE["lightgbm"],
            "shap_tree_explainer": MODELS_STATE["shap"],
            "cox_survival_fitter": MODELS_STATE["cox"],
        },
        "cox_model": COX_MODEL_INFO or None,
        "lgbm_model": LGBM_MODEL_INFO or None,
        "training_feature_distribution": TRAINING_FEATURE_DIST or None,
        "all_models_ready": live_ready,
        "model_import_error": MODEL_IMPORT_ERROR,
        "disclaimer": (
            "Prototype demonstration backend using synthetic training data. "
            "Not certified for official government decisions."
        ),
    }


@app.post("/predict", status_code=status.HTTP_200_OK)
def predict_case(payload: CaseInput) -> Dict[str, Any]:
    """
    Multi-model inference on a land-acquisition project case.

    Primary path : LightGBM classification -> SHAP explainability -> Cox survival.
    Fallback path : deterministic rule-based estimate (backend/demo_fallback.py)
                    used only when the trained pipeline is unavailable / errors.

    The response `meta.mode` tells the caller which path produced the result.

    STEP 3A: this endpoint's entire body now IS `run_prediction()`
    (backend/inference_service.py) — the same reusable function the
    prediction-persistence router (Step 3C, /api/.../predictions) calls
    before storing a row. The two code paths share one function, so they
    cannot produce different results for the same input. This endpoint has
    no knowledge of the database and never will — see inference_service.py's
    module docstring.
    """
    return run_prediction(payload.model_dump())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
