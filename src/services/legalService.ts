/**
 * KSHETRA — Statutory Clock Engine service (Step 8C-B.2).
 *
 * Thin, read-only client over GET /api/legal/clocks[/…]
 * (backend/routers/legal.py). Reuses the shared `apiFetch`/`toQueryString`
 * infrastructure from apiClient.ts rather than duplicating fetch/timeout/
 * error-handling logic — see docs/step8c-frontend-integration-audit.md §4
 * and the Step 8C-B.1 architecture audit §4/§10.
 *
 * `legal.py` exposes no `/api/projects/{id}/legal/clocks` or
 * `/api/parcels/{id}/legal/clocks` convenience route (unlike the blockers
 * and exposure routers) — only `GET /api/legal/clocks` with
 * `project_id`/`parcel_id` query params. `getProjectClocks`/`getParcelClocks`
 * below are therefore thin wrappers over that one endpoint, not a second,
 * invented endpoint.
 *
 * No write/recompute endpoint exists on the backend for this engine —
 * this file is intentionally read-only, matching that.
 */

import { apiFetch, toQueryString } from './apiClient';
import type { ApplicableAct, ClockStatus, StatutoryClockResult } from '../types/legal';

export interface StatutoryClockFilters {
  projectId?: string;
  parcelId?: string;
  applicableAct?: ApplicableAct;
  clockStatus?: ClockStatus;
}

/** GET /api/legal/clocks — the one real endpoint every other function in
 * this file is built on top of. */
export async function listStatutoryClocks(
  filters: StatutoryClockFilters = {}
): Promise<StatutoryClockResult[]> {
  const qs = toQueryString({
    project_id: filters.projectId,
    parcel_id: filters.parcelId,
    applicable_act: filters.applicableAct,
    clock_status: filters.clockStatus,
  });
  return apiFetch<StatutoryClockResult[]>(`/api/legal/clocks${qs}`);
}

/** GET /api/legal/clocks/{id}. Throws ApiError (status 404) if no clock
 * with this id exists — callers decide how to degrade, matching the
 * existing apiClient.ts `getProject`/`getParcel`/`getAlert` convention of
 * never swallowing a genuine not-found. */
export async function getStatutoryClock(id: string): Promise<StatutoryClockResult> {
  return apiFetch<StatutoryClockResult>(`/api/legal/clocks/${encodeURIComponent(id)}`);
}

/** Convenience wrapper — see the module doc comment: no dedicated backend
 * route exists, this filters the one real endpoint by project_id. */
export async function getProjectClocks(projectId: string): Promise<StatutoryClockResult[]> {
  return listStatutoryClocks({ projectId });
}

/** Convenience wrapper — see the module doc comment: no dedicated backend
 * route exists, this filters the one real endpoint by parcel_id. */
export async function getParcelClocks(parcelId: string): Promise<StatutoryClockResult[]> {
  return listStatutoryClocks({ parcelId });
}
