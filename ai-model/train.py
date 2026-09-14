"""
===============================================================================
KSHETRA: Land Acquisition Delay Prediction System
Model Training Script (LightGBM Binary Classifier)
===============================================================================

This script:
1. Loads the synthetic land-acquisition cases dataset.
2. Prepares numerical and categorical features.
3. Splits data into training and testing sets (80/20 stratified).
4. Trains a LightGBM Binary Classifier.
5. Evaluates the model using Accuracy, Precision, Recall, F1, and ROC-AUC.
6. Analyzes feature importance.
7. Saves the trained model pipeline and metadata to `models/` for downstream
   FastAPI inference.

IMPORTANT:
The model is trained on synthetic demonstration data. Metrics reflect pattern
recognition on this demo dataset and should NOT be cited as verified real-world
government accuracy.
"""

import json
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
import lightgbm as lgb

from generate_dataset import LARR_STAGES, generate_synthetic_dataset

# Configuration
RANDOM_STATE = 42
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "synthetic_land_acquisition_cases.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
MODEL_SAVE_PATH = os.path.join(MODELS_DIR, "lgbm_delay_model.joblib")
METADATA_SAVE_PATH = os.path.join(MODELS_DIR, "feature_metadata.json")

# Feature schema identifier. Bump whenever the feature set changes so a stale
# artifact is never served with mismatched prediction code.
FEATURE_SCHEMA = "lgbm-2.0-no-previous-delays"

# `previous_delays_months` was REMOVED (Stage 7).
#   - It was the #1 feature by gain (~31%) in the v1 model.
#   - The prototype has NO field that genuinely populates it, so it was served as
#     a constant 0 for every request -> a severe train/serve skew on the model's
#     most important feature (training mean 2.7; a step of ~0.45 in predicted
#     probability occurs between served 0 and the training mid-range).
#   - In the synthetic generator it is a deterministic transform of
#     (notification_age_months - expected_months[stage]) * U(0.5, 0.95), i.e. a
#     function of the schedule-overrun quantity that also drives the label.
#   Removing it costs ~0.02 synthetic holdout ROC-AUC and leaves a model whose
#   every feature has a defensible, genuinely-populated served value.
REMOVED_FEATURES = {
    "previous_delays_months": (
        "No genuine source field in the prototype (served constant 0 -> train/serve "
        "skew on the top feature); also a transform of notification_age_months in the "
        "synthetic generator. Removed Stage 7."
    ),
}

# Define the exact features used for prediction (6 numeric + 1 categorical).
NUMERICAL_FEATURES = [
    "parcel_count",
    "litigation_cases",
    "compensation_pending_pct",
    "ownership_disputes",
    "document_issues",
    "notification_age_months",
]

CATEGORICAL_FEATURES = [
    "acquisition_stage",
]

TARGET = "delayed"


def load_data() -> pd.DataFrame:
    """Loads dataset from CSV or triggers generation if missing."""
    if not os.path.exists(DATA_PATH):
        print(f"[INFO] Dataset not found at {DATA_PATH}. Generating synthetic data...")
        df = generate_synthetic_dataset(num_samples=1500)
        os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
        df.to_csv(DATA_PATH, index=False)
        print(f"[INFO] Synthetic dataset generated and saved to {DATA_PATH}")
    else:
        print(f"[INFO] Loading existing dataset from: {DATA_PATH}")
        df = pd.read_csv(DATA_PATH)
    return df


def build_pipeline() -> Pipeline:
    """Creates a scikit-learn pipeline with preprocessing and LightGBM classifier."""
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", "passthrough", NUMERICAL_FEATURES),
            (
                "cat",
                OneHotEncoder(categories=[LARR_STAGES], handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            ),
        ]
    )

    # Lightweight, laptop-friendly LightGBM binary classifier
    lgbm = lgb.LGBMClassifier(
        objective="binary",
        n_estimators=120,
        learning_rate=0.04,
        num_leaves=24,
        max_depth=5,
        min_child_samples=15,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=RANDOM_STATE,
        verbose=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", lgbm),
        ]
    )
    return pipeline


