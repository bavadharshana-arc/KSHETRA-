/**
 * KSHETRA Machine Learning API Service
 * 
 * Integrates the React frontend with the FastAPI backend (base URL from
 * VITE_API_BASE_URL, default http://127.0.0.1:8000). Orchestrates calls to
 * LightGBM binary classification, SHAP explainability, and Cox Proportional
 * Hazards survival analysis, plus the backend's deterministic demo fallback.
 *
 * NOTICE:
 * All models and inference endpoints operate on synthetic demonstration data.
 */

import { Parcel, Project, ProjectPrediction, ShapFactor, RiskLevel, SurvivalAnalysisResult, PredictionMode } from '../types';
import { PredictionResult } from './predictionEngine';
import {
  FastApiCaseInput,
  buildParcelCaseInput,
  buildProjectCaseInput,
  DEMO_ASOF_DATE,
} from './predictionFeatures';

export type { PredictionMode };
export type { FastApiCaseInput };
export { DEMO_ASOF_DATE };

/**
 * Base URL of the KSHETRA FastAPI prediction service.
 *
 * Resolved from `VITE_API_BASE_URL` at build/dev time so the same frontend build
 * can point at a local backend, a LAN host, or a deployed service without code
 * changes. Falls back to the local dev default. Any trailing slash is trimmed.
 */
export const FASTAPI_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

/** How long to wait for a single prediction call before giving up. */
const PREDICT_TIMEOUT_MS = 12000;

/** User-facing name for the backend — never leak host/port/commands into the UI. */
export const PREDICTION_SERVICE_LABEL = 'KSHETRA prediction service';

/**
 * Converts any fetch/HTTP failure into a short, user-safe sentence.
 * Technical details (URLs, ports, stack traces) go to the console only.
 */
export async function toFriendlyApiError(err: unknown, response?: Response): Promise<string> {
  // Structured error body from the backend: { error: { message, hint } }
  if (response) {
    try {
      const body = await response.clone().json();
      if (body?.error?.message) {
        return body.error.hint
          ? `${body.error.message} ${body.error.hint}`
          : body.error.message;
      }
    } catch {
      /* not JSON — fall through */
    }
    if (response.status === 422) {
      return 'Some prediction inputs were invalid. Please review the project data and try again.';
    }
    if (response.status >= 500) {
      return `The ${PREDICTION_SERVICE_LABEL} had an internal problem. Please retry in a moment.`;
    }
    return `The ${PREDICTION_SERVICE_LABEL} responded with an error (${response.status}). Please retry.`;
  }

  const e = err as { name?: string; message?: string };
  if (e?.name === 'AbortError') {
    return `The ${PREDICTION_SERVICE_LABEL} took too long to respond. Please check it is running and retry.`;
  }
  // "Failed to fetch" / "NetworkError" / "Load failed" — connection could not be made.
  return `Could not reach the ${PREDICTION_SERVICE_LABEL}. Make sure it is running, then retry.`;
}

function readPredictionMode(data: unknown): PredictionMode {
  const mode = (data as { meta?: { mode?: string } })?.meta?.mode;
  return mode === 'demo-fallback' ? 'demo-fallback' : 'live-model';
}

export interface ShapDriver {
  feature_name: string;
  input_value: any;
  shap_contribution: number; // raw LightGBM log-odds contribution
  direction: string;
  impact_magnitude: number;
  contribution_share?: number; // |shap_i| / Σ|shap_j| over ALL features (0..1)
}

