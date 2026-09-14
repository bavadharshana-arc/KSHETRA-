/**
 * ============================================================================
 * KSHETRA — CANONICAL PREDICTION FEATURE SCHEMA
 * ============================================================================
 *
 * SINGLE SOURCE OF TRUTH for turning canonical Parcel / Project data into the
 * 7-field payload sent to `POST /predict`.
 *
 * Both prediction paths use the definitions in this file:
 *   - buildParcelCaseInput(parcel, ...)   — parcel drill-down (indicative)
 *   - buildProjectCaseInput(project, ...)  — project / case level (primary)
 *
 * RULE: a feature name always denotes the SAME physical quantity in both paths.
 *
 * The trained LightGBM + Cox feature schema is FIXED and is NOT changed here
 * (6 numeric + `acquisition_stage`). This module only makes the frontend inputs
 * semantically consistent with that fixed schema — it adds no model feature.
 * `previous_delays_months` was removed from both models in Stage 7 (no genuine
 * source field existed; it was served as a constant 0 -> train/serve skew).
 *
 * All data is synthetic demonstration data. Nothing here is a real government
 * record or an official determination.
 *
 * ----------------------------------------------------------------------------
 * CANONICAL FEATURE DEFINITIONS
 * ----------------------------------------------------------------------------
 * parcel_count
 *   = number of parcels in the acquisition case / project.
 *     Source: project.totalParcels (falls back to the loaded record count).
 *     NOTE: the friction counts below are computed from the parcel records
 *     actually loaded in this prototype (a curated demo subset), NOT from all
 *     `parcel_count` parcels. They are therefore SAMPLE-OBSERVED counts. We do
 *     not fabricate records for unseen parcels. See buildProjectCaseInput notes.
 *
 * litigation_cases
 *   = count of ACTIVE court cases represented by the input record(s).
 *     "Active" = courtCaseStatus is 'Active - Stay Order' or 'Pending Hearing'.
 *     'Disposed' and 'None' are NOT active.
 *     Parcel path  -> 1 if the parcel has an active case, else 0.
 *     Project path -> number of loaded parcels with an active case
 *                     (one court record per parcel => one case per parcel).
 *     An interim injunction does NOT inflate this count. Injunction status is
 *     preserved on the parcel record / UI but is not a model feature.
 *
 * ownership_disputes
 *   = count of parcel record(s) with an actual ownership / title dispute
 *     (parcel.ownershipDispute !== 'No').
 *     Parcel path  -> 1 if disputed, else 0.
 *     Project path -> number of loaded parcels with a dispute.
 *     coOwnerCount is NEVER used here — number of co-owners is not a dispute
 *     count.
 *
 * document_issues
 *   = count of parcel record(s) with a qualifying DOCUMENT issue, using ONE rule:
 *       documentStatus === 'Missing Documents'  OR
 *       documentStatus === 'Disputed'
 *     Parcel path  -> 1 if qualifying, else 0.
 *     Project path -> number of loaded parcels that qualify.
 *     It is a COUNT, not a weighted severity score (no +3/+2/+2).
 *     Stale/disputed MUTATION is a separate revenue-record condition
 *     (parcel.mutationStatus) and is deliberately NOT folded in here — the
 *     trained schema has no mutation feature, and counting it under
 *     document_issues would double-count a distinct condition. Documented as a
 *     known limitation (see REMAINING LIMITATIONS below).
 *
 * compensation_pending_pct
 *   = percentage of the relevant parcel record(s) whose compensation is not
 *     fully disbursed. Range [0, 100].
 *       fully disbursed  = compensationStatus === 'Disbursed 100%'  -> 0
 *       not fully disbursed                                          -> 100
 *     Parcel path  -> 0 or 100 for the single parcel.
 *     Project path -> notFullyDisbursed / loadedParcels * 100, clamped [0,100].
 *     No invented intermediate percentages (no 75 / 60 / 50 magic values); this
 *     prototype has no parcel-level monetary disbursement figure.
 *
 * notification_age_months
 *   = elapsed months from the canonical Sec 3A/11 notification date to a FIXED
 *     demo as-of date (DEMO_ASOF_DATE), clamped to [1, 360], 1 decimal.
 *     Parcel path  -> age of parcel.notificationDate.
 *     Project path -> age of the EARLIEST loaded parcel gazette date (the
 *                     project's first notification event).
 *     The live wall clock (Date.now) is NEVER used for this feature, so the
 *     same input always yields the same feature vector during the demo.
 *
 * acquisition_stage
 *   = current LARR statutory stage (one of the 6 canonical stages).
 *     Parcel path  -> parcel.stage.
 *     Project path -> project.currentLarrStage.
 *     One-hot encoded server-side against a fixed category list.
 *
 * ----------------------------------------------------------------------------
 * REMAINING LIMITATIONS (carried, not fixed in this pass)
 * ----------------------------------------------------------------------------
 * - Friction counts are sample-observed over the loaded parcels, while
 *   parcel_count is the full project total; the model's implicit
 *   count / parcel_count relationship is therefore under-fed. Fixing this needs
 *   either full parcel data or a schema change (a separate pass).
 * - notification_age_months (project) uses the earliest loaded gazette date,
 *   which can be an already-acquired parcel.
 * ============================================================================
 */

