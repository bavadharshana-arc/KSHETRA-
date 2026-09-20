"""
===============================================================================
KSHETRA: Reusable ML Inference Service
===============================================================================

STEP 3A OF THE PERSISTENCE PLAN (prediction persistence). This module is the
extraction target named in the Step 3 architecture:

    Existing ML inference -> Reusable inference function -> Prediction result
                                        |
                          +-------------+-------------+
                          |                           |
                       /predict (existing)   persistence-aware API (Step 3C)

Everything below — the ai-model imports, the model-preload/health-check
machinery, `CaseInput`, and the actual `_run_live_pipeline` / demo-fallback
branching — is copied VERBATIM from backend/main.py as it existed after
Step 2. No line of inference logic, validation, rounding, ordering, or
fallback behavior was changed; only the *location* of the code moved, so
that both /predict and the new prediction-persistence router can call the
exact same `run_prediction()` function and can never diverge from each
other. See the Step 3 report for the byte-for-byte /predict regression test
that verifies this extraction changed nothing observable.

Does NOT modify ai-model/, backend/demo_fallback.py, or any model artifact.
Does NOT import database.py, models.py, schemas.py, or SQLAlchemy anywhere
in this file — this module has zero knowledge that a database exists. That
is what guarantees a database outage can never affect /predict: /predict
(backend/main.py) only ever calls into this module, never into the
persistence layer.
"""

from __future__ import annotations

import os
import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Dict

from pydantic import BaseModel, Field, field_validator

# Ensure ai-model directory is accessible on the Python import path (identical
# resolution to what backend/main.py did before this extraction).
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AI_MODEL_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "ai-model"))
if AI_MODEL_DIR not in sys.path:
    sys.path.insert(0, AI_MODEL_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Deterministic demo fallback (always importable — pure Python, no ML deps).
from demo_fallback import predict_case_demo

# Import existing AI components (no retraining or modifications). A failure here
# must NOT crash the service — /predict will transparently use the demo fallback.
MODEL_IMPORT_ERROR: str | None = None
try:
    from predict import predict_case_delay, load_model_and_metadata
    from explain import explain_case_prediction, load_model_and_explainer
    from survival import predict_case_survival, load_cox_model
except Exception as e:  # noqa: BLE001 - we deliberately degrade instead of failing
    MODEL_IMPORT_ERROR = f"{type(e).__name__}: {e}"
    predict_case_delay = load_model_and_metadata = None  # type: ignore
    explain_case_prediction = load_model_and_explainer = None  # type: ignore
    predict_case_survival = load_cox_model = None  # type: ignore

# Valid statutory stages under LARR Act
VALID_STAGES = [
    "Notification (Sec 3A/11)",
    "SIA & Objection (Sec 3C/15)",
    "Declaration (Sec 3D/19)",
    "Award Inquiry (Sec 3G/23)",
    "Compensation Disbursement",
    "Possession (Sec 3E/38)",
]

# Startup state tracker
MODELS_STATE = {
    "lightgbm": False,
    "shap": False,
    "cox": False,
}

# Model schema/metric info, filled in at preload from the artifact metadata so
# /health can confirm exactly which model schemas are loaded.
COX_MODEL_INFO: Dict[str, Any] = {}
LGBM_MODEL_INFO: Dict[str, Any] = {}
# Per-feature training distribution (from feature_metadata.json) — drives the soft
# out-of-distribution diagnostic on /predict. Never rejects input.
TRAINING_FEATURE_DIST: Dict[str, Dict[str, float]] = {}


def preload_models() -> None:
    """Pre-warms and verifies the three AI components. Never raises."""
    if MODEL_IMPORT_ERROR is not None:
        print(f"[WARN] ai-model import failed, demo fallback active: {MODEL_IMPORT_ERROR}")
        return

    try:
        _lgbm_pipe, _lgbm_meta = load_model_and_metadata()
        MODELS_STATE["lightgbm"] = True
        if isinstance(_lgbm_meta, dict):
            LGBM_MODEL_INFO.update(
                {
                    "feature_schema": _lgbm_meta.get("feature_schema"),
                    "model_version": _lgbm_meta.get("model_version"),
                    "numerical_features": _lgbm_meta.get("numerical_features"),
                    "categorical_features": _lgbm_meta.get("categorical_features"),
                    "removed_features": list((_lgbm_meta.get("removed_features") or {}).keys()),
                    "evaluation_methodology": _lgbm_meta.get("evaluation_methodology"),
                    "synthetic_holdout_roc_auc": (_lgbm_meta.get("synthetic_holdout_metrics") or {}).get("roc_auc"),
                    "synthetic_cv_roc_auc": (_lgbm_meta.get("synthetic_cross_validation") or {}).get("roc_auc_mean"),
                    "metric_label": _lgbm_meta.get("metric_label"),
                }
            )
            _dist = _lgbm_meta.get("training_feature_distribution")
            if isinstance(_dist, dict):
                TRAINING_FEATURE_DIST.update(_dist)
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] Failed to preload LightGBM model: {e}")

    try:
        load_model_and_explainer()
        MODELS_STATE["shap"] = True
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] Failed to preload SHAP explainer: {e}")

    try:
        _cox_model, _cox_meta = load_cox_model()
        MODELS_STATE["cox"] = True
        if isinstance(_cox_meta, dict):
            COX_MODEL_INFO.update(
                {
                    "feature_schema": _cox_meta.get("feature_schema"),
                    "numerical_covariates": _cox_meta.get("numerical_covariates"),
                    "removed_covariates": list((_cox_meta.get("removed_covariates") or {}).keys()),
                    "duration_col": _cox_meta.get("duration_col"),
                    "concordance_index": _cox_meta.get("concordance_index"),
                    "training_sample_size": _cox_meta.get("training_sample_size"),
                    "event_count": _cox_meta.get("event_count"),
                }
            )
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] Failed to preload Cox survival model: {e}")

    print("[INFO] KSHETRA AI Models Preload Status:", MODELS_STATE)
    if COX_MODEL_INFO:
        print("[INFO] Cox artifact:", COX_MODEL_INFO.get("feature_schema"), COX_MODEL_INFO.get("numerical_covariates"))