export interface FastApiPredictResponse {
  classification: {
    delayed_prediction: number;
    status_label: string;
    delay_probability: number;
    risk_score: number;
    risk_tier: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  explainability: {
    top_risk_drivers: ShapDriver[];
    all_features_analyzed: number;
    explanation_space?: string;
    base_value_log_odds?: number;
    model_raw_margin_log_odds?: number;
    additivity?: {
      space: string;
      base_value: number;
      sum_shap: number;
      reconstructed_margin: number;
      model_raw_margin: number;
      residual: number;
    };
    space_notice?: string;
    causation_notice: string;
  };
  survival_analysis: {
    partial_hazard_ratio: number;
    hazard_tier: string;
    estimated_median_delay_free_milestone: string;
    key_hazard_drivers: string[];
    delay_free_survival_curve: Record<string, {
      elapsed_months: number;
      months_since_notification?: number;
      delay_free_probability: number;
      delay_free_percent: string;
    }>;
    time_analysis?: {
      reference_origin: string;
      elapsed_notification_age_months: number | null;
      median_delay_free_months_from_notification: number | null;
      elapsed_past_model_median: boolean | null;
      remaining_time_note: string;
    };
    survival_definition?: string;
    non_completion_notice: string;
  };
  disclaimer: string;
  meta?: {
    mode: PredictionMode;
    models_ready: boolean;
    generated_at: string;
    reason?: string | null;
    reason_text?: string;
    input_diagnostics?: InputDiagnostics;
  };
}

/**
 * Soft out-of-distribution diagnostic returned by the backend. Transparency only
 * — the prediction always runs; this is NOT a confidence score.
 */
export interface InputDiagnostics {
  available: boolean;
  any_out_of_training_range: boolean;
  note?: string;
  features: Record<string, {
    value: number;
    training_min: number | null;
    training_max: number | null;
    training_mean?: number | null;
    training_median?: number | null;
    in_training_range: boolean;
    out_of_training_range: boolean;
    position: 'below_training_min' | 'above_training_max' | 'within';
  }>;
}

export interface EnhancedPredictionResult extends PredictionResult {
  delayProbability: number;
  isRealApiPrediction: boolean;
  apiError?: string;
  survivalAnalysis?: SurvivalAnalysisResult;
  /** Which backend path produced this result. Absent when the call failed. */
  predictionMode?: PredictionMode;
}

/**
 * Checks if the FastAPI backend is running and healthy.
 */
export async function checkBackendHealth(): Promise<{
  isHealthy: boolean;
  mode?: PredictionMode;
  details?: any;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${FASTAPI_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { isHealthy: false };
    const data = await res.json();
    return {
      isHealthy: data.status === 'healthy',
      mode: data.prediction_mode === 'demo-fallback' ? 'demo-fallback' : 'live-model',
      details: data,
    };
  } catch {
    return { isHealthy: false };
  }
}

/**
 * Maps ONE frontend Parcel into the 7 FastAPI features.
 *
 * ---------------------------------------------------------------------------
 * SCOPE: INDICATIVE PARCEL DRILL-DOWN ONLY — NOT the official prediction.
 * ---------------------------------------------------------------------------
 * The LightGBM / Cox models are trained with the unit of observation being a
 * whole land-acquisition CASE / PROJECT (ai-model/generate_dataset.py). Calling
 * them per parcel feeds inputs outside the training distribution, so any score
 * produced from this mapping is a rough drill-down indicator, not a calibrated
 * prediction.
 *
 * The feature semantics are defined ONCE in `./predictionFeatures.ts` and shared
 * with the project path (`aggregateProjectCaseInput`), so a feature name always
 * denotes the same physical quantity in both.
 */
export function mapParcelToFastApiInput(parcel: Parcel, totalProjectParcels?: number): FastApiCaseInput {
  return buildParcelCaseInput(parcel, totalProjectParcels);
}

function formatFeatureName(feat: string): string {
  switch (feat) {
    case 'litigation_cases': return 'Active Court Stays / Litigation';
    case 'compensation_pending_pct': return 'Compensation Pending Backlog';
    case 'notification_age_months': return 'Gazette Notification Age';
    case 'ownership_disputes': return 'Title Partition Disputes';
    case 'document_issues': return 'Revenue Documentation Lag';
    case 'parcel_count': return 'Project Corridor Scale';
    case 'acquisition_stage': return 'LARR Statutory Stage';
    default: return feat.replace(/_/g, ' ');
  }
}

function getCategoryForFeature(feat: string): 'legal' | 'ownership' | 'compensation' | 'mutation' | 'spatial' | 'document' {
  switch (feat) {
    case 'litigation_cases': return 'legal';
    case 'ownership_disputes': return 'ownership';
    case 'compensation_pending_pct': return 'compensation';
    case 'document_issues': return 'document';
    default: return 'legal';
  }
}

/**
 * Maps the backend SHAP drivers into the shared `ShapFactor[]` display shape.
 *
 * The backend returns raw SHAP values in LightGBM log-odds (raw-margin) space —
 * `base_value + Σ(SHAP) = raw_margin`, NOT probability. We therefore do NOT
 * present them as probability-point changes. Instead:
 *
 *   contribution_share_i  = |SHAP_i| / Σ_j |SHAP_j|   (over the DISPLAYED factors)
 *   impactPercent_i       = sign(SHAP_i) · contribution_share_i · 100
 *
 * `impactPercent` magnitude = "this factor's share of the shown attribution";
 * sign = direction. The raw log-odds SHAP value is preserved in `shapValue`.
 */
function mapShapDrivers(drivers: ShapDriver[]): ShapFactor[] {
  const totalAbs = drivers.reduce((s, d) => s + Math.abs(d.shap_contribution), 0) || 1;
  return drivers.map((d) => {
    const share = Math.abs(d.shap_contribution) / totalAbs; // 0..1 over displayed set
    const signedSharePct = Math.round(Math.sign(d.shap_contribution) * share * 100);
    const rawStr = `${d.shap_contribution >= 0 ? '+' : ''}${d.shap_contribution.toFixed(2)}`;

    return {
      factor: `${formatFeatureName(d.feature_name)}: ${d.input_value}`,
      impactPercent: signedSharePct,
      shapValue: d.shap_contribution,
      category: getCategoryForFeature(d.feature_name),
      description: `${d.direction}. Raw model attribution ${rawStr} log-odds; ${Math.round(share * 100)}% of the shown factors' combined |contribution|.`,
      // Severity = share of the shown attribution (consistent with impactPercent).
      severity: share >= 0.30 ? 'HIGH' : share >= 0.12 ? 'MEDIUM' : 'LOW',
    };
  });
}

export interface ProjectCaseAggregation {
  input: FastApiCaseInput;
  parcelsAnalyzed: number;
  sampleCoverage: {
    projectParcelCount: number;
    loadedParcelCount: number;
    sampleCoveragePct: number;
    fullCoverage: boolean;
  };
  notes: string[];
}

/**
 * Aggregates a complete acquisition PROJECT (its parcels + project-level fields)
 * into ONE FastApiCaseInput — matching the unit of observation the LightGBM / Cox
 * models were trained on (one row = one whole land-acquisition case/project).
 *
 * This is the PRIMARY, semantically-correct way to build a /predict payload.
 * The feature semantics are defined ONCE in `./predictionFeatures.ts` and shared
 * with the parcel path — see `buildProjectCaseInput` for the exact rules.
 */
export function aggregateProjectCaseInput(
  project: Project,
  projectParcels: Parcel[]
): ProjectCaseAggregation {
  return buildProjectCaseInput(project, projectParcels);
}

/**
 * Low-level POST /predict call.
 *
 * Handles: env-configured base URL, request timeout, structured backend error
 * bodies, and non-JSON failures. On any failure it throws an `Error` whose
 * `.message` is already a short, user-safe sentence (no URLs, ports, or traces) —
 * callers can surface it directly. Full technical detail goes to `console.error`.
 */
async function postPredict(input: FastApiCaseInput): Promise<FastApiPredictResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PREDICT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${FASTAPI_BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (err) {
    console.error('[KSHETRA] Prediction request could not reach', `${FASTAPI_BASE_URL}/predict`, err);
    throw new Error(await toFriendlyApiError(err));
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const friendly = await toFriendlyApiError(null, response);
    console.error('[KSHETRA] Prediction failed:', response.status, response.statusText);
    throw new Error(friendly);
  }

  try {
    return (await response.json()) as FastApiPredictResponse;
  } catch (err) {
    console.error('[KSHETRA] Prediction response was not valid JSON', err);
    throw new Error(`The ${PREDICTION_SERVICE_LABEL} returned an unreadable response. Please retry.`);
  }
}

/**
 * PRIMARY prediction: runs the trained model on ONE aggregated project/case payload.
 *
 * React (project) -> aggregateProjectCaseInput -> POST /predict -> LightGBM -> SHAP
 * -> Cox -> JSON -> ProjectPrediction. On failure the result is flagged
 * `isRealApiPrediction: false` with a user-safe `apiError`, and callers must not
 * overwrite a previously stored good prediction with it.
 */
export async function fetchProjectAiPrediction(
  project: Project,
  projectParcels: Parcel[]
): Promise<ProjectPrediction> {
  const { input, parcelsAnalyzed, sampleCoverage, notes } = aggregateProjectCaseInput(project, projectParcels);
  const generatedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const modelInput = { ...input, parcelsAnalyzed };

  const buildFailure = (apiError: string): ProjectPrediction => ({
    projectId: project.id,
    projectName: project.name,
    generatedAt,
    isRealApiPrediction: false,
    apiError,
    modelInput,
    sampleCoverage,
    aggregationNotes: notes,
    delayProbability: 0,
    delayRiskScore: 0,
    riskLevel: 'low',
    predictedDelayMonths: null,
    predictedDelayRange: 'Prediction unavailable',
    topRiskFactor: 'Prediction unavailable',
    aiExplanation: apiError,
    shapFactors: [],
    recommendedAction: 'Use the Retry button to run the project prediction again.',
  });

  try {
    const data = await postPredict(input);
    const predictionMode = readPredictionMode(data);

    const delayRiskScore = Math.round(data.classification.risk_score);
    const riskLevel = data.classification.risk_tier.toLowerCase() as RiskLevel;
    const delayProbability = data.classification.delay_probability;

    // NO probability -> months conversion. The LightGBM model outputs a delay
    // probability, not a duration, and there is no calibrated time model. Time
    // context is exposed via `survivalAnalysis` (Cox S(t) + relative hazard).
    const predictedDelayMonths: number | null = null;
    const predictedDelayRange = 'Duration not modelled — see hazard trajectory';

    const shapFactors = mapShapDrivers(data.explainability.top_risk_drivers);

    const engineLabel =
      predictionMode === 'demo-fallback'
        ? 'Deterministic demo estimate'
        : 'Project-level inference (LightGBM + SHAP + Cox)';

    return {
      projectId: project.id,
      projectName: project.name,
      generatedAt,
      isRealApiPrediction: true,
      predictionMode,
      modelInput,
      sampleCoverage,
      inputDiagnostics: data.meta?.input_diagnostics,
      aggregationNotes: notes,
      delayProbability,
      delayRiskScore,
      riskLevel,
      predictedDelayMonths,
      predictedDelayRange,
      topRiskFactor: shapFactors[0]?.factor || 'Normal operational parameters',
      aiExplanation:
        `${engineLabel}: ${delayRiskScore}% modelled delay probability (${riskLevel.toUpperCase()}); ` +
        `Cox relative hazard ${data.survival_analysis.partial_hazard_ratio}× (${data.survival_analysis.hazard_tier.toLowerCase()}). ` +
        `Aggregated from ${parcelsAnalyzed} parcel record(s) for ${project.name}. ` +
        `The model estimates a probability of delay, not a delay duration. (Synthetic Demo POC)`,
      shapFactors,
      survivalAnalysis: data.survival_analysis,
      recommendedAction:
        riskLevel === 'high'
          ? 'Prioritise Lok Adalat camps & Sec 3H escrow across the project’s litigated parcels'
          : riskLevel === 'medium'
          ? 'Schedule project-wide jamabandi reconciliation & compensation fast-tracking'
          : 'Maintain routine project acquisition monitoring',
    };
  } catch (err: any) {
    // postPredict already produced a user-safe message; fall back defensively.
    const friendly =
      typeof err?.message === 'string' && err.message
        ? err.message
        : `Could not reach the ${PREDICTION_SERVICE_LABEL}. Make sure it is running, then retry.`;
    console.error('[KSHETRA] Project-level prediction failed:', err);
    return buildFailure(friendly);
  }
}

/**
 * Executes a prediction request against the FastAPI backend (POST /predict).
 *
 * There is NO local-heuristic fallback here. If the backend is unreachable or
 * returns an error, this resolves to a zeroed placeholder result flagged with
 * `isRealApiPrediction: false` and an `apiError` message. Callers must treat that
 * as "prediction unavailable" and must not overwrite existing risk values with it
 * (see AppContext.runDelayPrediction `preserveOnFailure`).
 */
export async function fetchRealAiPrediction(
  parcel: Parcel,
  totalProjectParcels?: number
): Promise<EnhancedPredictionResult> {
  const casePayload = mapParcelToFastApiInput(parcel, totalProjectParcels);

  try {
    const data = await postPredict(casePayload);
    const predictionMode = readPredictionMode(data);

    // Map FastAPI classification results
    const riskScore = Math.round(data.classification.risk_score);
    const riskTier = data.classification.risk_tier.toLowerCase() as RiskLevel;
    const delayProb = data.classification.delay_probability;

    // NO probability -> months conversion (the classifier gives a probability,
    // not a duration; no calibrated time model exists). The parcel keeps its
    // catalogued delay figures untouched; time context is in `survivalAnalysis`.
    const predictedDelayMonths: number | null = null;
    const predictedDelayRange = 'Duration not modelled — see hazard trajectory';

    // Map SHAP top drivers to ShapFactor format (shared with the project-level path)
    const shapFactors: ShapFactor[] = mapShapDrivers(data.explainability.top_risk_drivers);

    const topRiskFactor = shapFactors.length > 0 
      ? shapFactors[0].factor 
      : 'Normal operational parameters';

    const riskFactorsList = shapFactors
      .filter(s => s.impactPercent > 0)
      .map(s => s.factor);

    const engineLabel =
      predictionMode === 'demo-fallback'
        ? 'Deterministic demo estimate'
        : 'FastAPI inference (LightGBM + SHAP + Cox)';
    const aiExplanation = `${engineLabel}: ${riskScore}% modelled delay probability (${riskTier.toUpperCase()}); Cox relative hazard ${data.survival_analysis.partial_hazard_ratio}× (${data.survival_analysis.hazard_tier.toLowerCase()}). The model estimates a probability of delay, not a delay duration. (Synthetic Demo POC)`;

    return {
      delayRiskScore: riskScore,
      riskLevel: riskTier,
      predictedDelayMonths,
      predictedDelayRange,
      delayConfidence: 'High',
      topRiskFactor,
      aiExplanation,
      shapFactors,
      riskFactorsList,
      recommendedAction: riskTier === 'high'
        ? 'Initiate Lok Adalat Hearing & Expedite Sec 3H Compensation Escrow'
        : riskTier === 'medium'
        ? 'Schedule Field Survey & Revenue Jamabandi Reconciliation'
        : 'Routine Administrative Follow-up',
      priority: riskTier === 'high' ? 'CRITICAL' : riskTier === 'medium' ? 'HIGH' : 'LOW',
      // No calibrated intervention-effect model -> not estimated.
      predictedDelayAfterIntervention: null,
      potentialReductionMonths: null,
      delayProbability: delayProb,
      isRealApiPrediction: true,
      predictionMode,
      survivalAnalysis: data.survival_analysis,
    };
  } catch (err: any) {
    const friendly =
      typeof err?.message === 'string' && err.message
        ? err.message
        : `Could not reach the ${PREDICTION_SERVICE_LABEL}. Make sure it is running, then retry.`;
    console.error('[KSHETRA] Parcel-level prediction failed:', err);

    // Strict safety rule: Do NOT generate or return simulated / fake AI predictions when the API is unavailable.
    return {
      delayRiskScore: 0,
      riskLevel: 'low',
      predictedDelayMonths: null,
      predictedDelayRange: 'Prediction unavailable',
      delayConfidence: 'Low',
      topRiskFactor: 'Prediction unavailable',
      aiExplanation: friendly,
      shapFactors: [],
      riskFactorsList: [],
      recommendedAction: 'Use the Retry button once the prediction service is available.',
      priority: 'LOW',
      predictedDelayAfterIntervention: null,
      potentialReductionMonths: null,
      delayProbability: 0,
      isRealApiPrediction: false,
      apiError: friendly,
    };
  }
}
