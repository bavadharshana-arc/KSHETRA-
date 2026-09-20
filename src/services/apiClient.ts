/**
 * KSHETRA Persistence API Client (Step 4A of the persistence plan)
 * ===============================================================
 *
 * Typed functions over the FastAPI CRUD/prediction routes added in Steps 2–3
 * (`/api/projects`, `/api/parcels`, `/api/alerts`, `/api/case-actions`,
 * `/api/audit-logs`, `/api/.../predictions`). This is the ONLY file that
 * talks HTTP for persistence — `AppContext.tsx` orchestrates calls into it,
 * components never import this module directly (see the Step 4 report).
 *
 * Does NOT touch `/predict` or `mlApiService.ts` in any way — that ML
 * request/response contract is untouched. `FASTAPI_BASE_URL` is imported
 * from `mlApiService.ts` (already reads `VITE_API_BASE_URL`) so the base URL
 * stays defined in exactly one place in the whole frontend.
 *
 * Backend rows are snake_case; frontend domain types (`Project`, `Parcel`,
 * `Alert`, `CaseAction`, `AuditLog` from `../types`) are camelCase and, for a
 * few fields, shaped differently (e.g. `gpsCoordinates: {lat,lng}` vs the
 * backend's scalar `gps_lat`/`gps_lng` columns — see Step 1/3 schema notes).
 * The `mapXFromApi` / `mapXToApi` functions below are the ONE place that
 * boundary is crossed; no other file needs to know about it.
 */

import {
  Project,
  Parcel,
  Alert,
  CaseAction,
  AuditLog,
  ShapFactor,
  SurvivalAnalysisResult,
} from '../types';
import { FASTAPI_BASE_URL } from './mlApiService';
import type { FastApiCaseInput } from './predictionFeatures';

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Thrown for every non-2xx response and for network/timeout failures.
 * `status` is 0 for a request that never reached the server (network error,
 * timeout, CORS) so callers can distinguish "server said no" from
 * "server unreachable" without parsing the message string.
 */
export class ApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Converts a FastAPI error body into a readable message. Step 2/3 routers
 * raise `HTTPException(detail=...)`, which FastAPI serializes as
 * `{"detail": "..."}`; `/predict`'s own structured `{error:{message,hint}}`
 * shape is handled too for consistency, even though this client never calls
 * `/predict` itself.
 */
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.detail === 'string') return b.detail;
    if (Array.isArray(b.detail)) {
      // FastAPI 422 validation errors: a list of {loc, msg, type}
      return b.detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as any).msg) : JSON.stringify(d)))
        .join('; ');
    }
    const err = b.error as Record<string, unknown> | undefined;
    if (err && typeof err.message === 'string') {
      return typeof err.hint === 'string' ? `${err.message} ${err.hint}` : err.message;
    }
  }
  return `Request failed with status ${status}.`;
}

/**
 * Core request helper. Never silently converts a failure into a fake
 * success — every non-2xx response and every network failure throws
 * `ApiError`. Callers (AppContext) decide how to degrade.
 *
 * Exported (Step 8C-B.2) so the read-only legal/blockers/exposure engine
 * services can reuse this exact fetch/timeout/error-handling logic instead
 * of duplicating it — see src/services/legalService.ts,
 * blockersService.ts, exposureService.ts. Behavior is unchanged; this is
 * purely a visibility change.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${FASTAPI_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    console.error('[KSHETRA apiClient] Could not reach', `${FASTAPI_BASE_URL}${path}`, err);
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    throw new ApiError(
      isAbort
        ? 'The KSHETRA persistence service took too long to respond.'
        : 'Could not reach the KSHETRA persistence service. Make sure the backend is running.',
      0
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // 204 No Content (DELETE) has no body to parse.
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(`Request failed with status ${response.status}.`, response.status);
    }
    // A 2xx with no/invalid JSON body is not expected from any of these
    // routes, but don't fabricate a value — surface it as an error.
    throw new ApiError('The server returned an unreadable response.', response.status);
  }

  if (!response.ok) {
    console.error('[KSHETRA apiClient] Request failed:', path, response.status, parsed);
    throw new ApiError(extractErrorMessage(parsed, response.status), response.status, parsed);
  }

  return parsed as T;
}

/** Exported (Step 8C-B.2) for reuse by the new read-only engine services —
 * see the apiFetch export note above. Behavior unchanged. */
export function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of entries) usp.set(k, String(v));
  return `?${usp.toString()}`;
}

