"""
===============================================================================
KSHETRA: Land Acquisition Delay Prediction System
Cox Proportional Hazards Survival Analysis Module (survival.py)
===============================================================================

What is Cox Survival Analysis in KSHETRA?
-----------------------------------------
While the LightGBM classifier predicts a static binary outcome:
  "Will this case experience a significant delay (> 6 months)?" (Yes / No),
the Cox Proportional Hazards model analyzes the TIMING and DYNAMICS of delay:
  "What is the probability that this land-acquisition project remains on track
   WITHOUT succumbing to significant delay past 6, 12, 18, 24, or 36 months?"

Core Survival Terminology in KSHETRA:
-------------------------------------
1. `duration_months` (Time variable T):
   The elapsed calendar duration (in months) from the statutory Section 3A/11
   preliminary gazette notification up to the current observation point.

2. `event_observed` (Event variable E):
   A binary flag indicating whether the event of interest occurred by the
   observation time:
     - 1 = EVENT OCCURRED: Project experienced a significant milestone delay (> 6 months).
     - 0 = RIGHT-CENSORED: Project has remained on track without significant delay
           as of the current observation time. Its future delay status beyond
           this horizon is unobserved.

3. Hazard Rate h(t | X):
   The instantaneous risk rate of a project encountering a significant delay at
   month t, given project covariates X (litigation, compensation backlog, disputes).

4. Delay-Free Survival Probability S(t | X):
   The estimated probability that the case SURVIVES delay-free past month t:
     S(t) = P(Duration without significant delay > t)

DISCLOSURE & ETHICAL NOTICES:
-----------------------------
- Synthetic Demo Data: This model is trained on synthetic demonstration data.
- NOT an Exact Completion Predictor: The Cox model estimates the PROBABILITY
  of remaining on-track over elapsed time. It does NOT predict an exact calendar
  day or final statutory completion date.
"""

import os
import json
import warnings
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
from lifelines import CoxPHFitter

# Configuration & Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "synthetic_land_acquisition_cases.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
COX_MODEL_PATH = os.path.join(MODELS_DIR, "cox_hazard_model.joblib")
COX_METADATA_PATH = os.path.join(MODELS_DIR, "cox_metadata.json")

# LARR Stages
LARR_STAGES = [
    "Notification (Sec 3A/11)",
    "SIA & Objection (Sec 3C/15)",
    "Declaration (Sec 3D/19)",
    "Award Inquiry (Sec 3G/23)",
    "Compensation Disbursement",
    "Possession (Sec 3E/38)",
]

# Baseline reference stage dropped for dummy encoding
REFERENCE_STAGE = "Notification (Sec 3A/11)"
NON_REFERENCE_STAGES = [s for s in LARR_STAGES if s != REFERENCE_STAGE]

# Cox numerical covariates.
#
# `previous_delays_months` was REMOVED (Stage 5 correction). In the synthetic
# dataset it is generated as
#     previous_delays_months = max(0, (notification_age_months - expected_months[stage]) * U(0.5, 0.95))
# i.e. a deterministic transform of the survival DURATION variable
# (`duration_months` = `notification_age_months`) minus a stage constant. Regressing
# it on `notification_age_months` + stage dummies gives R^2 = 0.87. Feeding a
# function of the follow-up time back in as a covariate is duration / immortal-time
# leakage: cases that reached a large elapsed time without the event mechanically
# carry a large `previous_delays_months`, so the fitter attributed their survival
# to it (coef -0.1746, HR 0.84 -> "protective", which is backwards).
#
# It is NOT replaced with a proxy. (Stage 7 also removed it from LightGBM — no
# genuine source field exists, so it was served as a constant 0.)
NUMERICAL_COVARIATES = [
    "parcel_count",
    "litigation_cases",
    "compensation_pending_pct",
    "ownership_disputes",
    "document_issues",
]

# Covariates dropped from the Cox model and why (recorded in the artifact metadata).
REMOVED_COVARIATES = {
    "previous_delays_months": (
        "Duration leakage: in the synthetic dataset this is a deterministic "
        "transform of notification_age_months (the survival duration) minus a "
        "stage constant (R^2 = 0.87 on duration + stage). Kept for LightGBM only."
    ),
}

# Feature-schema identifier for the saved artifact. Bump when the covariate set
# changes so a stale artifact is never used with new prediction code.
COX_FEATURE_SCHEMA = "cox-2.0-no-duration-leak"

# Module-level cache
_CACHED_COX_MODEL = None
_CACHED_COX_METADATA = None


