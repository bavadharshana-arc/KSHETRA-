# KSHETRA — Institutional AI for Land Acquisition Delay Prediction

Predictive decision-support prototype (Smart India Hackathon). A React + Vite
frontend talks to a FastAPI backend that runs a **LightGBM** delay classifier,
**SHAP** explainability, and a **Cox proportional-hazards** survival model —
all trained on synthetic demonstration data.

> Not an official government determination. Synthetic-data prototype only.

---

## Prerequisites

| Tool    | Version         |
|---------|-----------------|
| Node.js | 20+ (22 tested) |
| Python  | 3.11+ (3.13 tested) |

## First-time setup

```bash
npm install                 # frontend deps
npm run backend:install     # backend deps (pip install -r backend/requirements.txt)
```

## Run everything (recommended)

```bash
npm run dev:all
```

This starts both servers with prefixed logs and stops both on Ctrl+C:

* Frontend → http://localhost:5173
* Backend  → http://127.0.0.1:8000  (health check: `/health`)

### Or run them separately

```bash
npm run backend     # terminal 1 — FastAPI on :8000
npm run dev         # terminal 2 — Vite on :5173
```

## The prediction flow

```
PredictiveAnalyticsView  ─ "Run Project Prediction"
  → AppContext.runProjectDelayPrediction
    → mlApiService.aggregateProjectCaseInput   (project + parcels → 8 model features)
    → POST {VITE_API_BASE_URL}/predict
      → backend/main.py
        → LightGBM classify → SHAP explain → Cox survival     (meta.mode = "live-model")
        → OR deterministic backend/demo_fallback.py           (meta.mode = "demo-fallback")
      → structured JSON { classification, explainability, survival_analysis, meta }
    → ProjectPrediction rendered: probability, risk level, risk score,
      delay window, SHAP factors, Cox curve
```

If the backend is unreachable the UI shows a clear message and a **Retry**
button; previously shown values are never overwritten with an error state.

### Demo fallback

`backend/demo_fallback.py` is a **deterministic**, rule-based estimator with the
exact response shape of the real pipeline. It is used **only** when the trained
model artifacts cannot be loaded or an inference call throws — never at random.
The same input always yields the same output, and every fallback response is
labelled `meta.mode = "demo-fallback"` (surfaced in the UI as a "Demo fallback"
badge). It never replaces the LightGBM / SHAP / Cox models when they are healthy.

## Configuration

| Env var             | Default                  | Purpose                                   |
|---------------------|--------------------------|-------------------------------------------|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000`  | Backend base URL used by the frontend     |

Copy `.env.example` → `.env` to override. See `backend/main.py` for CORS origins.

## Checks

```bash
npm run lint         # oxlint
npm run typecheck    # tsc project build
npm run build        # tsc -b && vite build
```

## Layout

```
backend/         FastAPI service (main.py, demo_fallback.py)
ai-model/        Training + inference for LightGBM / SHAP / Cox, saved model artifacts
src/services/    mlApiService.ts — frontend ↔ backend prediction client
src/components/analytics/PredictiveAnalyticsView.tsx — the main prediction UI
scripts/dev-all.mjs — runs backend + frontend together
```