// -----------------------------------------------------------------------------
// Backend DTO shapes (snake_case, as returned by backend/schemas.py *Read
// models). Only the fields the mapping functions actually read/write are
// declared — this is a boundary-crossing type, not a competing domain model.
// -----------------------------------------------------------------------------

interface ApiCorridorSection {
  sectionId: string;
  name: string;
  chainageKm: string;
  riskScore: number;
  riskLevel: string;
  bottleneckCount: number;
  description: string;
}

interface ApiProject {
  id: string;
  name: string;
  code: string;
  department: string;
  agency: string;
  total_length_km: number;
  project_value_crores: number;
  total_parcels: number;
  acquired_parcels: number;
  pending_parcels: number;
  high_risk_parcels: number;
  med_risk_parcels: number;
  low_risk_parcels: number;
  predicted_delay_months: number;
  status: string;
  current_larr_stage: string;
  corridor_sections: ApiCorridorSection[];
  corridor_path: number[][];
  start_point_name?: string | null;
  end_point_name?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  end_lat?: number | null;
  end_lng?: number | null;
  is_custom_project?: boolean | null;
  project_type?: string | null;
  planning_priorities?: string[] | null;
  created_at: string;
  updated_at: string;
}

interface ApiParcel {
  id: string;
  survey_number: string;
  ulpin: string;
  project_id: string;
  project_name: string;
  owner_name: string;
  co_owners: string[];
  co_owner_count: number;
  village: string;
  taluk: string;
  district: string;
  area_acres: number;
  area_sq_meters: number;
  mutation_status: string;
  last_mutation_years_ago: number;
  document_status: string;
  record_freshness_score: number;
  record_confidence: string;
  court_case: boolean;
  court_case_status: string;
  ownership_dispute: string;
  court_record?: unknown;
  revenue_record?: unknown;
  gis_record?: unknown;
  acquisition_status: string;
  stage: string;
  notification_date: string;
  compensation_status: string;
  estimated_compensation_crores: number;
  possession_status: string;
  delay_risk_score: number;
  risk_level: string;
  predicted_delay_months: number;
  predicted_delay_range: string;
  delay_confidence: string;
  top_risk_factor: string;
  ai_explanation: string;
  shap_factors: ShapFactor[];
  risk_factors_list: string[];
  delay_probability?: number | null;
  is_real_api_prediction?: boolean | null;
  api_error?: string | null;
  survival_analysis?: SurvivalAnalysisResult | null;
  recommended_action: string;
  priority: string;
  predicted_delay_after_intervention: number;
  potential_reduction_months: number;
  intervention_status: string;
  assigned_officer?: string | null;
  assigned_due_date?: string | null;
  field_verified: boolean;
  field_verification_notes?: string | null;
  gps_lat: number;
  gps_lng: number;
  evidence_photo_attached?: boolean | null;
  field_verified_at?: string | null;
  map_coordinates: number[][];
  center_lat: number;
  center_lng: number;
  last_synced_at?: string | null;
  sync_status: string;
  created_at: string;
  updated_at: string;
}

