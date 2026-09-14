"""
===============================================================================
KSHETRA: Land Acquisition Delay Prediction System
SHAP Explainability Module (explain.py)
===============================================================================

This module uses SHAP (SHapley Additive exPlanations) to explain why the
trained LightGBM model predicts a specific land-acquisition case to be delayed
or on-track.

IMPORTANT NOTICES:
1. Synthetic / Demo Data:
   The underlying LightGBM model was trained on synthetic demonstration data.
   These explanations reflect the patterns learned from that demo dataset,
   not official government determinations.

2. Correlation vs. Causation:
   SHAP values quantify how much each input feature shifted the model's
   internal decision score relative to the baseline. A high positive SHAP value
   indicates that the feature contributed towards a "Delayed" prediction in
   the model, but SHAP does NOT prove real-world causality.
"""

import os
import json
import warnings
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
import shap

# Configuration & Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "lgbm_delay_model.joblib")
METADATA_PATH = os.path.join(BASE_DIR, "models", "feature_metadata.json")

# Module-level caches
_CACHED_PIPELINE = None
_CACHED_EXPLAINER = None
_CACHED_METADATA = None


def load_model_and_explainer():
    """
    Loads the saved LightGBM pipeline from disk and initializes a SHAP TreeExplainer.
    Caches the objects in memory for fast subsequent calls.
    """
    global _CACHED_PIPELINE, _CACHED_EXPLAINER, _CACHED_METADATA

    if _CACHED_PIPELINE is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model file not found at {MODEL_PATH}. "
                "Please ensure `train.py` has been executed first."
            )
        _CACHED_PIPELINE = joblib.load(MODEL_PATH)

        # Suppress benign LightGBM binary classifier version notices from SHAP
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            classifier = _CACHED_PIPELINE.named_steps["classifier"]
            _CACHED_EXPLAINER = shap.TreeExplainer(classifier)

    if _CACHED_METADATA is None and os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            _CACHED_METADATA = json.load(f)

    return _CACHED_PIPELINE, _CACHED_EXPLAINER, _CACHED_METADATA


def explain_case_prediction(case: Dict[str, Any], top_n: int = 5) -> Dict[str, Any]:
    """
    Generates a SHAP explanation for a single land-acquisition case.

    Parameters:
        case (dict): Dictionary with case input features:
            - parcel_count (int)
            - litigation_cases (int)
            - compensation_pending_pct (float)
            - acquisition_stage (str)
            - ownership_disputes (int)
            - document_issues (int)
            - notification_age_months (float)
        top_n (int): Number of top influential factors to highlight.

    Returns:
        dict: Complete prediction and beginner-friendly SHAP explanation.
    """
    pipeline, explainer, _ = load_model_and_explainer()
    preprocessor = pipeline.named_steps["preprocessor"]

    # 1. Convert input dictionary to DataFrame
    df_input = pd.DataFrame([case])

    # 2. Get model prediction and probability
    pred_class = int(pipeline.predict(df_input)[0])
    probabilities = pipeline.predict_proba(df_input)[0]
    delay_prob = float(probabilities[1])
    risk_score = round(delay_prob * 100, 1)

    # 3. Preprocess inputs through ColumnTransformer (handles numerical passthrough & OneHotEncoder)
    X_trans = preprocessor.transform(df_input)
    transformed_col_names = preprocessor.get_feature_names_out()

    # SHAP EXPLANATION SPACE
    # `shap.TreeExplainer(classifier)` with no `model_output=` explains the LightGBM
    # RAW MARGIN (log-odds), NOT probability. Additivity therefore holds as:
    #     base_value + sum(shap_values) == raw_margin (log-odds)
    # and NOT in probability space. SHAP values below are log-odds contributions.
    classifier = pipeline.named_steps["classifier"]
    model_raw_margin = float(classifier.predict(X_trans, raw_score=True)[0])

    # 4. Compute SHAP values for the transformed row
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        raw_shap = explainer.shap_values(X_trans)

    # In binary LightGBM, raw_shap is either ndarray (1, n_cols) or list [class0, class1]
    if isinstance(raw_shap, list):
        shap_row = raw_shap[1][0]  # Focus on class 1: Delayed
    else:
        shap_row = raw_shap[0]

    # Baseline expected value (prior log-odds)
    base_val = explainer.expected_value
    if isinstance(base_val, (list, np.ndarray)):
        base_val = float(base_val[-1])
    else:
        base_val = float(base_val)

    # 5. Aggregate transformed SHAP values back to the 8 original domain features
    #    (Groups one-hot encoded acquisition_stage columns into a single net contribution)
    feature_explanations = []

    # A. Numerical features (direct 1-to-1 mapping). Only names actually present in
    #    the fitted preprocessor are used, so this auto-tracks the model schema
    #    (e.g. `previous_delays_months` removed in Stage 7).
    numerical_features = [
        "parcel_count",
        "litigation_cases",
        "compensation_pending_pct",
        "ownership_disputes",
        "document_issues",
        "notification_age_months",
    ]

    for feat in numerical_features:
        col_name = f"num__{feat}"
        if col_name in transformed_col_names:
            idx = list(transformed_col_names).index(col_name)
            feat_shap = float(shap_row[idx])
            feat_val = case.get(feat, "N/A")
            feature_explanations.append({
                "feature_name": feat,
                "input_value": feat_val,
                "shap_contribution": round(feat_shap, 4),
                "direction": "Increases delay risk (+)" if feat_shap > 0 else "Decreases delay risk (-)" if feat_shap < 0 else "Neutral (0)",
                "impact_magnitude": abs(feat_shap),
            })

    # B. Categorical acquisition_stage (aggregate sum across stage columns)
    stage_indices = [
        i for i, col in enumerate(transformed_col_names)
        if col.startswith("cat__acquisition_stage_")
    ]
    if stage_indices:
        stage_net_shap = float(np.sum(shap_row[stage_indices]))
        actual_stage = case.get("acquisition_stage", "N/A")
        feature_explanations.append({
            "feature_name": "acquisition_stage",
            "input_value": actual_stage,
            "shap_contribution": round(stage_net_shap, 4),
            "direction": "Increases delay risk (+)" if stage_net_shap > 0 else "Decreases delay risk (-)" if stage_net_shap < 0 else "Neutral (0)",
            "impact_magnitude": abs(stage_net_shap),
        })

    # 6. Sort by absolute SHAP contribution to find the top contributing factors
    feature_explanations.sort(key=lambda x: x["impact_magnitude"], reverse=True)

    # Contribution share over ALL domain features (|shap_i| / sum_j |shap_j|).
    # This is a "share of the total absolute attribution", NOT a probability change.
    total_abs = sum(f["impact_magnitude"] for f in feature_explanations) or 1.0
    for f in feature_explanations:
        f["contribution_share"] = round(f["impact_magnitude"] / total_abs, 4)

    # Additivity check (correct space = log-odds / raw margin)
    recon = base_val + sum(f["shap_contribution"] for f in feature_explanations)
    additivity_residual = round(float(recon - model_raw_margin), 6)

    # Top factors
    top_factors = feature_explanations[:top_n]

    # Assign risk tier
    if risk_score >= 65.0:
        risk_tier = "HIGH"
    elif risk_score >= 35.0:
        risk_tier = "MEDIUM"
    else:
        risk_tier = "LOW"

    return {
        "case_summary": {
            "delayed_prediction": pred_class,
            "status_label": (
                "Significant Delay Expected (>6 months)"
                if pred_class == 1
                else "On-Track / Minor Delay (<=6 months)"
            ),
            "delay_probability": round(delay_prob, 4),
            "risk_score": risk_score,
            "risk_tier": risk_tier,
            "base_value_log_odds": round(base_val, 4),
            "model_raw_margin_log_odds": round(model_raw_margin, 4),
        },
        "explanation_space": "lightgbm_raw_margin_log_odds",
        "additivity": {
            "space": "log_odds",
            "base_value": round(base_val, 4),
            "sum_shap": round(float(sum(f["shap_contribution"] for f in feature_explanations)), 4),
            "reconstructed_margin": round(float(recon), 4),
            "model_raw_margin": round(model_raw_margin, 4),
            "residual": additivity_residual,
        },
        "top_contributing_factors": top_factors,
        "all_feature_contributions": feature_explanations,
        "notices": {
            "space_notice": (
                "SHAP values are LightGBM log-odds (raw margin) contributions. "
                "base_value + sum(SHAP) reconstructs the log-odds, NOT the probability. "
                "They are not percentage-point changes in probability."
            ),
            "causation_notice": "SHAP reflects internal model feature attributions (correlations), not real-world causality.",
            "synthetic_notice": "Model trained on synthetic demonstration data. Not verified government records."
        }
    }


