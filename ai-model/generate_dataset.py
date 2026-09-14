"""
===============================================================================
KSHETRA: Land Acquisition Delay Prediction System
Dataset Generation Script (Synthetic / Demo Data)
===============================================================================

DISCLOSURE & ETHICAL NOTICE:
This dataset is ENTIRELY SYNTHETIC. It has been generated algorithmically for 
prototyping, educational demonstration, and testing ML pipelines.
It does NOT contain real government land records, private landowner information,
or actual official litigation documents.

Each row in this dataset represents one LAND ACQUISITION CASE / PROJECT
(e.g., a highway bypass section, industrial corridor expansion, or railway line).

Target Variable:
- `delayed` (binary):
    0 = No significant delay (on-track or delay <= 6 months)
    1 = Significant delay (project delay > 6 months)
"""

import os
import numpy as np
import pandas as pd

# Set reproducible random seed
RANDOM_SEED = 42
np.random.seed(RANDOM_SEED)

LARR_STAGES = [
    "Notification (Sec 3A/11)",
    "SIA & Objection (Sec 3C/15)",
    "Declaration (Sec 3D/19)",
    "Award Inquiry (Sec 3G/23)",
    "Compensation Disbursement",
    "Possession (Sec 3E/38)",
]

# Baseline expected timeline (in months) from start to reaching each stage
STAGE_EXPECTED_MONTHS = {
    "Notification (Sec 3A/11)": 3.0,
    "SIA & Objection (Sec 3C/15)": 8.0,
    "Declaration (Sec 3D/19)": 14.0,
    "Award Inquiry (Sec 3G/23)": 20.0,
    "Compensation Disbursement": 26.0,
    "Possession (Sec 3E/38)": 32.0,
}

PROJECT_PREFIXES = [
    "Salem Bypass Extension",
    "Coimbatore Ring Road Sec",
    "Madurai Logistics Park",
    "SIPCOT Industrial Corridor",
    "Hosur IT Expressway",
    "Tiruchirappalli Freight Link",
    "Thoothukudi Port Rail Spur",
    "Tirunelveli Solar Park Access",
    "Vellore Urban Peripheral",
    "Erode Agri-Logistics Zone",
]