def live_models_ready() -> bool:
    return MODEL_IMPORT_ERROR is None and all(MODELS_STATE.values())


# -----------------------------------------------------------------------------
# Request schema (moved verbatim from backend/main.py's CaseInput)
# -----------------------------------------------------------------------------
class CaseInput(BaseModel):
    # 7-field contract (Stage 7): `previous_delays_months` was removed — the
    # prototype has no genuine source for it and the model no longer uses it.
    # Bounds are hard rails only (impossible values). Values that are merely far
    # from the synthetic training range are ACCEPTED and flagged via
    # meta.input_diagnostics (soft out-of-distribution), never rejected.
    model_config = {"extra": "ignore"}  # tolerate a stray previous_delays_months from old clients

    parcel_count: int = Field(..., ge=1, le=100000, description="Total survey parcels in the acquisition case/project.")
    litigation_cases: int = Field(..., ge=0, le=100000, description="Count of active court cases in the input record(s).")
    compensation_pending_pct: float = Field(..., ge=0.0, le=100.0, description="Percent of relevant records not fully disbursed.")
    acquisition_stage: str = Field(..., description=f"Current statutory stage. One of: {VALID_STAGES}")
    ownership_disputes: int = Field(..., ge=0, le=100000, description="Count of record(s) with an ownership / title dispute.")
    document_issues: int = Field(..., ge=0, le=100000, description="Count of record(s) with a qualifying document issue.")
    notification_age_months: float = Field(..., ge=0.0, le=1200.0, description="Elapsed months from Sec 3A/11 notification to the demo as-of date.")

    @field_validator("acquisition_stage")
    @classmethod
    def _validate_acquisition_stage(cls, value: str) -> str:
        if value not in VALID_STAGES:
            raise ValueError(f"acquisition_stage must be one of {VALID_STAGES}")
        return value