interface ApiAlert {
  id: string;
  level: string;
  title: string;
  project_name: string;
  project_id: string;
  parcel_id: string;
  survey_number: string;
  risk_score: number;
  trigger: string;
  reason: string;
  recommended_action: string;
  created_at_display: string;
  status: string;
  resolution_notes?: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiCaseAction {
  id: string;
  parcel_id: string;
  survey_number: string;
  title: string;
  action_type: string;
  assigned_officer: string;
  assigned_officer_role: string;
  priority: string;
  status: string;
  due_date: string;
  created_at_display: string;
  completed_at?: string | null;
  notes: string;
  target_delay_reduction_months: number;
  created_at: string;
  updated_at: string;
}

interface ApiAuditLog {
  id: string;
  timestamp_display: string;
  officer_id: string;
  officer_name: string;
  role: string;
  action: string;
  parcel_id?: string | null;
  survey_number?: string | null;
  details: string;
  created_at: string;
}

/** Persisted prediction record (Step 3's `predictions` table). No existing
 * frontend type covers this shape (it is not the same as `ProjectPrediction`,
 * which is the richer, camelCase live-/predict shape) — see the Step 4
 * report for why a new type was necessary here rather than reusing one. */
export interface PersistedPredictionRecord {
  id: string;
  project_id: string;
  parcel_id?: string | null;
  scope: 'project' | 'parcel';
  project_name: string;
  generated_at: string;
  is_real_api_prediction: boolean;
  prediction_mode?: string | null;
  api_error?: string | null;
  model_input: Record<string, unknown>;
  sample_coverage?: Record<string, unknown> | null;
  input_diagnostics?: Record<string, unknown> | null;
  aggregation_notes: string[];
  delay_probability: number;
  delay_risk_score: number;
  risk_level: string;
  predicted_delay_months?: number | null;
  predicted_delay_range: string;
  top_risk_factor: string;
  ai_explanation: string;
  shap_factors: Record<string, unknown>[];
  survival_analysis?: SurvivalAnalysisResult | null;
  recommended_action: string;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Boundary mapping: API (snake_case) <-> frontend domain types (camelCase)
// -----------------------------------------------------------------------------

function mapProjectFromApi(p: ApiProject): Project {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    department: p.department,
    agency: p.agency as Project['agency'],
    totalLengthKm: p.total_length_km,
    projectValueCrores: p.project_value_crores,
    totalParcels: p.total_parcels,
    acquiredParcels: p.acquired_parcels,
    pendingParcels: p.pending_parcels,
    highRiskParcels: p.high_risk_parcels,
    medRiskParcels: p.med_risk_parcels,
    lowRiskParcels: p.low_risk_parcels,
    predictedDelayMonths: p.predicted_delay_months,
    status: p.status as Project['status'],
    currentLarrStage: p.current_larr_stage as Project['currentLarrStage'],
    corridorSections: (p.corridor_sections || []).map((s) => ({
      sectionId: s.sectionId,
      name: s.name,
      chainageKm: s.chainageKm,
      riskScore: s.riskScore,
      riskLevel: s.riskLevel as Project['corridorSections'][number]['riskLevel'],
      bottleneckCount: s.bottleneckCount,
      description: s.description,
    })),
    corridorPath: (p.corridor_path || []) as [number, number][],
    startPointName: p.start_point_name ?? undefined,
    endPointName: p.end_point_name ?? undefined,
    startCoords:
      p.start_lat != null && p.start_lng != null ? [p.start_lat, p.start_lng] : undefined,
    endCoords: p.end_lat != null && p.end_lng != null ? [p.end_lat, p.end_lng] : undefined,
    isCustomProject: p.is_custom_project ?? undefined,
    projectType: (p.project_type as Project['projectType']) ?? undefined,
    planningPriorities: p.planning_priorities ?? undefined,
  };
}

function mapProjectToApi(p: Project): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    department: p.department,
    agency: p.agency,
    total_length_km: p.totalLengthKm,
    project_value_crores: p.projectValueCrores,
    total_parcels: p.totalParcels,
    acquired_parcels: p.acquiredParcels,
    pending_parcels: p.pendingParcels,
    high_risk_parcels: p.highRiskParcels,
    med_risk_parcels: p.medRiskParcels,
    low_risk_parcels: p.lowRiskParcels,
    predicted_delay_months: p.predictedDelayMonths,
    status: p.status,
    current_larr_stage: p.currentLarrStage,
    corridor_sections: p.corridorSections,
    corridor_path: p.corridorPath,
    start_point_name: p.startPointName ?? null,
    end_point_name: p.endPointName ?? null,
    start_lat: p.startCoords?.[0] ?? null,
    start_lng: p.startCoords?.[1] ?? null,
    end_lat: p.endCoords?.[0] ?? null,
    end_lng: p.endCoords?.[1] ?? null,
    is_custom_project: p.isCustomProject ?? false,
    project_type: p.projectType ?? null,
    planning_priorities: p.planningPriorities ?? null,
  };
}

/** Partial project patch -> partial API payload (only defined keys included),
 * for PATCH /api/projects/{id}. */
function mapProjectPatchToApi(patch: Partial<Project>): Record<string, unknown> {
  const full = mapProjectToApi(patch as Project);
  const out: Record<string, unknown> = {};
  const keyMap: Record<string, keyof Project> = {
    name: 'name', code: 'code', department: 'department', agency: 'agency',
    total_length_km: 'totalLengthKm', project_value_crores: 'projectValueCrores',
    total_parcels: 'totalParcels', acquired_parcels: 'acquiredParcels',
    pending_parcels: 'pendingParcels', high_risk_parcels: 'highRiskParcels',
    med_risk_parcels: 'medRiskParcels', low_risk_parcels: 'lowRiskParcels',
    predicted_delay_months: 'predictedDelayMonths', status: 'status',
    current_larr_stage: 'currentLarrStage', corridor_sections: 'corridorSections',
    corridor_path: 'corridorPath', start_point_name: 'startPointName',
    end_point_name: 'endPointName', is_custom_project: 'isCustomProject',
    project_type: 'projectType', planning_priorities: 'planningPriorities',
  };
  for (const [apiKey, feKey] of Object.entries(keyMap)) {
    if (patch[feKey] !== undefined) out[apiKey] = (full as Record<string, unknown>)[apiKey];
  }
  if (patch.startCoords !== undefined) {
    out.start_lat = patch.startCoords?.[0] ?? null;
    out.start_lng = patch.startCoords?.[1] ?? null;
  }
  if (patch.endCoords !== undefined) {
    out.end_lat = patch.endCoords?.[0] ?? null;
    out.end_lng = patch.endCoords?.[1] ?? null;
  }
  return out;
}

