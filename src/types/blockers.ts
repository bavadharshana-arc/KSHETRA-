/**
 * KSHETRA — Blocker Engine (B1-B4) frontend types (Step 8C-B.2).
 *
 * Mirrors backend/blockers/db_schemas.py and the relevant members of
 * backend/blockers/enums.py field-for-field, as confirmed by direct
 * inspection of that code in the Step 8C-B.1 architecture audit.
 *
 * Kept in the backend's own snake_case shape, not remapped to camelCase —
 * see the rationale note at the top of src/types/legal.ts (this is
 * read-only reference data, never PATCHed back).
 */

/** The four canonical blocker classes. */
export type BlockerType = 'B1' | 'B2' | 'B3' | 'B4';

/** The persisted state of a Blocker row. Note: `NO_EVIDENCE` and
 * `EVIDENCE_OF_NO_BLOCKER` are deliberately NOT members of this type — the
 * backend never persists a Blocker row for either outcome, so a "no
 * blocker" case is represented by an empty list, never a row with one of
 * those statuses. */
export type BlockerStatus =
  | 'DETECTED'
  | 'SUSPECTED'
  | 'CONFIRMED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONFLICTED'
  | 'RESOLVED';

/** How bad the blocker is IF the evidence is right — a separate axis from
 * `BlockerStatus` (how SURE the engine is). */
export type BlockerSeverity = 'INFORMATIONAL' | 'WATCH' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type EvidenceRelation = 'SUPPORTS' | 'CONTRADICTS' | 'AMBIGUOUS';

/** Mirrors backend/blockers/db_schemas.py BlockerEvidenceRead exactly. */
export interface BlockerEvidence {
  id: string;
  blocker_id: string | null;
  evidence_type: string;
  source_ref_type: string;
  source_ref_id: string;
  source_type: string | null;
  verification_status: string;
  description: string;
  relation: EvidenceRelation;
  observed_at: string | null;
  recorded_at: string | null;
  notes: string;
  created_at: string;
}

/** Mirrors backend/blockers/db_schemas.py BlockerActionRead exactly. */
export interface BlockerAction {
  id: string;
  blocker_id: string | null;
  owner_role: string;
  authority: string;
  action_type: string;
  rationale: string;
  evidence_refs: string[];
  priority: string;
  status: string;
  precedent_refs: string[];
  created_at: string;
  updated_at: string;
}

/** Mirrors backend/blockers/db_schemas.py BlockerRead exactly. No fields
 * invented, none omitted. */
export interface Blocker {
  id: string;
  evaluation_run_id: string;
  case_reference: string;
  project_id: string | null;
  parcel_id: string | null;
  blocker_type: BlockerType;
  status: BlockerStatus;
  severity: BlockerSeverity;
  owner_role: string;
  responsible_authority: string;
  affects_clock: boolean;
  affected_clock_ids: string[];
  affects_possession: boolean;
  affects_project: boolean;
  /** Today: self-parcel-only (`affected_parcel_count`/`affected_area_acres`)
   * — real corridor-wide downstream computation is not implemented in this
   * prototype. Never render this as a computed corridor-wide figure. */
  downstream_extent: Record<string, unknown>;
  is_primary: boolean;
  ranking_basis: Record<string, unknown>;
  resolution_status: string | null;
  resolution_notes: string;
  resolution_evidence_refs: string[];
  engine_version: string;
  calculation_date: string | null;
  notes: string;
  calculated_at: string | null;
  created_at: string;
}

/**
 * Returned by GET /api/blockers/{id} — inlines the evidence and action rows
 * so a single request renders the full
 * WHY -> EVIDENCE -> SOURCE -> CONFIDENCE -> OWNER -> ACTION chain.
 */
export interface BlockerWithEvidence extends Blocker {
  evidence: BlockerEvidence[];
  actions: BlockerAction[];
}
