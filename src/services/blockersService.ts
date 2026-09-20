/**
 * KSHETRA — Blocker Engine (B1-B4) service (Step 8C-B.2).
 *
 * Thin, read-only client over /api/blockers (+ the nested
 * /api/projects/{id}/blockers[/primary] and /api/parcels/{id}/blockers
 * convenience routes) — backend/routers/blockers.py. Reuses the shared
 * `apiFetch`/`toQueryString` infrastructure from apiClient.ts rather than
 * duplicating fetch/timeout/error-handling logic.
 *
 * No write/recompute endpoint exists on the backend for this engine —
 * this file is intentionally read-only, matching that.
 */

import { apiFetch, toQueryString } from './apiClient';
import type { Blocker, BlockerType, BlockerWithEvidence } from '../types/blockers';

export interface BlockerFilters {
  projectId?: string;
  parcelId?: string;
  blockerType?: BlockerType;
  statusFilter?: string;
  /** Backend default is `true`. Only sent when explicitly set, so the
   * backend's own default stays authoritative unless a caller opts out. */
  latestOnly?: boolean;
}

/** GET /api/blockers */
export async function listBlockers(filters: BlockerFilters = {}): Promise<Blocker[]> {
  const qs = toQueryString({
    project_id: filters.projectId,
    parcel_id: filters.parcelId,
    blocker_type: filters.blockerType,
    status_filter: filters.statusFilter,
    latest_only: filters.latestOnly === undefined ? undefined : String(filters.latestOnly),
  });
  return apiFetch<Blocker[]>(`/api/blockers${qs}`);
}

/** GET /api/blockers/{id} — inlines evidence + actions (the full
 * WHY -> EVIDENCE -> SOURCE -> CONFIDENCE -> OWNER -> ACTION chain).
 * Throws ApiError (status 404) if no blocker with this id exists. */
export async function getBlocker(id: string): Promise<BlockerWithEvidence> {
  return apiFetch<BlockerWithEvidence>(`/api/blockers/${encodeURIComponent(id)}`);
}

/** GET /api/projects/{id}/blockers */
export async function getProjectBlockers(projectId: string): Promise<Blocker[]> {
  return apiFetch<Blocker[]>(`/api/projects/${encodeURIComponent(projectId)}/blockers`);
}

/** GET /api/projects/{id}/blockers/primary — returns `null` (200 OK, not a
 * 404) when the project has no primary-eligible blocker, confirmed by
 * reading backend/routers/blockers.py directly: the handler returns
 * whatever `db_crud.get_primary_blocker` returns with no HTTPException. A
 * `null` result means "no primary blocker identified," not an error. */
export async function getProjectPrimaryBlocker(projectId: string): Promise<Blocker | null> {
  return apiFetch<Blocker | null>(
    `/api/projects/${encodeURIComponent(projectId)}/blockers/primary`
  );
}

/** GET /api/parcels/{id}/blockers */
export async function getParcelBlockers(parcelId: string): Promise<Blocker[]> {
  return apiFetch<Blocker[]>(`/api/parcels/${encodeURIComponent(parcelId)}/blockers`);
}