function mapParcelFromApi(p: ApiParcel): Parcel {
  return {
    id: p.id,
    surveyNumber: p.survey_number,
    ulpin: p.ulpin,
    projectId: p.project_id,
    projectName: p.project_name,
    ownerName: p.owner_name,
    coOwners: p.co_owners || [],
    coOwnerCount: p.co_owner_count,
    village: p.village,
    taluk: p.taluk,
    district: p.district,
    areaAcres: p.area_acres,
    areaSqMeters: p.area_sq_meters,
    mutationStatus: p.mutation_status as Parcel['mutationStatus'],
    lastMutationYearsAgo: p.last_mutation_years_ago,
    documentStatus: p.document_status as Parcel['documentStatus'],
    recordFreshnessScore: p.record_freshness_score,
    recordConfidence: p.record_confidence as Parcel['recordConfidence'],
    courtCase: p.court_case,
    courtCaseStatus: p.court_case_status as Parcel['courtCaseStatus'],
    ownershipDispute: p.ownership_dispute as Parcel['ownershipDispute'],
    courtRecord: (p.court_record as Parcel['courtRecord']) ?? undefined,
    revenueRecord: (p.revenue_record as Parcel['revenueRecord']) ?? undefined,
    gisRecord: (p.gis_record as Parcel['gisRecord']) ?? undefined,
    acquisitionStatus: p.acquisition_status as Parcel['acquisitionStatus'],
    stage: p.stage as Parcel['stage'],
    notificationDate: p.notification_date,
    compensationStatus: p.compensation_status as Parcel['compensationStatus'],
    estimatedCompensationCrores: p.estimated_compensation_crores,
    possessionStatus: p.possession_status as Parcel['possessionStatus'],
    delayRiskScore: p.delay_risk_score,
    riskLevel: p.risk_level as Parcel['riskLevel'],
    predictedDelayMonths: p.predicted_delay_months,
    predictedDelayRange: p.predicted_delay_range,
    delayConfidence: p.delay_confidence as Parcel['delayConfidence'],
    topRiskFactor: p.top_risk_factor,
    aiExplanation: p.ai_explanation,
    shapFactors: p.shap_factors || [],
    riskFactorsList: p.risk_factors_list || [],
    delayProbability: p.delay_probability ?? undefined,
    isRealApiPrediction: p.is_real_api_prediction ?? undefined,
    apiError: p.api_error ?? undefined,
    survivalAnalysis: p.survival_analysis ?? undefined,
    recommendedAction: p.recommended_action,
    priority: p.priority as Parcel['priority'],
    predictedDelayAfterIntervention: p.predicted_delay_after_intervention,
    potentialReductionMonths: p.potential_reduction_months,
    interventionStatus: p.intervention_status as Parcel['interventionStatus'],
    assignedOfficer: p.assigned_officer ?? undefined,
    assignedDueDate: p.assigned_due_date ?? undefined,
    fieldVerified: p.field_verified,
    fieldVerificationNotes: p.field_verification_notes ?? undefined,
    gpsCoordinates: { lat: p.gps_lat, lng: p.gps_lng },
    evidencePhotoAttached: p.evidence_photo_attached ?? undefined,
    fieldVerifiedAt: p.field_verified_at ?? undefined,
    mapCoordinates: (p.map_coordinates || []) as [number, number][],
    centerCoordinate: [p.center_lat, p.center_lng],
    lastSyncedAt: p.last_synced_at ?? undefined,
    syncStatus: p.sync_status as Parcel['syncStatus'],
  };
}