import { Parcel, Project, LarrStage } from '../types';

/** The 7 fields the backend `CaseInput` expects. Schema is fixed — do not extend. */
export interface FastApiCaseInput {
  parcel_count: number;
  litigation_cases: number;
  compensation_pending_pct: number;
  acquisition_stage: string;
  ownership_disputes: number;
  document_issues: number;
  notification_age_months: number;
}

/**
 * Fixed "as-of" date for all demo feature engineering. Every prediction request
 * derives `notification_age_months` from THIS date, never `Date.now()`, so a
 * given parcel/project always produces the same feature vector and prediction.
 *
 * `new Date(2026, 8, 7)` = local midnight 2026-09-07 (month index 8 = September),
 * parsed the same way as the seed `notificationDate` strings.
 */
export const DEMO_ASOF_DATE = new Date(2026, 8, 7);
const DEMO_ASOF_MS = DEMO_ASOF_DATE.getTime();
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

const DEFAULT_STAGE: LarrStage = 'Notification (Sec 3A/11)';

/** Sane numeric guards matching the backend `CaseInput` bounds. */
const MAX_PARCEL_COUNT = 5000;
const MAX_COUNT_FEATURE = 5000;
const MAX_LITIGATION = 500;
const MAX_AGE_MONTHS = 360;

const ACTIVE_LITIGATION_STATUSES: ReadonlyArray<Parcel['courtCaseStatus']> = [
  'Active - Stay Order',
  'Pending Hearing',
];

// ---------------------------------------------------------------------------
// Canonical per-parcel predicates (shared by both paths)
// ---------------------------------------------------------------------------

/** True when the parcel has an ACTIVE court case (not 'Disposed', not 'None'). */
export function parcelHasActiveLitigation(parcel: Parcel): boolean {
  return ACTIVE_LITIGATION_STATUSES.includes(parcel.courtCaseStatus);
}

/** True when the parcel record carries an actual ownership / title dispute. */
export function parcelHasOwnershipDispute(parcel: Parcel): boolean {
  return !!parcel.ownershipDispute && parcel.ownershipDispute !== 'No';
}

/** True when the parcel has a qualifying DOCUMENT issue (one consistent rule). */
export function parcelHasDocumentIssue(parcel: Parcel): boolean {
  return (
    parcel.documentStatus === 'Missing Documents' ||
    parcel.documentStatus === 'Disputed'
  );
}

/** True when the parcel's compensation is fully disbursed. */
export function parcelCompensationFullyDisbursed(parcel: Parcel): boolean {
  return parcel.compensationStatus === 'Disbursed 100%';
}

/** Elapsed months from a notification date string to the fixed demo as-of date. */
export function notificationAgeMonths(notificationDate?: string): number | null {
  if (!notificationDate) return null;
  const t = new Date(notificationDate).getTime();
  if (Number.isNaN(t)) return null;
  const months = (DEMO_ASOF_MS - t) / MS_PER_MONTH;
  return +Math.min(MAX_AGE_MONTHS, Math.max(1, months)).toFixed(1);
}

const clampInt = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));

// ---------------------------------------------------------------------------
// Parcel drill-down feature vector
// ---------------------------------------------------------------------------

/**
 * Build the /predict payload for ONE parcel (indicative drill-down).
 *
 * `totalProjectParcels` supplies `parcel_count` (the case scale). The parcel's
 * own friction is expressed as 0/1 counts — this single record contributes at
 * most one active case, one dispute, one document issue.
 */
export function buildParcelCaseInput(
  parcel: Parcel,
  totalProjectParcels?: number
): FastApiCaseInput {
  const parcel_count = clampInt(
    Math.max(1, totalProjectParcels && totalProjectParcels > 0 ? totalProjectParcels : 120),
    MAX_PARCEL_COUNT
  );

  const litigation_cases = parcelHasActiveLitigation(parcel) ? 1 : 0;
  const ownership_disputes = parcelHasOwnershipDispute(parcel) ? 1 : 0;
  const document_issues = parcelHasDocumentIssue(parcel) ? 1 : 0;
  const compensation_pending_pct = parcelCompensationFullyDisbursed(parcel) ? 0 : 100;

  const notification_age_months = notificationAgeMonths(parcel.notificationDate) ?? 18.0;

  const acquisition_stage: string = parcel.stage || DEFAULT_STAGE;

  return {
    parcel_count,
    litigation_cases,
    compensation_pending_pct,
    acquisition_stage,
    ownership_disputes,
    document_issues,
    notification_age_months,
  };
}

