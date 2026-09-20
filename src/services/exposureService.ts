/**
 * KSHETRA — Exposure & Priority Engine service (Step 8C-B.2).
 *
 * Thin, read-only client over /api/exposure (+ the nested
 * /api/projects/{id}/exposure[/latest] and
 * /api/parcels/{id}/exposure[/latest] convenience routes) —
 * backend/routers/exposure.py. Reuses the shared `apiFetch`/`toQueryString`
 * infrastructure from apiClient.ts rather than duplicating fetch/timeout/
 * error-handling logic.
 *
 * No write/recompute endpoint exists on the backend for this engine —
 * this file is intentionally read-only, matching that. A `null`/empty
 * result from any function here means "not yet computed for this case,"
 * confirmed against the live database in the Step 8C-B.1 audit (§8): the
 * real seeded project/parcels currently have zero persisted exposure
 * assessments. Callers must render that as an honest empty state, never as
 * an error or a zero score.
 */

import { apiFetch, toQueryString } from './apiClient';
import type {
  ExposureAssessment,
  ExposureAssessmentWithContext,
  ExposureBand,
  PriorityBand,
} from '../types/exposure';

export interface ExposureAssessmentFilters {
  projectId?: string;
  parcelId?: string;
  caseReference?: string;
  minBand?: ExposureBand;
  /** Backend default is `true`. Only sent when explicitly set. */
  latestOnly?: boolean;
}

export interface PriorityQueueFilters {
  projectId?: string;
  limit?: number;
  minBand?: PriorityBand;
}

/** GET /api/exposure */
export async function listExposureAssessments(
  filters: ExposureAssessmentFilters = {}
): Promise<ExposureAssessment[]> {
  const qs = toQueryString({
    project_id: filters.projectId,
    parcel_id: filters.parcelId,
    case_reference: filters.caseReference,
    min_band: filters.minBand,
    latest_only: filters.latestOnly === undefined ? undefined : String(filters.latestOnly),
  });
  return apiFetch<ExposureAssessment[]>(`/api/exposure${qs}`);
}

/** GET /api/exposure/{id} — the one lookup in this file that genuinely
 * 404s (ApiError, status 404) when the id doesn't exist. */
export async function getExposureAssessment(
  id: string
): Promise<ExposureAssessmentWithContext> {
  return apiFetch<ExposureAssessmentWithContext>(`/api/exposure/${encodeURIComponent(id)}`);
}

/** GET /api/projects/{id}/exposure/latest — returns `null` (200 OK, not a
 * 404) when no assessment has been computed for this project yet
 * (confirmed by reading backend/routers/exposure.py directly). */
export async function getProjectLatestExposure(
  projectId: string
): Promise<ExposureAssessmentWithContext | null> {
  return apiFetch<ExposureAssessmentWithContext | null>(
    `/api/projects/${encodeURIComponent(projectId)}/exposure/latest`
  );
}

/** GET /api/parcels/{id}/exposure/latest — same `null`-means-"not yet
 * computed" contract as getProjectLatestExposure above. */
export async function getParcelLatestExposure(
  parcelId: string
): Promise<ExposureAssessmentWithContext | null> {
  return apiFetch<ExposureAssessmentWithContext | null>(
    `/api/parcels/${encodeURIComponent(parcelId)}/exposure/latest`
  );
}

/** GET /api/exposure/priority-queue — ranked by `priority_score` desc,
 * deterministically tie-broken by `case_reference`. This is the only
 * cross-case ranked endpoint across all three engines (legal/blockers have
 * no equivalent). An empty array is a valid, honest result — see the
 * module doc comment. */
export async function getPriorityQueue(
  filters: PriorityQueueFilters = {}
): Promise<ExposureAssessmentWithContext[]> {
  const qs = toQueryString({
    project_id: filters.projectId,
    limit: filters.limit,
    min_band: filters.minBand,
  });
  return apiFetch<ExposureAssessmentWithContext[]>(`/api/exposure/priority-queue${qs}`);
}