function mapParcelToApi(p: Parcel): Record<string, unknown> {
  return {
    id: p.id,
    survey_number: p.surveyNumber,
    ulpin: p.ulpin,
    project_id: p.projectId,
    project_name: p.projectName,
    owner_name: p.ownerName,
    co_owners: p.coOwners,
    co_owner_count: p.coOwnerCount,
    village: p.village,
    taluk: p.taluk,
    district: p.district,
    area_acres: p.areaAcres,
    area_sq_meters: p.areaSqMeters,
    mutation_status: p.mutationStatus,
    last_mutation_years_ago: p.lastMutationYearsAgo,
    document_status: p.documentStatus,
    record_freshness_score: p.recordFreshnessScore,
    record_confidence: p.recordConfidence,
    court_case: p.courtCase,
    court_case_status: p.courtCaseStatus,
    ownership_dispute: p.ownershipDispute,
    court_record: p.courtRecord ?? null,
    revenue_record: p.revenueRecord ?? null,
    gis_record: p.gisRecord ?? null,
    acquisition_status: p.acquisitionStatus,
    stage: p.stage,
    notification_date: p.notificationDate,
    compensation_status: p.compensationStatus,
    estimated_compensation_crores: p.estimatedCompensationCrores,
    possession_status: p.possessionStatus,
    delay_risk_score: p.delayRiskScore,
    risk_level: p.riskLevel,
    predicted_delay_months: p.predictedDelayMonths,
    predicted_delay_range: p.predictedDelayRange,
    delay_confidence: p.delayConfidence,
    top_risk_factor: p.topRiskFactor,
    ai_explanation: p.aiExplanation,
    shap_factors: p.shapFactors,
    risk_factors_list: p.riskFactorsList,
    delay_probability: p.delayProbability ?? null,
    is_real_api_prediction: p.isRealApiPrediction ?? null,
    api_error: p.apiError ?? null,
    survival_analysis: p.survivalAnalysis ?? null,
    recommended_action: p.recommendedAction,
    priority: p.priority,
    predicted_delay_after_intervention: p.predictedDelayAfterIntervention,
    potential_reduction_months: p.potentialReductionMonths,
    intervention_status: p.interventionStatus,
    assigned_officer: p.assignedOfficer ?? null,
    assigned_due_date: p.assignedDueDate ?? null,
    field_verified: p.fieldVerified,
    field_verification_notes: p.fieldVerificationNotes ?? null,
    gps_lat: p.gpsCoordinates.lat,
    gps_lng: p.gpsCoordinates.lng,
    evidence_photo_attached: p.evidencePhotoAttached ?? null,
    field_verified_at: p.fieldVerifiedAt ?? null,
    map_coordinates: p.mapCoordinates,
    center_lat: p.centerCoordinate[0],
    center_lng: p.centerCoordinate[1],
    last_synced_at: p.lastSyncedAt ?? null,
    sync_status: p.syncStatus,
  };
}

const PARCEL_KEY_MAP: Record<string, keyof Parcel> = {
  survey_number: 'surveyNumber', ulpin: 'ulpin', project_id: 'projectId',
  project_name: 'projectName', owner_name: 'ownerName', co_owners: 'coOwners',
  co_owner_count: 'coOwnerCount', village: 'village', taluk: 'taluk', district: 'district',
  area_acres: 'areaAcres', area_sq_meters: 'areaSqMeters', mutation_status: 'mutationStatus',
  last_mutation_years_ago: 'lastMutationYearsAgo', document_status: 'documentStatus',
  record_freshness_score: 'recordFreshnessScore', record_confidence: 'recordConfidence',
  court_case: 'courtCase', court_case_status: 'courtCaseStatus',
  ownership_dispute: 'ownershipDispute', court_record: 'courtRecord',
  revenue_record: 'revenueRecord', gis_record: 'gisRecord',
  acquisition_status: 'acquisitionStatus', stage: 'stage',
  notification_date: 'notificationDate', compensation_status: 'compensationStatus',
  estimated_compensation_crores: 'estimatedCompensationCrores',
  possession_status: 'possessionStatus', delay_risk_score: 'delayRiskScore',
  risk_level: 'riskLevel', predicted_delay_months: 'predictedDelayMonths',
  predicted_delay_range: 'predictedDelayRange', delay_confidence: 'delayConfidence',
  top_risk_factor: 'topRiskFactor', ai_explanation: 'aiExplanation',
  shap_factors: 'shapFactors', risk_factors_list: 'riskFactorsList',
  delay_probability: 'delayProbability', is_real_api_prediction: 'isRealApiPrediction',
  api_error: 'apiError', survival_analysis: 'survivalAnalysis',
  recommended_action: 'recommendedAction', priority: 'priority',
  predicted_delay_after_intervention: 'predictedDelayAfterIntervention',
  potential_reduction_months: 'potentialReductionMonths',
  intervention_status: 'interventionStatus', assigned_officer: 'assignedOfficer',
  assigned_due_date: 'assignedDueDate', field_verified: 'fieldVerified',
  field_verification_notes: 'fieldVerificationNotes', evidence_photo_attached: 'evidencePhotoAttached',
  field_verified_at: 'fieldVerifiedAt', map_coordinates: 'mapCoordinates',
  last_synced_at: 'lastSyncedAt', sync_status: 'syncStatus',
};