def generate_synthetic_dataset(num_samples: int = 1200) -> pd.DataFrame:
    """Generates a realistic synthetic dataset representing land-acquisition cases."""
    records = []

    for i in range(1, num_samples + 1):
        case_id = f"CASE-{i:04d}"
        prefix = np.random.choice(PROJECT_PREFIXES)
        case_name = f"{prefix} Phase {np.random.randint(1, 4)} (Sec {np.random.randint(1, 8)})"

        # 1. Acquisition Stage (distribute across statutory acquisition lifecycle)
        stage = np.random.choice(
            LARR_STAGES,
            p=[0.18, 0.17, 0.20, 0.18, 0.15, 0.12],
        )
        expected_months = STAGE_EXPECTED_MONTHS[stage]

        # 2. Project scale: parcel count (small road upgrade to massive corridor)
        # Log-normal distribution to reflect realistic project size variance
        parcel_count = int(np.clip(np.random.exponential(scale=65) + 15, 10, 500))

        # 3. Litigation cases (stays, partition suits, compensation disputes)
        # Larger projects and older projects naturally attract more disputes
        litigation_lambda = max(0.2, (parcel_count / 50.0) * np.random.uniform(0.3, 1.4))
        litigation_cases = int(np.random.poisson(lam=litigation_lambda))

        # 4. Ownership & Title disputes (joint heirs, unpartitioned claims)
        dispute_ratio = np.random.beta(a=1.5, b=5.0)
        ownership_disputes = int(min(parcel_count, np.random.binomial(n=parcel_count, p=dispute_ratio * 0.25)))

        # 5. Document & Revenue Issues (missing patta, unmutated khatas)
        doc_ratio = np.random.beta(a=2.0, b=6.0)
        document_issues = int(min(parcel_count, np.random.binomial(n=parcel_count, p=doc_ratio * 0.30)))

        # 6. Elapsed time since initial Notification (notification_age_months)
        # Projects can experience friction, pushing elapsed age above expected stage time
        age_noise = np.random.normal(loc=0, scale=4.0)
        delay_drift = np.random.exponential(scale=6.0) if litigation_cases > 2 else np.random.exponential(scale=2.0)
        notification_age_months = round(max(1.0, expected_months + age_noise + delay_drift), 1)

        # 7. Previous delays already logged up to current milestone
        expected_stage_progress_ratio = (LARR_STAGES.index(stage) + 1) / len(LARR_STAGES)
        previous_delays_months = round(
            max(0.0, (notification_age_months - expected_months) * np.random.uniform(0.5, 0.95)),
            1,
        )

        # 8. Compensation Pending Percentage (0 to 100%)
        # In early stages, pending compensation is naturally high;
        # in late stages, high pending compensation is a red flag for delay.
        stage_idx = LARR_STAGES.index(stage)
        if stage_idx <= 1:
            comp_pending_pct = round(np.random.uniform(70.0, 100.0), 1)
        elif stage_idx <= 3:
            comp_pending_pct = round(np.random.uniform(30.0, 85.0), 1)
        else:
            # Late stage: ideally low, but problematic projects have high backlog
            comp_pending_pct = round(
                np.random.choice(
                    [np.random.uniform(0.0, 25.0), np.random.uniform(30.0, 75.0)],
                    p=[0.70, 0.30],
                ),
                1,
            )

        # ---------------------------------------------------------------------
        # Ground Truth Delay Risk Calculation (Domain Heuristic + Stochastic Noise)
        # ---------------------------------------------------------------------
        # Target definition: Delayed = 1 if the case incurs > 6 months significant delay
        delay_log_odds = -2.2  # Baseline prior

        # A. Legal litigation impact (each court case adds significant friction)
        delay_log_odds += min(3.0, litigation_cases * 0.55)

        # B. Ownership & title fragmentation
        dispute_fraction = ownership_disputes / max(1, parcel_count)
        delay_log_odds += dispute_fraction * 3.2

        # C. Missing documents & unmutated records
        doc_issue_fraction = document_issues / max(1, parcel_count)
        delay_log_odds += doc_issue_fraction * 2.2

        # D. High compensation backlog in late stages causes citizen opposition
        if stage_idx >= 3 and comp_pending_pct > 40.0:
            delay_log_odds += 1.4
        elif comp_pending_pct > 80.0:
            delay_log_odds += 0.5

        # E. Historical accumulated delay is a strong signal of systemic bottleneck
        delay_log_odds += min(2.5, (previous_delays_months / 6.0) * 0.7)

        # F. Notification age beyond expected schedule
        schedule_overrun = notification_age_months - expected_months
        if schedule_overrun > 6.0:
            delay_log_odds += min(2.0, (schedule_overrun / 6.0) * 0.8)

        # G. Add realistic stochastic variance (unobserved factors: political, weather, contractor)
        delay_log_odds += np.random.normal(loc=0.0, scale=0.6)

        # Convert log-odds to probability via sigmoid
        prob_delay = 1.0 / (1.0 + np.exp(-delay_log_odds))
        delayed = int(prob_delay >= 0.50)

        records.append({
            "case_id": case_id,
            "case_name": case_name,
            "parcel_count": parcel_count,
            "litigation_cases": litigation_cases,
            "compensation_pending_pct": comp_pending_pct,
            "acquisition_stage": stage,
            "ownership_disputes": ownership_disputes,
            "document_issues": document_issues,
            "previous_delays_months": previous_delays_months,
            "notification_age_months": notification_age_months,
            "delayed": delayed,
        })

    df = pd.DataFrame(records)
    return df


def main():
    print("=" * 70)
    print("KSHETRA: Generating Synthetic Land Acquisition Dataset")
    print("Notice: This is 100% synthetic/demo data for academic and prototyping use.")
    print("=" * 70)

    df = generate_synthetic_dataset(num_samples=1500)

    # Ensure output data directory exists
    output_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(output_dir, "synthetic_land_acquisition_cases.csv")
    df.to_csv(output_path, index=False)

    print(f"\n[SUCCESS] Dataset generated and saved to:")
    print(f"          {output_path}")
    print(f"\nDataset Overview:")
    print(f"- Total Cases (rows): {len(df)}")
    print(f"- Total Features:     {len(df.columns) - 3} (excluding ID, Name, Target)")
    print(f"- Class Distribution: ")
    print(df["delayed"].value_counts(normalize=True).rename({
        0: "0 (On-track / delay <= 6 mo)",
        1: "1 (Significant delay > 6 mo)"
    }))
    print("\nFeature Summary Statistics:")
    print(df.describe().round(2).to_string())
    print("\nSample Records:")
    print(df.head(3).to_string())


if __name__ == "__main__":
    main()