# -----------------------------------------------------------------------------
# Helpers (moved verbatim from backend/main.py)
# -----------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _input_diagnostics(case: Dict[str, Any]) -> Dict[str, Any]:
    """
    Soft out-of-distribution diagnostic (PART E). For each numerical model feature
    it compares the supplied value against the synthetic training [min, max] range
    recorded in feature_metadata.json.

    This is TRANSPARENCY ONLY:
      * the prediction is NEVER rejected or altered because of it;
      * it is NOT a confidence score and NOT a statistical uncertainty estimate;
      * it simply flags inputs that fall outside the range the demo model actually
        saw during training (e.g. a real project's parcel_count = 380 when the
        synthetic set topped out at 500 is fine; 8000 would be flagged).
    """
    if not TRAINING_FEATURE_DIST:
        return {
            "available": False,
            "note": "Training-distribution metadata not loaded; no OOD comparison performed.",
            "features": {},
            "any_out_of_training_range": False,
        }

    features: Dict[str, Any] = {}
    any_out = False
    for feat, dist in TRAINING_FEATURE_DIST.items():
        if feat not in case or case[feat] is None:
            continue
        try:
            value = float(case[feat])
        except (TypeError, ValueError):
            continue
        tmin = float(dist.get("min")) if dist.get("min") is not None else None
        tmax = float(dist.get("max")) if dist.get("max") is not None else None
        # Small tolerance (2% of the observed span) so a trivial boundary miss —
        # e.g. a percentage sent as exactly 0.0/100.0 when the synthetic sample
        # spanned 0.1..99.9 — is NOT flagged. Only a material excursion trips it.
        span = (tmax - tmin) if (tmin is not None and tmax is not None) else 0.0
        tol = abs(span) * 0.02
        below = tmin is not None and value < tmin - tol
        above = tmax is not None and value > tmax + tol
        out_of_range = bool(below or above)
        any_out = any_out or out_of_range
        features[feat] = {
            "value": value,
            "training_min": tmin,
            "training_max": tmax,
            "training_mean": dist.get("mean"),
            "training_median": dist.get("median"),
            "in_training_range": not out_of_range,
            "out_of_training_range": out_of_range,
            "position": "below_training_min" if below else "above_training_max" if above else "within",
        }

    return {
        "available": True,
        "features": features,
        "any_out_of_training_range": any_out,
        "note": (
            "Soft diagnostic only. Values outside the synthetic training range are "
            "still scored; treat such predictions with extra caution. This is not a "
            "confidence score."
        ),
    }


def _run_live_pipeline(case: Dict[str, Any]) -> Dict[str, Any]:
    """Runs the trained LightGBM + SHAP + Cox pipeline. Raises on any failure."""
    lgbm_res = predict_case_delay(case)  # type: ignore[misc]
    shap_res = explain_case_prediction(case, top_n=5)  # type: ignore[misc]
    survival_res = predict_case_survival(case)  # type: ignore[misc]

    return {
        "classification": {
            "delayed_prediction": lgbm_res["delayed_prediction"],
            "status_label": lgbm_res["status_label"],
            "delay_probability": lgbm_res["delay_probability"],
            "risk_score": lgbm_res["risk_score"],
            "risk_tier": lgbm_res["risk_tier"],
        },
        "explainability": {
            "top_risk_drivers": shap_res["top_contributing_factors"],
            "all_features_analyzed": len(shap_res["all_feature_contributions"]),
            "explanation_space": shap_res.get("explanation_space", "lightgbm_raw_margin_log_odds"),
            "base_value_log_odds": shap_res["case_summary"].get("base_value_log_odds"),
            "model_raw_margin_log_odds": shap_res["case_summary"].get("model_raw_margin_log_odds"),
            "additivity": shap_res.get("additivity"),
            "space_notice": shap_res["notices"].get("space_notice"),
            "causation_notice": shap_res["notices"]["causation_notice"],
            "human_readable_drivers": lgbm_res.get("key_risk_drivers", []),
        },
        "survival_analysis": {
            "partial_hazard_ratio": survival_res["hazard_analysis"]["partial_hazard_ratio"],
            "hazard_tier": survival_res["hazard_analysis"]["hazard_tier"],
            "estimated_median_delay_free_milestone": survival_res["hazard_analysis"]["estimated_median_delay_free_milestone"],
            "key_hazard_drivers": survival_res["hazard_analysis"]["key_hazard_drivers"],
            "delay_free_survival_curve": survival_res["delay_free_survival_curve"],
            "time_analysis": survival_res.get("time_analysis"),
            "survival_definition": survival_res["notices"].get("definition"),
            "non_completion_notice": survival_res["notices"]["non_completion_notice"],
        },
        "disclaimer": (
            "Synthetic demonstration model output (LightGBM + SHAP + Cox). "
            "Does not represent official government determinations."
        ),
    }