/** Partial parcel patch -> partial API payload (only defined keys included),
 * for PATCH /api/parcels/{id}. gpsCoordinates/centerCoordinate are handled
 * separately since they split into two scalar columns on the backend. */
function mapParcelPatchToApi(patch: Partial<Parcel>): Record<string, unknown> {
  const full = mapParcelToApi(patch as Parcel);
  const out: Record<string, unknown> = {};
  for (const [apiKey, feKey] of Object.entries(PARCEL_KEY_MAP)) {
    if (patch[feKey] !== undefined) out[apiKey] = (full as Record<string, unknown>)[apiKey];
  }
  if (patch.gpsCoordinates !== undefined) {
    out.gps_lat = patch.gpsCoordinates.lat;
    out.gps_lng = patch.gpsCoordinates.lng;
  }
  if (patch.centerCoordinate !== undefined) {
    out.center_lat = patch.centerCoordinate[0];
    out.center_lng = patch.centerCoordinate[1];
  }
  return out;
}

function mapAlertFromApi(a: ApiAlert): Alert {
  return {
    id: a.id,
    level: a.level as Alert['level'],
    title: a.title,
    projectName: a.project_name,
    projectId: a.project_id,
    parcelId: a.parcel_id,
    surveyNumber: a.survey_number,
    riskScore: a.risk_score,
    trigger: a.trigger,
    reason: a.reason,
    recommendedAction: a.recommended_action,
    createdAt: a.created_at_display,
    status: a.status as Alert['status'],
    resolutionNotes: a.resolution_notes ?? undefined,
    assignedTo: a.assigned_to ?? undefined,
  };
}

function mapAlertToApi(a: Alert): Record<string, unknown> {
  return {
    id: a.id,
    level: a.level,
    title: a.title,
    project_name: a.projectName,
    project_id: a.projectId,
    parcel_id: a.parcelId,
    survey_number: a.surveyNumber,
    risk_score: a.riskScore,
    trigger: a.trigger,
    reason: a.reason,
    recommended_action: a.recommendedAction,
    created_at_display: a.createdAt,
    status: a.status,
    resolution_notes: a.resolutionNotes ?? null,
    assigned_to: a.assignedTo ?? null,
  };
}

const ALERT_KEY_MAP: Record<string, keyof Alert> = {
  level: 'level', title: 'title', project_name: 'projectName', project_id: 'projectId',
  parcel_id: 'parcelId', survey_number: 'surveyNumber', risk_score: 'riskScore',
  trigger: 'trigger', reason: 'reason', recommended_action: 'recommendedAction',
  created_at_display: 'createdAt', status: 'status',
  resolution_notes: 'resolutionNotes', assigned_to: 'assignedTo',
};

function mapAlertPatchToApi(patch: Partial<Alert>): Record<string, unknown> {
  const full = mapAlertToApi(patch as Alert);
  const out: Record<string, unknown> = {};
  for (const [apiKey, feKey] of Object.entries(ALERT_KEY_MAP)) {
    if (patch[feKey] !== undefined) out[apiKey] = (full as Record<string, unknown>)[apiKey];
  }
  return out;
}

function mapActionFromApi(a: ApiCaseAction): CaseAction {
  return {
    id: a.id,
    parcelId: a.parcel_id,
    surveyNumber: a.survey_number,
    title: a.title,
    actionType: a.action_type as CaseAction['actionType'],
    assignedOfficer: a.assigned_officer,
    assignedOfficerRole: a.assigned_officer_role,
    priority: a.priority as CaseAction['priority'],
    status: a.status as CaseAction['status'],
    dueDate: a.due_date,
    createdAt: a.created_at_display,
    completedAt: a.completed_at ?? undefined,
    notes: a.notes,
    targetDelayReductionMonths: a.target_delay_reduction_months,
  };
}

function mapActionToApi(a: CaseAction): Record<string, unknown> {
  return {
    id: a.id,
    parcel_id: a.parcelId,
    survey_number: a.surveyNumber,
    title: a.title,
    action_type: a.actionType,
    assigned_officer: a.assignedOfficer,
    assigned_officer_role: a.assignedOfficerRole,
    priority: a.priority,
    status: a.status,
    due_date: a.dueDate,
    created_at_display: a.createdAt,
    completed_at: a.completedAt ?? null,
    notes: a.notes,
    target_delay_reduction_months: a.targetDelayReductionMonths,
  };
}