// ---------------------------------------------------------------------------
// Project / case-level feature vector
// ---------------------------------------------------------------------------

export interface ProjectFeatureBuild {
  input: FastApiCaseInput;
  /** Number of parcel records actually used to compute the friction counts. */
  parcelsAnalyzed: number;
  /**
   * Sample-coverage metadata (PART F). Makes the "8 loaded records vs 380
   * declared parcels" distinction explicit so no UI implies the loaded subset
   * represents the whole project.
   */
  sampleCoverage: {
    /** Parcels declared by the project (project.totalParcels). */
    projectParcelCount: number;
    /** Parcel records actually loaded in this prototype. */
    loadedParcelCount: number;
    /** loadedParcelCount / projectParcelCount * 100, 1 decimal. */
    sampleCoveragePct: number;
    /** True when the loaded records cover every declared parcel. */
    fullCoverage: boolean;
  };
  /** Human-readable caveats surfaced in the UI's "aggregated model input" panel. */
  notes: string[];
}

/**
 * Build the /predict payload for a whole acquisition project/case.
 *
 * Friction features (`litigation_cases`, `ownership_disputes`, `document_issues`)
 * are SAMPLE-OBSERVED counts over `projectParcels` (the records currently
 * loaded). `parcel_count` is the full project total. We do NOT scale the counts
 * up to `parcel_count` (that would fabricate unseen records) and we do NOT drop
 * `parcel_count` to the sample size (that would change its meaning and push the
 * model out of its training range). The mismatch is surfaced in `notes`.
 */
export function buildProjectCaseInput(
  project: Project,
  projectParcels: Parcel[]
): ProjectFeatureBuild {
  const notes: string[] = [];
  const n = projectParcels.length;

  const parcel_count = clampInt(
    Math.max(1, project.totalParcels || n || 1),
    MAX_PARCEL_COUNT
  );

  const litigation_cases = Math.min(
    MAX_LITIGATION,
    projectParcels.filter(parcelHasActiveLitigation).length
  );
  const ownership_disputes = Math.min(
    MAX_COUNT_FEATURE,
    projectParcels.filter(parcelHasOwnershipDispute).length
  );
  const document_issues = Math.min(
    MAX_COUNT_FEATURE,
    projectParcels.filter(parcelHasDocumentIssue).length
  );

  let compensation_pending_pct = 50.0;
  if (n > 0) {
    const notFullyDisbursed = projectParcels.filter(
      (p) => !parcelCompensationFullyDisbursed(p)
    ).length;
    compensation_pending_pct = +Math.min(
      100,
      Math.max(0, (notFullyDisbursed / n) * 100)
    ).toFixed(1);
  } else {
    notes.push('No parcels loaded for this project — compensation_pending_pct defaulted to 50%.');
  }

  const acquisition_stage: string = project.currentLarrStage || DEFAULT_STAGE;

  // notification_age_months from the EARLIEST loaded gazette date, fixed as-of.
  let notification_age_months = 18.0;
  const ages = projectParcels
    .map((p) => (p.notificationDate ? new Date(p.notificationDate).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  if (ages.length > 0) {
    const earliest = Math.min(...ages);
    notification_age_months = +Math.min(
      MAX_AGE_MONTHS,
      Math.max(1, (DEMO_ASOF_MS - earliest) / MS_PER_MONTH)
    ).toFixed(1);
  } else {
    notes.push('No parcel gazette dates available — notification_age_months defaulted to 18.0.');
  }

  if (n > 0 && parcel_count > n) {
    notes.push(
      `Friction counts are sample-observed over the ${n} loaded parcel record(s); the project declares ${parcel_count} parcels total. Counts are not scaled up and no unseen records are fabricated.`
    );
  }

  const sampleCoveragePct =
    parcel_count > 0 ? +Math.min(100, (n / parcel_count) * 100).toFixed(1) : 0;

  return {
    input: {
      parcel_count,
      litigation_cases,
      compensation_pending_pct,
      acquisition_stage,
      ownership_disputes,
      document_issues,
      notification_age_months,
    },
    parcelsAnalyzed: n,
    sampleCoverage: {
      projectParcelCount: parcel_count,
      loadedParcelCount: n,
      sampleCoveragePct,
      fullCoverage: n >= parcel_count && n > 0,
    },
    notes,
  };
}
