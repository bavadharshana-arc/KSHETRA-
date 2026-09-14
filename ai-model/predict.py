"""
===============================================================================
KSHETRA: Land Acquisition Delay Prediction System
Model Inference / Prediction Module
===============================================================================

This module provides clean functions to load the saved LightGBM pipeline
and run delay risk predictions on land-acquisition cases.

It is designed to be:
1. Executable standalone for testing (`python predict.py`).
2. Directly importable by FastAPI or background task runners in future steps.

Example payload format:
{
    "parcel_count": 85,
    "litigation_cases": 3,
    "compensation_pending_pct": 65.0,
    "acquisition_stage": "Declaration (Sec 3D/19)",
    "ownership_disputes": 8,
    "document_issues": 12,
    "notification_age_months": 18.0
}
"""

import os
import json
import joblib
import pandas as pd
from typing import Dict, Any, Union, List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "lgbm_delay_model.joblib")
METADATA_PATH = os.path.join(BASE_DIR, "models", "feature_metadata.json")

# Cached model pipeline instance
_CACHED_PIPELINE = None
_CACHED_METADATA = None


def load_model_and_metadata():
    """Loads and caches the model and schema metadata."""
    global _CACHED_PIPELINE, _CACHED_METADATA

    if _CACHED_PIPELINE is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Trained model not found at {MODEL_PATH}. "
                "Please run `python train.py` first to generate and train the model."
            )
        _CACHED_PIPELINE = joblib.load(MODEL_PATH)

    if _CACHED_METADATA is None and os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            _CACHED_METADATA = json.load(f)

    return _CACHED_PIPELINE, _CACHED_METADATA


def analyze_case_risk_drivers(case_data: Dict[str, Any]) -> List[str]:
    """Generates human-readable explanations of key friction points in the case."""
    drivers = []
    
    litigation = case_data.get("litigation_cases", 0)
    if litigation >= 3:
        drivers.append(f"High Litigation Count ({litigation} active court cases/stay orders)")
    elif litigation >= 1:
        drivers.append(f"Active Litigation ({litigation} civil case pending)")

    ownership = case_data.get("ownership_disputes", 0)
    if ownership >= 5:
        drivers.append(f"Severe Title Fragmentation ({ownership} co-owner/partition disputes)")

    doc_issues = case_data.get("document_issues", 0)
    if doc_issues >= 8:
        drivers.append(f"Revenue Documentation Lag ({doc_issues} unmutated/stale patta records)")

    comp_pending = case_data.get("compensation_pending_pct", 0.0)
    stage = case_data.get("acquisition_stage", "")
    if comp_pending > 50.0 and stage in ["Award Inquiry (Sec 3G/23)", "Compensation Disbursement", "Possession (Sec 3E/38)"]:
        drivers.append(f"Late-Stage Compensation Backlog ({comp_pending:.1f}% funds undisbursed)")

    age = case_data.get("notification_age_months", 0.0)
    if age >= 24.0:
        drivers.append(f"Prolonged Gazette Age ({age:.1f} months elapsed since Sec 3A notification)")

    if not drivers:
        drivers.append("Normal operational parameters; no critical red flags detected")

    return drivers


def predict_case_delay(case: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predicts land acquisition delay for a single case/project.

    Parameters:
        case (dict): Dictionary with case features.

    Returns:
        dict: Prediction result, probability, risk tier, and risk drivers.
    """
    pipeline, _ = load_model_and_metadata()

    # Convert single case dict to DataFrame
    df_input = pd.DataFrame([case])

    # Run inference
    prediction = int(pipeline.predict(df_input)[0])
    probabilities = pipeline.predict_proba(df_input)[0]
    delay_prob = float(probabilities[1])
    risk_score = round(delay_prob * 100, 1)

    # Determine risk tier
    if risk_score >= 65.0:
        risk_tier = "HIGH"
    elif risk_score >= 35.0:
        risk_tier = "MEDIUM"
    else:
        risk_tier = "LOW"

    risk_drivers = analyze_case_risk_drivers(case)

    return {
        "delayed_prediction": prediction,
        "status_label": "Significant Delay Expected (>6 months)" if prediction == 1 else "On-Track / Minor Delay (<=6 months)",
        "delay_probability": round(delay_prob, 4),
        "risk_score": risk_score,
        "risk_tier": risk_tier,
        "key_risk_drivers": risk_drivers,
        "disclaimer": "Synthetic demo model prediction. Does not represent official government determination."
    }


def predict_batch_cases(cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Runs batch predictions on a list of case dictionaries."""
    return [predict_case_delay(c) for c in cases]


if __name__ == "__main__":
    print("=" * 70)
    print("KSHETRA: Land Acquisition Delay Prediction - Test Run")
    print("=" * 70)

    # Sample Case A: High-friction case (Stay orders, pending compensation, title disputes)
    high_friction_case = {
        "parcel_count": 140,
        "litigation_cases": 5,
        "compensation_pending_pct": 68.5,
        "acquisition_stage": "Declaration (Sec 3D/19)",
        "ownership_disputes": 18,
        "document_issues": 25,
        "notification_age_months": 22.0,
    }

    # Sample Case B: Low-friction case (Clean records, no litigation, on schedule)
    low_friction_case = {
        "parcel_count": 45,
        "litigation_cases": 0,
        "compensation_pending_pct": 12.0,
        "acquisition_stage": "Compensation Disbursement",
        "ownership_disputes": 1,
        "document_issues": 2,
        "notification_age_months": 16.0,
    }

    print("\n--- Testing High-Friction Case ---")
    res_a = predict_case_delay(high_friction_case)
    print(json.dumps(res_a, indent=2))

    print("\n--- Testing Low-Friction Case ---")
    res_b = predict_case_delay(low_friction_case)
    print(json.dumps(res_b, indent=2))

    print("\n[SUCCESS] Inference helper executed correctly.")