const ACTION_KEY_MAP: Record<string, keyof CaseAction> = {
  parcel_id: 'parcelId', survey_number: 'surveyNumber', title: 'title',
  action_type: 'actionType', assigned_officer: 'assignedOfficer',
  assigned_officer_role: 'assignedOfficerRole', priority: 'priority', status: 'status',
  due_date: 'dueDate', created_at_display: 'createdAt', completed_at: 'completedAt',
  notes: 'notes', target_delay_reduction_months: 'targetDelayReductionMonths',
};

function mapActionPatchToApi(patch: Partial<CaseAction>): Record<string, unknown> {
  const full = mapActionToApi(patch as CaseAction);
  const out: Record<string, unknown> = {};
  for (const [apiKey, feKey] of Object.entries(ACTION_KEY_MAP)) {
    if (patch[feKey] !== undefined) out[apiKey] = (full as Record<string, unknown>)[apiKey];
  }
  return out;
}

function mapAuditLogFromApi(a: ApiAuditLog): AuditLog {
  return {
    id: a.id,
    timestamp: a.timestamp_display,
    officerId: a.officer_id,
    officerName: a.officer_name,
    role: a.role,
    action: a.action,
    parcelId: a.parcel_id ?? undefined,
    surveyNumber: a.survey_number ?? undefined,
    details: a.details,
  };
}

function mapAuditLogToApi(a: AuditLog): Record<string, unknown> {
  return {
    id: a.id,
    timestamp_display: a.timestamp,
    officer_id: a.officerId,
    officer_name: a.officerName,
    role: a.role,
    action: a.action,
    parcel_id: a.parcelId ?? null,
    survey_number: a.surveyNumber ?? null,
    details: a.details,
  };
}

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  const data = await apiFetch<ApiProject[]>('/api/projects');
  return data.map(mapProjectFromApi);
}

export async function getProject(id: string): Promise<Project> {
  return mapProjectFromApi(await apiFetch<ApiProject>(`/api/projects/${encodeURIComponent(id)}`));
}

export async function createProject(project: Project): Promise<Project> {
  const data = await apiFetch<ApiProject>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(mapProjectToApi(project)),
  });
  return mapProjectFromApi(data);
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  const data = await apiFetch<ApiProject>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(mapProjectPatchToApi(patch)),
  });
  return mapProjectFromApi(data);
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch<void>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// -----------------------------------------------------------------------------
// Parcels
// -----------------------------------------------------------------------------

export async function listParcels(projectId?: string): Promise<Parcel[]> {
  const qs = toQueryString({ project_id: projectId });
  const data = await apiFetch<ApiParcel[]>(`/api/parcels${qs}`);
  return data.map(mapParcelFromApi);
}

export async function getParcel(id: string): Promise<Parcel> {
  return mapParcelFromApi(await apiFetch<ApiParcel>(`/api/parcels/${encodeURIComponent(id)}`));
}

export async function createParcel(parcel: Parcel): Promise<Parcel> {
  const data = await apiFetch<ApiParcel>('/api/parcels', {
    method: 'POST',
    body: JSON.stringify(mapParcelToApi(parcel)),
  });
  return mapParcelFromApi(data);
}