# -----------------------------------------------------------------------------
# THE reusable inference function (Step 3A). This is the extracted body of
# backend/main.py's old `predict_case` endpoint handler, unchanged line for
# line except for the two lines at the very top/bottom that made it an HTTP
# handler (`payload: CaseInput` parameter -> `case_dict` parameter; no other
# logic difference). backend/main.py's /predict now calls this function
# directly, and so does backend/routers/predictions.py (Step 3C) — meaning
# both code paths are LITERALLY the same function call and cannot diverge.
# -----------------------------------------------------------------------------
def run_prediction(case_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Multi-model inference on a land-acquisition project case.

    Primary path : LightGBM classification -> SHAP explainability -> Cox survival.
    Fallback path : deterministic rule-based estimate (backend/demo_fallback.py)
                    used only when the trained pipeline is unavailable / errors.

    The response `meta.mode` tells the caller which path produced the result.

    `case_dict` must already be a plain dict of the validated CaseInput fields
    (i.e. `CaseInput(**raw).model_dump()`) — this function performs no
    additional validation itself, matching exactly what the /predict
    endpoint's body always assumed before extraction.
    """
    generated_at = _now_iso()
    input_diagnostics = _input_diagnostics(case_dict)

    fallback_reason: str | None = MODEL_IMPORT_ERROR

    if MODEL_IMPORT_ERROR is None:
        try:
            result = _run_live_pipeline(case_dict)
            result["meta"] = {
                "mode": "live-model",
                "models_ready": True,
                "generated_at": generated_at,
                "reason": None,
                "input_diagnostics": input_diagnostics,
                # STEP 9B: the LightGBM artifact's own version string, already
                # loaded into LGBM_MODEL_INFO at preload time (see
                # preload_models() above) — surfaced here verbatim, not
                # recomputed. Never fabricated: None if the loaded metadata
                # never carried a model_version field.
                "model_version": LGBM_MODEL_INFO.get("model_version"),
            }
            return result
        except Exception as e:  # noqa: BLE001 - degrade to deterministic fallback
            # Full detail is logged server-side only; never returned to the client.
            print(
                "[WARN] Live pipeline failed, using deterministic demo fallback:\n"
                + "".join(traceback.format_exception(e))
            )
            fallback_reason = "inference_error"
    elif fallback_reason is not None:
        print(f"[WARN] ai-model unavailable, using deterministic demo fallback: {fallback_reason}")
        fallback_reason = "model_artifacts_unavailable"

    result = predict_case_demo(case_dict, top_n=5)
    result["meta"] = {
        "mode": "demo-fallback",
        "models_ready": False,
        "generated_at": generated_at,
        # Short, non-sensitive code — no paths, no stack traces.
        "reason": fallback_reason or "model_artifacts_unavailable",
        "reason_text": (
            "The trained LightGBM / SHAP / Cox pipeline was not available for this "
            "request, so a deterministic demo estimate was returned."
        ),
        "input_diagnostics": input_diagnostics,
        # STEP 9B: no trained-model artifact produced this result, so there is
        # no model version to report — None, never fabricated.
        "model_version": None,
    }
    return result