def print_friendly_explanation(case_name: str, explanation: Dict[str, Any]):
    """Prints a clean, beginner-friendly table for terminal display."""
    summary = explanation["case_summary"]
    print("\n" + "=" * 75)
    print(f"CASE: {case_name}")
    print("=" * 75)
    print(f"Prediction:       {summary['status_label']} [Class {summary['delayed_prediction']}]")
    print(f"Delay Probability: {summary['delay_probability'] * 100:.1f}%")
    print(f"Risk Score:       {summary['risk_score']} / 100")
    print(f"Risk Tier:        {summary['risk_tier']}")
    print("-" * 75)
    print(f"{'Feature Name':<26} | {'Input Value':<24} | {'SHAP Value':<10} | {'Effect':<22}")
    print("-" * 75)

    for item in explanation["top_contributing_factors"]:
        val_str = str(item["input_value"])
        if len(val_str) > 22:
            val_str = val_str[:19] + "..."
        print(f"{item['feature_name']:<26} | {val_str:<24} | {item['shap_contribution']:>+10.4f} | {item['direction']:<22}")

    print("-" * 75)
    print(f"* Notice: {explanation['notices']['causation_notice']}")
    print(f"* Data:   {explanation['notices']['synthetic_notice']}")


if __name__ == "__main__":
    print("=" * 75)
    print("KSHETRA: SHAP Model Explainability Verification")
    print("=" * 75)

    # 1. High-Risk Test Case
    high_risk_case = {
        "parcel_count": 130,
        "litigation_cases": 4,
        "compensation_pending_pct": 74.0,
        "acquisition_stage": "Declaration (Sec 3D/19)",
        "ownership_disputes": 12,
        "document_issues": 18,
        "notification_age_months": 22.0,
    }

    # 2. Low-Risk Test Case
    low_risk_case = {
        "parcel_count": 40,
        "litigation_cases": 0,
        "compensation_pending_pct": 8.0,
        "acquisition_stage": "Compensation Disbursement",
        "ownership_disputes": 0,
        "document_issues": 1,
        "notification_age_months": 15.0,
    }

    # Run and print High-Risk Explanation
    exp_high = explain_case_prediction(high_risk_case, top_n=5)
    print_friendly_explanation("High-Friction Corridor (Stay Orders & Unpaid Awards)", exp_high)

    # Run and print Low-Risk Explanation
    exp_low = explain_case_prediction(low_risk_case, top_n=5)
    print_friendly_explanation("Low-Friction Corridor (Clear Title & On-Schedule)", exp_low)