export async function updateParcel(id: string, patch: Partial<Parcel>): Promise<Parcel> {
  const data = await apiFetch<ApiParcel>(`/api/parcels/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(mapParcelPatchToApi(patch)),
  });
  return mapParcelFromApi(data);
}

export async function deleteParcel(id: string): Promise<void> {
  await apiFetch<void>(`/api/parcels/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// -----------------------------------------------------------------------------
// Alerts
// -----------------------------------------------------------------------------

export interface AlertFilters {
  projectId?: string;
  parcelId?: string;
  status?: string;
}

export async function listAlerts(filters: AlertFilters = {}): Promise<Alert[]> {
  const qs = toQueryString({
    project_id: filters.projectId,
    parcel_id: filters.parcelId,
    status: filters.status,
  });
  const data = await apiFetch<ApiAlert[]>(`/api/alerts${qs}`);
  return data.map(mapAlertFromApi);
}

export async function getAlert(id: string): Promise<Alert> {
  return mapAlertFromApi(await apiFetch<ApiAlert>(`/api/alerts/${encodeURIComponent(id)}`));
}

export async function createAlert(alert: Alert): Promise<Alert> {
  const data = await apiFetch<ApiAlert>('/api/alerts', {
    method: 'POST',
    body: JSON.stringify(mapAlertToApi(alert)),
  });
  return mapAlertFromApi(data);
}

export async function updateAlert(id: string, patch: Partial<Alert>): Promise<Alert> {
  const data = await apiFetch<ApiAlert>(`/api/alerts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(mapAlertPatchToApi(patch)),
  });
  return mapAlertFromApi(data);
}

export async function deleteAlert(id: string): Promise<void> {
  await apiFetch<void>(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// -----------------------------------------------------------------------------
// Actions (backend entity: case_actions / CaseAction)
// -----------------------------------------------------------------------------

export interface ActionFilters {
  parcelId?: string;
}

export async function listActions(filters: ActionFilters = {}): Promise<CaseAction[]> {
  const qs = toQueryString({ parcel_id: filters.parcelId });
  const data = await apiFetch<ApiCaseAction[]>(`/api/case-actions${qs}`);
  return data.map(mapActionFromApi);
}

export async function getAction(id: string): Promise<CaseAction> {
  return mapActionFromApi(await apiFetch<ApiCaseAction>(`/api/case-actions/${encodeURIComponent(id)}`));
}

export async function createAction(action: CaseAction): Promise<CaseAction> {
  const data = await apiFetch<ApiCaseAction>('/api/case-actions', {
    method: 'POST',
    body: JSON.stringify(mapActionToApi(action)),
  });
  return mapActionFromApi(data);
}

export async function updateAction(id: string, patch: Partial<CaseAction>): Promise<CaseAction> {
  const data = await apiFetch<ApiCaseAction>(`/api/case-actions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(mapActionPatchToApi(patch)),
  });
  return mapActionFromApi(data);
}

export async function deleteAction(id: string): Promise<void> {
  await apiFetch<void>(`/api/case-actions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// -----------------------------------------------------------------------------
// Audit logs — GET + POST only (immutable trail; matches the backend router,
// see backend/routers/audit_logs.py: no PATCH/DELETE exists to call).
// -----------------------------------------------------------------------------

export interface AuditLogFilters {
  parcelId?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
  const qs = toQueryString({
    parcel_id: filters.parcelId,
    limit: filters.limit,
    offset: filters.offset,
  });
  const data = await apiFetch<ApiAuditLog[]>(`/api/audit-logs${qs}`);
  return data.map(mapAuditLogFromApi);
}

export async function createAuditLog(log: AuditLog): Promise<AuditLog> {
  const data = await apiFetch<ApiAuditLog>('/api/audit-logs', {
    method: 'POST',
    body: JSON.stringify(mapAuditLogToApi(log)),
  });
  return mapAuditLogFromApi(data);
}

// -----------------------------------------------------------------------------
// Predictions (Step 3's persistence-aware endpoints). These are ADDITIVE —
// nothing in AppContext calls them yet in Step 4 (the existing /predict flow
// via mlApiService.ts is untouched and still the only thing driving the
// Predictive Analytics / parcel-drill-down UI). Exposed here so a future step
// can opt in without redesigning this client.
// -----------------------------------------------------------------------------

export interface CreatePredictionInput extends FastApiCaseInput {
  parcelId?: string;
}

export async function createProjectPrediction(
  projectId: string,
  input: CreatePredictionInput
): Promise<PersistedPredictionRecord> {
  const { parcelId, ...caseInput } = input;
  return apiFetch<PersistedPredictionRecord>(`/api/projects/${encodeURIComponent(projectId)}/predictions`, {
    method: 'POST',
    body: JSON.stringify({ ...caseInput, parcel_id: parcelId }),
  });
}

export async function listProjectPredictions(projectId: string): Promise<PersistedPredictionRecord[]> {
  return apiFetch<PersistedPredictionRecord[]>(`/api/projects/${encodeURIComponent(projectId)}/predictions`);
}

export async function getLatestProjectPrediction(
  projectId: string
): Promise<PersistedPredictionRecord | null> {
  try {
    return await apiFetch<PersistedPredictionRecord>(
      `/api/projects/${encodeURIComponent(projectId)}/predictions/latest`
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function listParcelPredictions(parcelId: string): Promise<PersistedPredictionRecord[]> {
  return apiFetch<PersistedPredictionRecord[]>(`/api/parcels/${encodeURIComponent(parcelId)}/predictions`);
}

export async function getLatestParcelPrediction(
  parcelId: string
): Promise<PersistedPredictionRecord | null> {
  try {
    return await apiFetch<PersistedPredictionRecord>(
      `/api/parcels/${encodeURIComponent(parcelId)}/predictions/latest`
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
