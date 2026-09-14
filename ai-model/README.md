# KSHETRA — Land Acquisition Delay Prediction AI Layer

This module houses the machine learning layer for the **KSHETRA** Land Acquisition Decision Support System.

---

## ⚠️ Synthetic Demo Dataset Notice

> **Important Disclosure:**
> Labelled government land-acquisition case data with verified historical milestone delays is strictly non-public or unavailable in centralized formats.
> 
> Therefore, this model is trained on a **reproducible, domain-grounded synthetic dataset** created specifically for prototyping, academic research, and pipeline validation.
> - **Do NOT** claim this represents official government records, e-Court archives, or validated historical case timelines.
> - The performance metrics reported by `train.py` reflect internal pattern recognition on this synthetic benchmark.

---

## 1. Problem Formulation

* **Unit of Observation:** One Land Acquisition Case / Project (e.g., highway bypass section, industrial corridor expansion, railway spur, or transmission line corridor).
* **Objective:** Predict whether a case will encounter a **significant delay** exceeding 6 months beyond statutory benchmarks.
* **Target Variable:** `delayed` (Binary Classification)
  * `0` = **No significant delay** (On-track or manageable operational delay $\le 6$ months)
  * `1` = **Significant delay** (Severe procedural, legal, or compensation stagnation $> 6$ months)

---

## 2. Feature Schema

| Feature Name | Type | Description |
| :--- | :--- | :--- |
| `parcel_count` | Integer | Total number of individual survey parcels within the case boundary (10–500) |
| `litigation_cases` | Integer | Number of active civil suits, writ petitions, or stay orders |
| `compensation_pending_pct` | Float | Percentage of statutory award compensation remaining to be disbursed (0.0–100.0%) |
| `acquisition_stage` | Categorical | Current statutory stage under the LARR Act (Sec 3A to Sec 3E) |
| `ownership_disputes` | Integer | Number of parcels with co-heir disputes, rival claims, or boundary conflicts |
| `document_issues` | Integer | Number of parcels with unmutated khatas, missing patta/chitta, or stale jamabandi |
| `previous_delays_months` | Float | Cumulative administrative delay already logged up to the current milestone |
| `notification_age_months` | Float | Total elapsed calendar months since the initial Section 3A/11 gazette notification |

---

## 3. Directory Structure

```text
ai-model/
├── data/
│   └── synthetic_land_acquisition_cases.csv   # Generated 1,500 case dataset
├── models/
│   ├── lgbm_delay_model.joblib                # Serialized LightGBM pipeline
│   ├── feature_metadata.json                  # Schema, stage mapping, and metrics
│   ├── cox_hazard_model.joblib                # Serialized Cox proportional hazards model
│   └── cox_metadata.json                      # Cox hazard ratios and concordance
├── generate_dataset.py                        # Reproducible data generator
├── train.py                                   # Training and validation pipeline
├── predict.py                                 # Standalone inference helper (FastAPI ready)
├── explain.py                                 # SHAP explainability module
├── survival.py                                # Cox survival analysis module
├── requirements.txt                           # Lightweight dependencies
└── README.md                                  # Documentation
```

---

## 4. Setup & Running Instructions

### Prerequisites
- Python 3.11+ (Python 3.11, 3.12, or 3.13)
- Windows / macOS / Linux

### Step 1: Create and Activate Virtual Environment

```bash
# Navigate to the ai-model directory
cd ai-model

# Create virtual environment
python -m venv .venv

# Activate on Windows:
.venv\Scripts\activate

# Or activate on Linux / macOS:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Step 2: Generate the Synthetic Dataset

```bash
python generate_dataset.py
```
This generates 1,500 synthetic cases with realistic LARR statutory dynamics and saves the CSV to `data/synthetic_land_acquisition_cases.csv`.

### Step 3: Train the LightGBM Classifier

```bash
python train.py
```
This script:
1. Loads the generated dataset.
2. Applies a `ColumnTransformer` with `OneHotEncoder` for statutory stages.
3. Fits a `LGBMClassifier` (binary logloss objective).
4. Prints an evaluation report (Accuracy, Precision, Recall, F1, ROC-AUC, Confusion Matrix, and Feature Importance).
5. Exports the complete pipeline to `models/lgbm_delay_model.joblib`.

### Step 4: Run Inference Test

```bash
python predict.py
```
Demonstrates single-case and batch inference, returning delay predictions, probability, risk tier (`LOW`, `MEDIUM`, `HIGH`), and human-readable risk drivers.

---

## 5. FastAPI Integration Blueprint

In a future backend step, `predict.py` can be imported directly into a FastAPI route:

```python
from fastapi import FastAPI
from pydantic import BaseModel
from predict import predict_case_delay

app = FastAPI(title="KSHETRA ML API")

class CaseInput(BaseModel):
    parcel_count: int
    litigation_cases: int
    compensation_pending_pct: float
    acquisition_stage: str
    ownership_disputes: int
    document_issues: int
    previous_delays_months: float
    notification_age_months: float

@app.post("/api/predict-delay")
def predict(case: CaseInput):
    return predict_case_delay(case.dict())
```
