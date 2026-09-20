import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, MapPin, UserCheck, Gavel, ArrowRight, Unlock } from 'lucide-react';
import { Badge, AccentColor } from '../ui';
import { getBlocker } from '../../services/blockersService';
import type {
  ExposureAssessmentWithContext,
  ExposureBand,
  PriorityBand,
  ConfidenceLabel,
} from '../../types/exposure';
import type { BlockerSeverity, BlockerType, BlockerWithEvidence } from '../../types/blockers';

/**
 * KSHETRA — Exposure & Priority result card (Step 8C-B.4, blocker
 * human-readability added Step 8C-B.6).
 *
 * Reusable, presentational-first — receives an already-fetched
 * `ExposureAssessmentWithContext` (or null/loading/error) and renders it.
 * Does NOT call `exposureService` itself; callers (PriorityQueuePanel,
 * ParcelDetailModal) own that fetch. The ONE exception is the primary
 * blocker's own human-readable type/severity, which this component resolves
 * itself via `blockersService.getBlocker` (Step 8C-B.6) — `owner_role` is
 * already inlined on `assessment` by the backend and needs no extra call;
 * only `blocker_type`/`severity` require one, and only when
 * `primary_blocker_id` is actually present (most rows have none, per Step
 * 8C-B.3's real data — no call is made for those).
 *
 * NAMING: deliberately never labels `priority_band` as bare "Priority" —
 * `Parcel.priority` and `CaseAction.priority` already use that word for a
 * different, hand-assigned CRITICAL/HIGH/MEDIUM/LOW scale. Always
 * "Priority Band" here, and its own distinct band values (ACT_NOW/SOON/
 * MONITOR/WATCH) and accent-color mapping so it never reads as a re-skin of
 * the existing priority pills — see docs/step8c-frontend-integration-audit.md
 * §6 and the Step 8C-B.1 audit §6.
 */

const PRIORITY_BAND_ACCENT: Record<PriorityBand, AccentColor> = {
  ACT_NOW: 'red',
  SOON: 'amber',
  MONITOR: 'indigo',
  WATCH: 'neutral',
};

const EXPOSURE_BAND_ACCENT: Record<ExposureBand, AccentColor> = {
  CRITICAL: 'red',
  HIGH: 'amber',
  MODERATE: 'indigo',
  LOW: 'neutral',
};

const CONFIDENCE_ACCENT: Record<ConfidenceLabel, AccentColor> = {
  VERIFIED: 'emerald',
  PARTIAL: 'amber',
  NEEDS_VERIFICATION: 'amber',
  INSUFFICIENT: 'red',
};

/**
 * Human-readable labels for `blockers.enums.BlockerType` — copied verbatim
 * from that enum's own inline documentation comments
 * (`backend/blockers/enums.py`: "B1 = Statutory-clock exposure", "B2 =
 * Title & record friction", "B3 = Contested compensation / R&R", "B4 =
 * Possession-blocking encumbrance"), not invented here. The underlying `B1`
 * -`B4` enum value is always preserved and still shown (in the blocker id
 * tooltip) — this is a label, not a replacement of the real value.
 */
const BLOCKER_TYPE_LABEL: Record<BlockerType, string> = {
  B1: 'Statutory Clock Exposure',
  B2: 'Title & Record Friction',
  B3: 'Contested Compensation / R&R',
  B4: 'Possession-Blocking Encumbrance',
};

const BLOCKER_SEVERITY_ACCENT: Record<BlockerSeverity, AccentColor> = {
  CRITICAL: 'red',
  HIGH: 'amber',
  MODERATE: 'amber',
  WATCH: 'neutral',
  INFORMATIONAL: 'neutral',
};

function formatBandLabel(band: string): string {
  return band.replace(/_/g, ' ');
}

interface ExposurePriorityCardProps {
  assessment: ExposureAssessmentWithContext | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Shown when `assessment` is null and there is no error — override for
   * the Priority Queue's own "No cases currently ranked" wording. */
  emptyMessage?: string;
  compact?: boolean;
}

