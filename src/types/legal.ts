/**
 * KSHETRA — Statutory Clock Engine frontend types (Step 8C-B.2).
 *
 * Mirrors backend/legal/db_schemas.py `StatutoryClockRead` and the relevant
 * members of backend/legal/enums.py field-for-field, as confirmed by direct
 * inspection of that code in the Step 8C-B.1 architecture audit.
 *
 * Deliberately kept in the backend's own snake_case shape rather than
 * remapped to camelCase the way `Project`/`Parcel`/`Alert`/`CaseAction` are
 * in apiClient.ts: this is read-only reference data that is never PATCHed
 * back, so the boundary-crossing discipline that justifies a maintained
 * camelCase mirror + key-map for those mutable domain aggregates isn't load
 * -bearing here. A faithful passthrough is the smaller, safer surface — see
 * docs/step8c-frontend-integration-audit.md §12 (the same reasoning the
 * prior audit already recommended for exposure).
 */

/** The three statutory families the clock engine keeps structurally
 * separate — never merged, never inferred. */
export type ApplicableAct = 'RFCTLARR' | 'NH_ACT_1956' | 'LA_ACT_1894';

/** The six clock-status states — an EVIDENTIARY/computational state. */
export type ClockStatus =
  | 'INSUFFICIENT_BASIS'
  | 'CLOCK_CERTAIN'
  | 'CLOCK_UNCERTAIN'
  | 'EXTENSION_UNVERIFIED'
  | 'APPARENT_LAPSE'
  | 'LEGACY_1894';

/**
 * What a clock's state MEANS for a human reader — deliberately kept as a
 * SEPARATE field from `ClockStatus` by the backend so a high-severity
 * `clock_status` can never silently read as a certified legal conclusion.
 * Never collapse `clock_status` and `consequence_class` into one label in
 * any UI that consumes `StatutoryClockResult`.
 */
export type ConsequenceClass =
  | 'PROCESS_DELAY'
  | 'CLOCK_AT_RISK'
  | 'CLOCK_EXPIRED'
  | 'APPARENT_LAPSE'
  | 'LEGAL_STATUS_REQUIRES_VERIFICATION';

export type ExtensionStatus =
  | 'EXTENSION_UNKNOWN'
  | 'EXTENSION_CLAIMED'
  | 'EXTENSION_VERIFIED'
  | 'EXTENSION_REJECTED';

/**
 * Mirrors backend/legal/db_schemas.py `StatutoryClockRead` exactly, field
 * for field. No fields invented, none omitted.
 */
export interface StatutoryClockResult {
  id: string;
  case_reference: string;
  project_id: string | null;
  parcel_id: string | null;
  applicable_act: ApplicableAct;
  section_reference: string;
  rule_set_id: string;
  rule_set_version: string;
  trigger_event_id: string | null;
  trigger_date: string | null;
  statutory_period: string;
  computed_deadline: string | null;
  extension_status: ExtensionStatus;
  extension_evidence_id: string | null;
  stay_adjustment_days: number;
  adjusted_deadline: string | null;
  calculation_date: string;
  days_elapsed: number | null;
  days_remaining: number | null;
  /** Evidentiary/computational state — see the ClockStatus doc comment. */
  clock_status: ClockStatus;
  /** What the clock state means for a human reader — kept separate from
   * clock_status on purpose. Never merge these two fields into one badge. */
  consequence_class: ConsequenceClass;
  calculation_basis: string;
  source_references: string[];
  event_conflict_id: string | null;
  calculated_at: string;
  calculation_version: string;
  notes: string;
  created_at: string;
}
