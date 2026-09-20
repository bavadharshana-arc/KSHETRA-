/**
 * KSHETRA — Exposure & Priority Engine frontend types (Step 8C-B.2).
 *
 * Mirrors backend/exposure/db_schemas.py field-for-field, as confirmed by
 * direct inspection of that code (and of backend/exposure/models.py's
 * `ComponentTrace` dataclass, which is what `component_trace` is serialized
 * from) in the Step 8C-B.1 architecture audit. No fields invented.
 *
 * Kept in the backend's own snake_case shape, not remapped to camelCase —
 * see the rationale note at the top of src/types/legal.ts.
 *
 * IMPORTANT naming note: `priority_band` here is a DIFFERENT, differently
 * -scaled concept from the existing `Parcel.priority` and `CaseAction.priority`
 * fields in src/types/index.ts (`'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'`, hand
 * -authored/manually-assigned). `PriorityBand` (`WATCH|MONITOR|SOON|ACT_NOW`)
 * is a computed, deterministic, evidence-based engine output. Never rename
 * or alias one to the other — see
 * docs/step8c-frontend-integration-audit.md §6/§15 and the Step 8C-B.1
 * audit §6 for the full naming-collision analysis. This file does not
 * modify `Parcel.priority` or `CaseAction.priority` in any way.
 */

export type ExposureBand = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

/** A computed engine output — NOT the same concept as `Parcel.priority` or
 * `CaseAction.priority`. See the module doc comment above. */
export type PriorityBand = 'WATCH' | 'MONITOR' | 'SOON' | 'ACT_NOW';

export type ConfidenceLabel = 'VERIFIED' | 'PARTIAL' | 'NEEDS_VERIFICATION' | 'INSUFFICIENT';

/**
 * The one enum member this prototype's GIS downstream/corridor-impact
 * computation actually has today. Typed as a widened string (not a closed
 * literal union) so the field stays tolerant if the backend ever adds a
 * real computed status — never assume a value other than `NOT_COMPUTED` is
 * possible today, and never render this field as if a real corridor
 * computation happened.
 */
export type GisDownstreamStatus = 'NOT_COMPUTED' | (string & {});

/**
 * Mirrors backend/exposure/models.py `ComponentTrace`, serialized as-is
 * into `ExposureAssessment.component_trace`. The backend's own wire type is
 * `Dict[str, Any]` (no server-enforced contract) — every field here is
 * OPTIONAL, and the index signature keeps this type tolerant of fields this
 * file doesn't know about yet. Always access fields defensively
 * (`trace?.gis_downstream_status`), never assume a field is present.
 */
export interface ComponentTrace {
  legal_band?: number;
  possession_band?: number;
  downstream_band?: number;
  project_scale_band?: number;
  secondary_bonus?: number;
  exposure_raw?: number;
  exposure_band_equivalent?: number;
  urgency_band?: number;
  actionability_band?: number;
  priority_raw?: number;
  weights_version?: string;
  priority_weights_version?: string;
  staleness_policy_version?: string;
  /** Always "NOT_COMPUTED" in this prototype — see GisDownstreamStatus. */
  gis_downstream_status?: GisDownstreamStatus;
  gis_downstream_note?: string;
  days_remaining?: number | null;
  clock_status?: string;
  project_value_crores?: number | null;
  project_value_reference_count?: number;
  affected_parcel_count?: number;
  affected_area_acres?: number;
  contributing_b1_blocker_ids?: string[];
  contributing_possession_blocker_ids?: string[];
  primary_blocker_id?: string | null;
  secondary_blocker_ids?: string[];
  conflicted_blocker_ids?: string[];
  insufficient_blocker_ids?: string[];
  owner_role?: string | null;
  responsible_authority?: string | null;
  prediction_id?: string | null;
  prediction_delay_probability?: number | null;
  prediction_generated_at?: string | null;
  prediction_is_stale?: boolean;
  blocker_evidence_is_stale?: boolean;
  /** Human-readable strings recording every neutral-substitution decision
   * ("we didn't know this input, so we used the neutral band") — always
   * surface these verbatim when present, never silently drop them. */
  neutral_substitutions?: string[];
  /** Disclaimer text carried verbatim from a contributing blocker's own
   * `.notes` (e.g. the APPARENT_LAPSE-is-not-a-confirmed-lapse caveat) —
   * never paraphrase these. */
  disclaimers?: string[];
  extra?: Record<string, unknown>;
  /** Tolerance for any field this type doesn't yet know about — the
   * backend's own wire contract is Dict[str, Any]. */
  [key: string]: unknown;
}

/**
 * Mirrors backend/exposure/db_schemas.py `ExposureAssessmentRead` exactly —
 * returned by the plain list endpoints (GET /api/exposure,
 * GET /api/projects/{id}/exposure, GET /api/parcels/{id}/exposure).
 */
export interface ExposureAssessment {
  id: string;
  case_reference: string;
  project_id: string | null;
  parcel_id: string | null;
  prediction_id: string | null;
  primary_blocker_id: string | null;
  secondary_blocker_ids: string[];
  exposure_score: number;
  exposure_band: ExposureBand;
  priority_score: number;
  priority_band: PriorityBand;
  confidence_label: ConfidenceLabel;
  unresolved_conflict: boolean;
  component_trace: ComponentTrace;
  recommended_action_id: string | null;
  engine_version: string;
  calculation_date: string | null;
  notes: string;
  calculated_at: string | null;
  created_at: string;
}

/**
 * Mirrors backend/exposure/db_schemas.py `ExposureAssessmentWithContextRead`
 * exactly — returned by GET /api/exposure/{id}, GET /api/exposure/priority-queue,
 * and the two `/latest` endpoints. Adds the primary blocker's owner/action
 * summary, inlined verbatim from the already-persisted Blocker/BlockerAction
 * rows (never a new computation) — only populated when `primary_blocker_id`
 * resolves to a real, still-existing Blocker row.
 */
export interface ExposureAssessmentWithContext extends ExposureAssessment {
  owner_role: string | null;
  responsible_authority: string | null;
  recommended_action_type: string | null;
  recommended_action_rationale: string | null;
}