export const ExposurePriorityCard: React.FC<ExposurePriorityCardProps> = ({
  assessment,
  loading = false,
  error = null,
  onRetry,
  emptyMessage = 'No Exposure & Priority assessment computed for this case yet.',
  compact = false,
}) => {
  // Primary blocker human-readable lookup (Step 8C-B.6). Declared before any
  // early return below so this hook is called unconditionally on every
  // render, per the Rules of Hooks — it simply no-ops when there is no
  // primary_blocker_id to resolve.
  const primaryBlockerId = assessment?.primary_blocker_id ?? null;
  const [primaryBlocker, setPrimaryBlocker] = useState<BlockerWithEvidence | null>(null);
  const [primaryBlockerLoading, setPrimaryBlockerLoading] = useState<boolean>(false);
  const [primaryBlockerFailed, setPrimaryBlockerFailed] = useState<boolean>(false);

  useEffect(() => {
    if (!primaryBlockerId) {
      setPrimaryBlocker(null);
      setPrimaryBlockerFailed(false);
      return;
    }
    let cancelled = false;
    setPrimaryBlockerLoading(true);
    setPrimaryBlockerFailed(false);
    getBlocker(primaryBlockerId)
      .then((result) => {
        if (!cancelled) setPrimaryBlocker(result);
      })
      .catch(() => {
        // Honest failure state only — never invent a label for a blocker
        // that couldn't be resolved (deleted row, network error, etc.).
        if (!cancelled) {
          setPrimaryBlocker(null);
          setPrimaryBlockerFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setPrimaryBlockerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [primaryBlockerId]);

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
        Loading Exposure &amp; Priority assessment…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex items-start gap-2.5 flex-1">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shrink-0 self-start sm:self-auto"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
        {emptyMessage}
      </div>
    );
  }

  const trace = assessment.component_trace || {};
  const clockStatus = trace.clock_status;
  const gisStatus = trace.gis_downstream_status;

  return (
    <div className={`rounded-xl bg-white border border-slate-200 ${compact ? 'p-3.5' : 'p-4'} space-y-3`}>
      {/* Priority Band + Exposure + Confidence headline row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Priority Band</span>
          <Badge color={PRIORITY_BAND_ACCENT[assessment.priority_band]}>
            {formatBandLabel(assessment.priority_band)}
          </Badge>
          <span className="text-[11px] font-mono text-slate-500">{assessment.priority_score.toFixed(0)}/100</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Exposure</span>
          <Badge color={EXPOSURE_BAND_ACCENT[assessment.exposure_band]}>{assessment.exposure_band}</Badge>
          <span className="text-[11px] font-mono text-slate-500">{assessment.exposure_score.toFixed(0)}/100</span>
        </div>

        <Badge color={CONFIDENCE_ACCENT[assessment.confidence_label]} className="ml-auto border-dashed">
          {assessment.confidence_label === 'INSUFFICIENT'
            ? 'Insufficient Evidence'
            : formatBandLabel(assessment.confidence_label)}
        </Badge>
      </div>

      <div className="text-[11px] text-slate-500 font-mono">
        Case: {assessment.case_reference}
        {assessment.parcel_id ? ` · Parcel ${assessment.parcel_id}` : ' · Project-level'}
      </div>

      {/* Primary Blocker + Action Owner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
          <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
            <Gavel className="w-3 h-3" /> Primary Blocker
          </div>
          {!assessment.primary_blocker_id ? (
            <div className="text-slate-800 mt-0.5">None identified</div>
          ) : primaryBlockerLoading ? (
            <div className="text-slate-400 mt-0.5">Loading blocker details…</div>
          ) : primaryBlocker ? (
            <div className="mt-0.5 space-y-1">
              <div className="font-semibold text-slate-900">{BLOCKER_TYPE_LABEL[primaryBlocker.blocker_type]}</div>
              <div className="flex items-center gap-1.5">
                <Badge color={BLOCKER_SEVERITY_ACCENT[primaryBlocker.severity]}>{primaryBlocker.severity}</Badge>
              </div>
              {(assessment.owner_role || primaryBlocker.owner_role) && (
                <div className="text-[11px] text-slate-500">{assessment.owner_role || primaryBlocker.owner_role}</div>
              )}
              <div
                className="text-[10px] font-mono text-slate-400 truncate"
                title={assessment.primary_blocker_id}
              >
                {assessment.primary_blocker_id}
              </div>
            </div>
          ) : primaryBlockerFailed ? (
            <div className="mt-0.5">
              <div className="text-slate-500">Blocker details unavailable</div>
              <div className="text-[10px] font-mono text-slate-400 truncate" title={assessment.primary_blocker_id}>
                {assessment.primary_blocker_id}
              </div>
            </div>
          ) : null}
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
          <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
            <UserCheck className="w-3 h-3" /> Action Owner
          </div>
          <div className="text-slate-800 mt-0.5">{assessment.owner_role ?? '—'}</div>
        </div>
      </div>

      {/* Why blocked + what resolving it unlocks — makes the
          BLOCKER -> WHY -> WHO -> ACTION -> UNLOCKS chain explicit instead of
          leaving evidence/downstream-effect fields unrendered. Both come
          from the same primaryBlocker (BlockerWithEvidence) already fetched
          above for the type/severity badge — no extra call. */}
      {primaryBlocker && (primaryBlocker.evidence.length > 0 || primaryBlocker.affects_clock || primaryBlocker.affects_possession || primaryBlocker.affects_project) && (
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-2">
          {primaryBlocker.evidence.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Why (Evidence)</div>
              <ul className="mt-1 space-y-1">
                {primaryBlocker.evidence.slice(0, 3).map((ev) => (
                  <li key={ev.id} className="flex items-start gap-1.5 text-slate-700">
                    <span
                      className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                        ev.relation === 'CONTRADICTS' ? 'bg-red-400' : ev.relation === 'AMBIGUOUS' ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                    <span>{ev.description || ev.evidence_type}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(primaryBlocker.affects_clock || primaryBlocker.affects_possession || primaryBlocker.affects_project) && (
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Unlock className="w-3 h-3" /> Resolving this unlocks
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {primaryBlocker.affects_clock && <Badge color="indigo">Statutory Clock</Badge>}
                {primaryBlocker.affects_possession && <Badge color="teal">Possession</Badge>}
                {primaryBlocker.affects_project && <Badge color="blue">Project Progress</Badge>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommended Action — inlined verbatim from the primary blocker's own
          BlockerAction row by the backend (never a frontend computation). */}
      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
        <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
          Recommended Action <ArrowRight className="w-3 h-3 text-slate-300" />
        </div>
        <div className="text-slate-800 mt-0.5">
          {assessment.recommended_action_type ?? 'No recommended action on record.'}
        </div>
        {assessment.recommended_action_rationale && (
          <div className="text-[11px] text-slate-500 mt-1">{assessment.recommended_action_rationale}</div>
        )}
      </div>

      {/* Statutory clock status, if this case has one linked — CLOCK_UNCERTAIN
          is deliberately never rendered as a red "lapse". */}
      {clockStatus && (
        <div className="text-[11px] flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {clockStatus === 'CLOCK_UNCERTAIN' ? (
            <span className="text-amber-700">
              Statutory clock: <strong>Uncertain</strong> — verification required, not a confirmed lapse.
            </span>
          ) : clockStatus === 'APPARENT_LAPSE' ? (
            <span className="text-red-700">
              Statutory clock: <strong>Apparent Lapse</strong> (unverified — requires legal review).
            </span>
          ) : (
            <span className="text-slate-600">
              Statutory clock: <strong>{formatBandLabel(clockStatus)}</strong>
            </span>
          )}
        </div>
      )}

      {/* GIS downstream honesty — never implies a real corridor computation. */}
      {gisStatus === 'NOT_COMPUTED' && (
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            Downstream corridor impact: <strong>Not computed</strong> — self-parcel only.
          </span>
        </div>
      )}

      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
        Engine {assessment.engine_version} · Calculated {assessment.calculated_at ?? assessment.calculation_date ?? '—'}
      </div>
    </div>
  );
};
