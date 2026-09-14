"""
===============================================================================
KSHETRA: Deterministic DEMO DATA FALLBACK
===============================================================================

PURPOSE
-------
This module produces a *deterministic*, rule-based land-acquisition delay
estimate that mirrors the response shape of the real ML pipeline
(LightGBM classification + SHAP explainability + Cox survival analysis).

It exists ONLY so the `/predict` endpoint can still return a stable, structured
answer when the trained model artifacts cannot be loaded or an inference call
raises inside the demo environment. It is:

  * DETERMINISTIC   - the same input always yields exactly the same output.
                      There is NO randomness anywhere in this file.
  * CLEARLY LABELED - every response carries meta.mode == "demo-fallback" so the
                      frontend and the audit log can distinguish it from a real
                      model run (meta.mode == "live-model").
  * SEPARATE        - this logic is never mixed into the trained-model code path
                      in predict.py / explain.py / survival.py. main.py only
                      calls it from an explicit `except` branch.

This is NOT a government determination and NOT a substitute for the trained
model. It is a transparent heuristic for demonstration continuity.
"""

from __future__ import annotations

from typing import Any, Dict, List

VALID_STAGES = [
    "Notification (Sec 3A/11)",
    "SIA & Objection (Sec 3C/15)",
    "Declaration (Sec 3D/19)",
    "Award Inquiry (Sec 3G/23)",
    "Compensation Disbursement",
    "Possession (Sec 3E/38)",
]

# Fixed, hand-tuned weights (log-odds style contributions). No RNG, no fitting.
_STAGE_WEIGHT: Dict[str, float] = {
    "Notification (Sec 3A/11)": 0.15,
    "SIA & Objection (Sec 3C/15)": 0.35,
    "Declaration (Sec 3D/19)": 0.10,
    "Award Inquiry (Sec 3G/23)": -0.10,
    "Compensation Disbursement": -0.25,
    "Possession (Sec 3E/38)": -0.40,
}

_FEATURE_LABELS = {
    "previous_delays_months": "Historical Pipeline Delay",
    "litigation_cases": "Active Court Stays / Litigation",
    "compensation_pending_pct": "Compensation Pending Backlog",
    "notification_age_months": "Gazette Notification Age",
    "ownership_disputes": "Title Partition Disputes",
    "document_issues": "Revenue Documentation Lag",
    "parcel_count": "Project Corridor Scale",
    "acquisition_stage": "LARR Statutory Stage",
}

_CATEGORY = {
    "litigation_cases": "legal",
    "ownership_disputes": "ownership",
    "compensation_pending_pct": "compensation",
    "document_issues": "document",
    "previous_delays_months": "mutation",
    "notification_age_months": "legal",
    "parcel_count": "spatial",
    "acquisition_stage": "legal",
}