def evaluate_and_report(pipeline: Pipeline, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
    """Computes comprehensive evaluation metrics on the test split."""
    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    roc_auc = roc_auc_score(y_test, y_prob)
    cm = confusion_matrix(y_test, y_pred)

    print("\n" + "=" * 60)
    print("LIGHTGBM MODEL EVALUATION (Synthetic Test Split)")
    print("=" * 60)
    print(f"Accuracy:  {acc:.4f}  (Synthetic benchmark)")
    print(f"Precision: {prec:.4f}  (When model predicts delay, how often is it right)")
    print(f"Recall:    {rec:.4f}  (Proportion of delayed cases successfully identified)")
    print(f"F1-Score:  {f1:.4f}  (Harmonic mean of precision & recall)")
    print(f"ROC-AUC:   {roc_auc:.4f}  (Ranking discriminability)")
    print("\nConfusion Matrix:")
    print(f"  [TN={cm[0,0]}  FP={cm[0,1]}]")
    print(f"  [FN={cm[1,0]}  TP={cm[1,1]}]")
    print("\nDetailed Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["On-Track (0)", "Delayed (1)"]))

    return {
        "accuracy": round(float(acc), 4),
        "precision": round(float(prec), 4),
        "recall": round(float(rec), 4),
        "f1_score": round(float(f1), 4),
        "roc_auc": round(float(roc_auc), 4),
        "confusion_matrix": cm.tolist(),
    }


def cross_validate_roc_auc(df: pd.DataFrame, n_splits: int = 5) -> dict:
    """Stratified k-fold CV ROC-AUC on the full synthetic set (robustness check)."""
    feature_cols = NUMERICAL_FEATURES + CATEGORICAL_FEATURES
    X, y = df[feature_cols], df[TARGET]
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_STATE)
    scores = cross_val_score(build_pipeline(), X, y, cv=cv, scoring="roc_auc")
    return {
        "cv_folds": n_splits,
        "roc_auc_mean": round(float(scores.mean()), 4),
        "roc_auc_std": round(float(scores.std()), 4),
        "roc_auc_per_fold": [round(float(s), 4) for s in scores],
    }


def training_feature_distribution(df: pd.DataFrame) -> dict:
    """Per-numeric-feature summary stats — consumed by the backend soft OOD diagnostic."""
    out = {}
    for f in NUMERICAL_FEATURES:
        s = df[f].astype(float)
        out[f] = {
            "min": round(float(s.min()), 2),
            "max": round(float(s.max()), 2),
            "mean": round(float(s.mean()), 2),
            "median": round(float(s.median()), 2),
            "p01": round(float(s.quantile(0.01)), 2),
            "p99": round(float(s.quantile(0.99)), 2),
        }
    return out


def print_feature_importance(pipeline: Pipeline):
    """Displays feature importances from the trained LightGBM model."""
    preprocessor: ColumnTransformer = pipeline.named_steps["preprocessor"]
    classifier: lgb.LGBMClassifier = pipeline.named_steps["classifier"]

    # Retrieve transformed feature names
    cat_encoder: OneHotEncoder = preprocessor.named_transformers_["cat"]
    encoded_cat_names = cat_encoder.get_feature_names_out(CATEGORICAL_FEATURES)
    all_feature_names = NUMERICAL_FEATURES + list(encoded_cat_names)

    importances = classifier.feature_importances_
    fi_df = pd.DataFrame({
        "Feature": all_feature_names,
        "Importance (Split Count)": importances
    }).sort_values(by="Importance (Split Count)", ascending=False)

    print("\n" + "=" * 60)
    print("TOP FEATURE IMPORTANCES")
    print("=" * 60)
    print(fi_df.to_string(index=False))


def save_artifacts(pipeline: Pipeline, metadata: dict):
    """Saves serialized model and feature metadata for FastAPI consumption."""
    os.makedirs(MODELS_DIR, exist_ok=True)

    joblib.dump(pipeline, MODEL_SAVE_PATH)
    print(f"\n[SAVED] Trained LightGBM pipeline saved to:")
    print(f"        {MODEL_SAVE_PATH}")

    with open(METADATA_SAVE_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[SAVED] Metadata and feature schema saved to:")
    print(f"        {METADATA_SAVE_PATH}")


def main():
    print("=" * 70)
    print("KSHETRA: Training LightGBM Model for Land Acquisition Delay")
    print("=" * 70)

    # 1. Load dataset
    df = load_data()

    # 2. Separate features (X) and target (y)
    feature_cols = NUMERICAL_FEATURES + CATEGORICAL_FEATURES
    X = df[feature_cols]
    y = df[TARGET]

    # 3. Train / Test Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=RANDOM_STATE, stratify=y
    )
    print(f"[INFO] Training set size: {len(X_train)} cases | Test set size: {len(X_test)} cases")

    # 4. Build and train pipeline (production model = fit on the 80% train split)
    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    # 5. Evaluate — holdout + cross-validation
    holdout_metrics = evaluate_and_report(pipeline, X_test, y_test)
    print("\n[INFO] Running stratified 5-fold cross-validation (ROC-AUC)...")
    cv_metrics = cross_validate_roc_auc(df, n_splits=5)
    print(f"       CV ROC-AUC: {cv_metrics['roc_auc_mean']} +/- {cv_metrics['roc_auc_std']}  folds={cv_metrics['roc_auc_per_fold']}")

    # 6. Feature importances
    print_feature_importance(pipeline)

    # 7. Assemble metadata
    metadata = {
        "model_name": "LightGBM Binary Classifier for Land Acquisition Delay",
        "model_version": "2.0.0-synthetic-demo",
        "feature_schema": FEATURE_SCHEMA,
        "target": {
            "name": TARGET,
            "classes": {
                "0": "No significant delay (delay <= 6 months)",
                "1": "Significant delay (delay > 6 months)",
            },
        },
        "numerical_features": NUMERICAL_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "removed_features": REMOVED_FEATURES,
        "larr_stages": LARR_STAGES,
        "training_sample_size": int(len(X_train)),
        "test_sample_size": int(len(X_test)),
        "evaluation_methodology": (
            "80/20 stratified holdout (production model fit on the 80% train split) "
            "plus stratified 5-fold cross-validation on the full synthetic set."
        ),
        "synthetic_holdout_metrics": holdout_metrics,
        "synthetic_cross_validation": cv_metrics,
        "training_feature_distribution": training_feature_distribution(df),
        "metric_label": "PROTOTYPE — synthetic-data validation only. NOT a real-world accuracy claim.",
        "synthetic_data_notice": (
            "Dataset generated by ai-model/generate_dataset.py. The target `delayed` is a "
            "stochastic function of the same features (notably a schedule-overrun term built "
            "from notification_age_months and acquisition_stage), so these metrics are "
            "optimistic relative to real-world data and must not be cited as real accuracy."
        ),
        "data_notice": "Trained on synthetic demonstration data. Not verified government records.",
    }

    # 8. Save model and metadata
    save_artifacts(pipeline, metadata)
    print("\n[SUCCESS] Model training and serialization complete.")


if __name__ == "__main__":
    main()