def prepare_survival_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Prepares dataset for survival analysis:
    - Derives `duration_months` from `notification_age_months` (clipped to >= 0.5).
    - Derives `event_observed` from `delayed`.
    - One-hot encodes `acquisition_stage` with a stable reference level.
    """
    df_surv = df.copy()

    # Survival DURATION = elapsed statutory time since Sec 3A/11 notification.
    # This is the time axis only — it is deliberately NOT added to `feature_cols`
    # below, and no covariate may be a deterministic transform of it (that is why
    # `previous_delays_months` was removed — see NUMERICAL_COVARIATES).
    df_surv["duration_months"] = df_surv["notification_age_months"].clip(lower=0.5)
    df_surv["event_observed"] = df_surv["delayed"].astype(int)

    # Encode categorical stage with explicit columns
    for stage in NON_REFERENCE_STAGES:
        col_name = f"stage__{stage}"
        df_surv[col_name] = (df_surv["acquisition_stage"] == stage).astype(float)

    # Assemble feature columns for Cox regression
    stage_cols = [f"stage__{s}" for s in NON_REFERENCE_STAGES]
    feature_cols = NUMERICAL_COVARIATES + stage_cols + ["duration_months", "event_observed"]

    return df_surv[feature_cols]


def train_cox_model(save_artifacts: bool = True) -> CoxPHFitter:
    """
    Trains a Cox Proportional Hazards model on the synthetic land-acquisition dataset.
    """
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"Dataset not found at {DATA_PATH}. Run `python generate_dataset.py` first."
        )

    print(f"[INFO] Loading dataset for Cox survival modeling from: {DATA_PATH}")
    raw_df = pd.read_csv(DATA_PATH)
    surv_df = prepare_survival_data(raw_df)

    print(f"[INFO] Fitting CoxPHFitter on {len(surv_df)} cases (Penalizer=0.1)...")
    # L2 penalizer provides stability against collinearity among dispute and delay metrics
    cph = CoxPHFitter(penalizer=0.1)
    cph.fit(
        surv_df,
        duration_col="duration_months",
        event_col="event_observed",
        show_progress=False,
    )

    c_index = float(cph.concordance_index_)
    n_subjects = int(len(surv_df))
    n_events = int(surv_df["event_observed"].sum())
    print(f"[SUCCESS] Cox model fitted successfully. Concordance Index: {c_index:.4f}")

    if save_artifacts:
        os.makedirs(MODELS_DIR, exist_ok=True)
        joblib.dump(cph, COX_MODEL_PATH)
        print(f"[SAVED] Cox model artifact saved to: {COX_MODEL_PATH}")

        # Extract hazard ratios (exp(coef))
        summary_df = cph.summary
        hazard_ratios = {
            cov: {
                "hazard_ratio": round(float(summary_df.loc[cov, "exp(coef)"]), 4),
                "coef": round(float(summary_df.loc[cov, "coef"]), 4),
                "se": round(float(summary_df.loc[cov, "se(coef)"]), 4),
                "p_value": round(float(summary_df.loc[cov, "p"]), 6),
            }
            for cov in summary_df.index
        }

        metadata = {
            "model_type": "Cox Proportional Hazards Fitter (lifelines)",
            "feature_schema": COX_FEATURE_SCHEMA,
            "penalizer": 0.1,
            "concordance_index": round(c_index, 4),
            "concordance_note": "In-sample (fit and evaluated on the full synthetic set). Likely optimistic.",
            "training_sample_size": n_subjects,
            "event_count": n_events,
            "numerical_covariates": NUMERICAL_COVARIATES,
            "stage_dummy_covariates": [f"stage__{s}" for s in NON_REFERENCE_STAGES],
            "removed_covariates": REMOVED_COVARIATES,
            "reference_stage": REFERENCE_STAGE,
            "non_reference_stages": NON_REFERENCE_STAGES,
            "duration_col": "duration_months",
            "duration_source": "notification_age_months (clipped >= 0.5); NOT used as a covariate",
            "event_col": "event_observed",
            "hazard_ratios": hazard_ratios,
            "disclaimer": "Trained on synthetic demonstration data. Does not predict exact completion dates.",
        }

        with open(COX_METADATA_PATH, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
        print(f"[SAVED] Cox metadata saved to: {COX_METADATA_PATH}")

    return cph


def load_cox_model():
    """Loads and caches the Cox model from disk (or trains it if missing)."""
    global _CACHED_COX_MODEL, _CACHED_COX_METADATA

    if _CACHED_COX_MODEL is None:
        if not os.path.exists(COX_MODEL_PATH):
            print(f"[INFO] Saved Cox model not found at {COX_MODEL_PATH}. Training now...")
            _CACHED_COX_MODEL = train_cox_model(save_artifacts=True)
        else:
            _CACHED_COX_MODEL = joblib.load(COX_MODEL_PATH)

    if _CACHED_COX_METADATA is None and os.path.exists(COX_METADATA_PATH):
        with open(COX_METADATA_PATH, "r", encoding="utf-8") as f:
            _CACHED_COX_METADATA = json.load(f)

    return _CACHED_COX_MODEL, _CACHED_COX_METADATA


def encode_case_for_cox(case: Dict[str, Any]) -> pd.DataFrame:
    """Encodes a single case dictionary into a matching one-row DataFrame for the Cox model.

    Only `NUMERICAL_COVARIATES` + stage dummies are read. Any other keys in `case`
    (e.g. `previous_delays_months`, `notification_age_months`) are ignored here —
    `notification_age_months` is the survival duration, not a covariate, and
    `previous_delays_months` was removed as duration-leaked.
    """
    row = {}

    for col in NUMERICAL_COVARIATES:
        row[col] = float(case.get(col, 0.0))

    actual_stage = case.get("acquisition_stage", REFERENCE_STAGE)
    for stage in NON_REFERENCE_STAGES:
        col_name = f"stage__{stage}"
        row[col_name] = 1.0 if actual_stage == stage else 0.0

    return pd.DataFrame([row])


def predict_case_survival(
    case: Dict[str, Any],
    milestones: List[float] = [6.0, 12.0, 18.0, 24.0, 36.0]
) -> Dict[str, Any]:
    """
    Computes survival-analysis metrics for a single land-acquisition case.

    Parameters:
        case (dict): Case attributes matching the KSHETRA schema.
        milestones (list): Elapsed month milestones at which to query
                           the probability of remaining delay-free.

    Returns:
        dict: Relative hazard ratio, hazard tier, milestone delay-free probabilities,
              and domain notices.
    """
    cph, metadata = load_cox_model()
    df_encoded = encode_case_for_cox(case)

    # 1. Partial Hazard / Relative Risk: exp(X * beta - mean)
    partial_hazard = float(cph.predict_partial_hazard(df_encoded).values[0])

    # 2. Risk classification based on relative hazard
    if partial_hazard >= 1.75:
        hazard_tier = "CRITICAL HAZARD (>1.75x baseline risk)"
    elif partial_hazard >= 1.20:
        hazard_tier = "ELEVATED HAZARD (>1.20x baseline risk)"
    elif partial_hazard >= 0.70:
        hazard_tier = "MODERATE / TYPICAL HAZARD"
    else:
        hazard_tier = "LOW HAZARD (Protective profile)"

    # 3. Delay-free survival curve S(t | X).
    #
    #   S(t | X) = model probability that a case with these covariates remains
    #   delay-free THROUGH t elapsed months measured FROM the Sec 3A/11
    #   notification (the survival origin). It is NOT "probability over the next
    #   t months from today" and NOT conditioned on the case's current age.
    clean_milestones = sorted([float(m) for m in milestones])
    surv_curve = cph.predict_survival_function(df_encoded, times=clean_milestones)

    milestone_probabilities = {}
    for t in clean_milestones:
        prob = float(surv_curve.loc[t].values[0]) if t in surv_curve.index else float(surv_curve.iloc[(surv_curve.index - t).abs().argsort()[:1]].values[0])
        milestone_probabilities[f"month_{int(t)}"] = {
            "elapsed_months": int(t),
            "months_since_notification": int(t),
            "delay_free_probability": round(prob, 4),
            "delay_free_percent": f"{prob * 100:.1f}%",
        }

    # 4. Model median delay-free time, measured FROM the notification origin.
    #    = the elapsed month at which S(t|X) first drops to 0.50.
    #    This is an ABSOLUTE-from-origin figure, NOT "months remaining from today".
    fine_times = np.linspace(1.0, 60.0, 120)
    fine_surv = cph.predict_survival_function(df_encoded, times=fine_times)
    median_time_row = fine_surv[fine_surv.iloc[:, 0] <= 0.50]
    if not median_time_row.empty:
        median_from_notification = round(float(median_time_row.index[0]), 1)
        estimated_delay_onset_month = f"~{median_from_notification:.1f} months since notification"
    else:
        median_from_notification = None
        estimated_delay_onset_month = ">60 months since notification (stays >50% delay-free across the modelled horizon)"

    # Current elapsed acquisition age (an INPUT, echoed for honest context).
    elapsed_age = case.get("notification_age_months")
    try:
        elapsed_age = round(float(elapsed_age), 1) if elapsed_age is not None else None
    except (TypeError, ValueError):
        elapsed_age = None

    # We deliberately do NOT publish a "months remaining" number: the Cox model is
    # fit on cross-sectional current-status data with proportional-hazards
    # violations (Stage 5), so a conditional remaining-time estimate would be a
    # false precision. See remaining_time_note below.
    past_median = (
        elapsed_age is not None
        and median_from_notification is not None
        and elapsed_age > median_from_notification
    )

    # 5. Top hazard contributors for this case
    hazard_drivers = []
    if case.get("litigation_cases", 0) > 0:
        hazard_drivers.append(f"Litigation Cases ({case['litigation_cases']} active suits)")
    if case.get("compensation_pending_pct", 0.0) > 40.0:
        hazard_drivers.append(f"High Compensation Pending ({case['compensation_pending_pct']}%)")
    if case.get("ownership_disputes", 0) > 3:
        hazard_drivers.append(f"Ownership Disputes ({case['ownership_disputes']} contested parcels)")
    if not hazard_drivers:
        hazard_drivers.append("Low friction indicators across all covariates")

    return {
        "hazard_analysis": {
            "partial_hazard_ratio": round(partial_hazard, 4),
            "hazard_tier": hazard_tier,
            # Kept for backward compatibility; string is now explicit about the origin.
            "estimated_median_delay_free_milestone": estimated_delay_onset_month,
            "key_hazard_drivers": hazard_drivers,
        },
        "time_analysis": {
            "reference_origin": "sec_3a_11_notification",
            "elapsed_notification_age_months": elapsed_age,
            "median_delay_free_months_from_notification": median_from_notification,
            "elapsed_past_model_median": past_median,
            "remaining_time_note": (
                "Months remaining from today is NOT estimated. The Cox model is fit on "
                "cross-sectional current-status data with proportional-hazards violations, "
                "so a conditional remaining-time figure would be false precision. Use the "
                "S(t) curve and relative hazard for time context."
            ),
        },
        "delay_free_survival_curve": milestone_probabilities,
        "notices": {
            "definition": (
                "S(t) = model probability the case stays delay-free through t elapsed "
                "months measured FROM Sec 3A/11 notification (the survival origin). "
                "Not 'probability over the next t months from today'."
            ),
            "non_completion_notice": (
                "The Cox model does NOT predict an exact calendar completion date. "
                "It models risk accumulation over elapsed statutory time."
            ),
            "synthetic_notice": (
                "Trained on synthetic demonstration data for prototyping and research."
            ),
        }
    }


def print_friendly_survival_report(case_name: str, result: Dict[str, Any]):
    """Formats survival results in a clean, human-readable terminal presentation."""
    haz = result["hazard_analysis"]
    curve = result["delay_free_survival_curve"]

    print("\n" + "=" * 75)
    print(f"COX SURVIVAL ANALYSIS: {case_name}")
    print("=" * 75)
    print(f"Partial Hazard (Relative Risk): {haz['partial_hazard_ratio']}x baseline")
    print(f"Hazard Tier:                   {haz['hazard_tier']}")
    print(f"Median Delay-Free Milestone:   {haz['estimated_median_delay_free_milestone']}")
    print(f"Key Hazard Drivers:            {', '.join(haz['key_hazard_drivers'])}")
    print("-" * 75)
    print(f"{'Statutory Milestone':<28} | {'Delay-Free Probability':<24} | {'Status'}")
    print("-" * 75)

    for _, data in curve.items():
        m_str = f"At Month {data['elapsed_months']} from Notification"
        pct_str = data["delay_free_percent"]
        prob = data["delay_free_probability"]
        status = "Favorable (Low Delay Risk)" if prob >= 0.70 else "At-Risk (Moderate Friction)" if prob >= 0.40 else "Severe Delay Hazard"
        print(f"{m_str:<28} | {pct_str:<24} | {status}")

    print("-" * 75)
    print(f"* Notice: {result['notices']['non_completion_notice']}")
    print(f"* Data:   {result['notices']['synthetic_notice']}")


if __name__ == "__main__":
    print("=" * 75)
    print("KSHETRA: Cox Proportional Hazards Model Training & Verification")
    print("=" * 75)

    # 1. Train or load Cox model
    cph = train_cox_model(save_artifacts=True)

    # 2. Test Sample: High-Friction Case
    sample_case = {
        "parcel_count": 120,
        "litigation_cases": 4,
        "compensation_pending_pct": 75.0,
        "acquisition_stage": "Declaration (Sec 3D/19)",
        "ownership_disputes": 10,
        "document_issues": 15,
        "notification_age_months": 20.0,
    }

    res = predict_case_survival(sample_case)
    print_friendly_survival_report("High-Friction Highway Corridor", res)