def _sigmoid(x: float) -> float:
    # Bounded, pure function.
    import math

    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def _contributions(case: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Deterministic per-feature log-odds contributions (SHAP-style)."""
    litigation = float(case.get("litigation_cases", 0) or 0)
    ownership = float(case.get("ownership_disputes", 0) or 0)
    doc_issues = float(case.get("document_issues", 0) or 0)
    comp_pending = float(case.get("compensation_pending_pct", 0.0) or 0.0)
    age = float(case.get("notification_age_months", 0.0) or 0.0)
    parcels = float(case.get("parcel_count", 0) or 0)
    stage = str(case.get("acquisition_stage", ""))

    # `previous_delays_months` removed (Stage 7) — matches the LightGBM schema.
    raw = {
        "litigation_cases": 0.55 * litigation - 0.75,
        "ownership_disputes": 0.045 * ownership - 0.15,
        "document_issues": 0.035 * doc_issues - 0.15,
        "compensation_pending_pct": 0.02 * (comp_pending - 45.0),
        "notification_age_months": 0.02 * (age - 18.0),
        "parcel_count": 0.0015 * (parcels - 120.0),
        "acquisition_stage": _STAGE_WEIGHT.get(stage, 0.0),
    }

    out: List[Dict[str, Any]] = []
    for feat, val in raw.items():
        contribution = round(val, 4)
        out.append(
            {
                "feature_name": feat,
                "input_value": case.get(feat, "N/A"),
                "shap_contribution": contribution,
                "direction": (
                    "Increases delay risk (+)"
                    if contribution > 0
                    else "Decreases delay risk (-)"
                    if contribution < 0
                    else "Neutral (0)"
                ),
                "impact_magnitude": abs(contribution),
            }
        )
    out.sort(key=lambda d: d["impact_magnitude"], reverse=True)
    total_abs = sum(d["impact_magnitude"] for d in out) or 1.0
    for d in out:
        d["contribution_share"] = round(d["impact_magnitude"] / total_abs, 4)
    return out


def _drivers(case: Dict[str, Any]) -> List[str]:
    drivers: List[str] = []
    lit = int(case.get("litigation_cases", 0) or 0)
    if lit >= 3:
        drivers.append(f"High Litigation Count ({lit} active court cases/stay orders)")
    elif lit >= 1:
        drivers.append(f"Active Litigation ({lit} civil case pending)")
    if int(case.get("ownership_disputes", 0) or 0) >= 5:
        drivers.append(
            f"Severe Title Fragmentation ({int(case['ownership_disputes'])} co-owner/partition disputes)"
        )
    if int(case.get("document_issues", 0) or 0) >= 8:
        drivers.append(
            f"Revenue Documentation Lag ({int(case['document_issues'])} unmutated/stale records)"
        )
    if float(case.get("compensation_pending_pct", 0.0) or 0.0) > 50.0:
        drivers.append(
            f"Compensation Backlog ({float(case['compensation_pending_pct']):.1f}% funds undisbursed)"
        )
    if float(case.get("notification_age_months", 0.0) or 0.0) >= 24.0:
        drivers.append(
            f"Prolonged Gazette Age ({float(case['notification_age_months']):.1f} months since Sec 3A notification)"
        )
    if not drivers:
        drivers.append("Normal operational parameters; no critical red flags detected")
    return drivers


def _survival_curve(delay_prob: float) -> Dict[str, Dict[str, Any]]:
    """Deterministic monotonic delay-free survival curve derived from delay_prob."""
    curve: Dict[str, Dict[str, Any]] = {}
    for month, decay in ((6, 0.15), (12, 0.45), (18, 0.85), (24, 1.35), (36, 2.4)):
        s = max(0.0, min(1.0, 1.0 - delay_prob * decay))
        curve[f"month_{month}"] = {
            "elapsed_months": month,
            "delay_free_probability": round(s, 4),
            "delay_free_percent": f"{s * 100:.1f}%",
        }
    return curve


def predict_case_demo(case: Dict[str, Any], top_n: int = 5) -> Dict[str, Any]:
    """
    Deterministic fallback prediction with the SAME response structure as the
    live `/predict` model path. Same input -> identical output, every time.
    """
    contributions = _contributions(case)
    base_value = -0.85  # fixed prior log-odds (was -0.55; +0.30 absorbed the removed previous_delays_months term)
    logit = base_value + sum(c["shap_contribution"] for c in contributions)
    delay_prob = round(_sigmoid(logit), 4)
    risk_score = round(delay_prob * 100, 1)

    if risk_score >= 65.0:
        risk_tier = "HIGH"
    elif risk_score >= 35.0:
        risk_tier = "MEDIUM"
    else:
        risk_tier = "LOW"

    delayed = 1 if delay_prob >= 0.5 else 0

    # Cox-style relative hazard, deterministic from the same logit.
    partial_hazard = round(_sigmoid(logit) * 2.5 + 0.35, 4)
    if partial_hazard >= 1.75:
        hazard_tier = "CRITICAL HAZARD (>1.75x baseline risk)"
    elif partial_hazard >= 1.20:
        hazard_tier = "ELEVATED HAZARD (>1.20x baseline risk)"
    elif partial_hazard >= 0.70:
        hazard_tier = "MODERATE / TYPICAL HAZARD"
    else:
        hazard_tier = "LOW HAZARD (Protective profile)"

    age = float(case.get("notification_age_months", 18.0) or 18.0)
    # The demo fallback does NOT convert probability to months (no calibrated
    # time model). It only echoes the elapsed age and a qualitative statement.
    median_milestone = "Not estimated (demo fallback has no time-to-event model)"

    haz_drivers: List[str] = []
    if int(case.get("litigation_cases", 0) or 0) > 0:
        haz_drivers.append(f"Litigation Cases ({int(case['litigation_cases'])} active suits)")
    if float(case.get("compensation_pending_pct", 0.0) or 0.0) > 40.0:
        haz_drivers.append(
            f"High Compensation Pending ({float(case['compensation_pending_pct'])}%)"
        )
    if int(case.get("ownership_disputes", 0) or 0) > 3:
        haz_drivers.append(
            f"Ownership Disputes ({int(case['ownership_disputes'])} contested parcels)"
        )
    if not haz_drivers:
        haz_drivers.append("Low friction indicators across all covariates")

    top_factors = contributions[:top_n]

    return {
        "classification": {
            "delayed_prediction": delayed,
            "status_label": (
                "Significant Delay Expected (>6 months)"
                if delayed == 1
                else "On-Track / Minor Delay (<=6 months)"
            ),
            "delay_probability": delay_prob,
            "risk_score": risk_score,
            "risk_tier": risk_tier,
        },
        "explainability": {
            "top_risk_drivers": top_factors,
            "all_features_analyzed": len(contributions),
            "explanation_space": "demo_fallback_log_odds_heuristic",
            "base_value_log_odds": round(base_value, 4),
            "additivity": {
                "space": "log_odds",
                "base_value": round(base_value, 4),
                "sum_shap": round(sum(c["shap_contribution"] for c in contributions), 4),
                "reconstructed_margin": round(logit, 4),
                "model_raw_margin": round(logit, 4),
                "residual": 0.0,
            },
            "space_notice": (
                "Deterministic demo heuristic log-odds contributions (NOT SHAP). "
                "base_value + sum reconstructs the heuristic logit, not a probability."
            ),
            "causation_notice": (
                "Deterministic demo heuristic attribution. Not SHAP, and not real-world causality."
            ),
            "human_readable_drivers": _drivers(case),
        },
        "survival_analysis": {
            "partial_hazard_ratio": partial_hazard,
            "hazard_tier": hazard_tier,
            "estimated_median_delay_free_milestone": median_milestone,
            "key_hazard_drivers": haz_drivers,
            "delay_free_survival_curve": _survival_curve(delay_prob),
            "time_analysis": {
                "reference_origin": "sec_3a_11_notification",
                "elapsed_notification_age_months": round(age, 1),
                "median_delay_free_months_from_notification": None,
                "elapsed_past_model_median": None,
                "remaining_time_note": (
                    "Demo fallback does not estimate months remaining or a time-to-event."
                ),
            },
            "survival_definition": (
                "Deterministic demo delay-free curve derived from the heuristic delay "
                "probability. Not a fitted survival model."
            ),
            "non_completion_notice": (
                "The demo fallback does NOT predict an exact calendar completion date."
            ),
        },
        "disclaimer": (
            "DETERMINISTIC DEMO FALLBACK. The trained LightGBM / SHAP / Cox pipeline "
            "was unavailable for this request, so a rule-based estimate was returned. "
            "Not an official government determination."
        ),
    }
