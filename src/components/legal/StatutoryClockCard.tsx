import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Badge, AccentColor } from '../ui';
import type { ClockStatus, StatutoryClockResult } from '../../types/legal';

/**
 * KSHETRA — Statutory Clock display (frontend-completion gap close).
 *
 * `legalService.ts` (GET /api/legal/clocks, real backend, read-only) and
 * `types/legal.ts` already mirror the backend's StatutoryClockRead schema
 * field-for-field, but no component ever rendered a `StatutoryClockResult`
 * before this — this is the first UI consumer. Purely presentational: the
 * caller (ParcelDetailModal) owns the fetch via legalService, exactly the
 * pattern ExposurePriorityCard already uses for the Exposure & Priority
 * engine. No legal calculation happens here — every date/day-count/status is
 * rendered verbatim from the backend's own computed clock.
 */

const CLOCK_STATUS_ACCENT: Record<ClockStatus, AccentColor> = {
  INSUFFICIENT_BASIS: 'neutral',
  CLOCK_CERTAIN: 'emerald',
  CLOCK_UNCERTAIN: 'amber',
  EXTENSION_UNVERIFIED: 'amber',
  APPARENT_LAPSE: 'red',
  LEGACY_1894: 'neutral',
};

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

interface StatutoryClockCardProps {
  clocks: StatutoryClockResult[] | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const StatutoryClockCard: React.FC<StatutoryClockCardProps> = ({
  clocks,
  loading = false,
  error = null,
  onRetry,
}) => {
  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
        Loading statutory clock…
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

  if (!clocks || clocks.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
        No statutory clock has been computed for this case yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {clocks.map((clock) => {
        const overdue = clock.days_remaining != null && clock.days_remaining < 0;
        return (
          <div key={clock.id} className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <Badge color={CLOCK_STATUS_ACCENT[clock.clock_status]}>{formatLabel(clock.clock_status)}</Badge>
              <span className="text-[11px] font-mono text-slate-500">
                {clock.applicable_act} &middot; {clock.section_reference}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[9.5px] uppercase font-bold text-slate-400">Milestone</div>
                <div className="font-semibold text-slate-900 mt-0.5">{clock.statutory_period}</div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[9.5px] uppercase font-bold text-slate-400">Deadline</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {clock.adjusted_deadline ?? clock.computed_deadline ?? '—'}
                </div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[9.5px] uppercase font-bold text-slate-400">Days Remaining</div>
                <div className={`font-bold mt-0.5 ${overdue ? 'text-red-600' : 'text-slate-900'}`}>
                  {clock.days_remaining != null ? clock.days_remaining : '—'}
                </div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[9.5px] uppercase font-bold text-slate-400">Days Elapsed</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {clock.days_elapsed != null ? clock.days_elapsed : '—'}
                </div>
              </div>
            </div>

            {/* clock_status is an evidentiary/computational state, consequence_class is
                what it means for a human reader — the backend keeps these deliberately
                separate so a high-severity clock_status never silently reads as a
                certified legal conclusion. Never merged into one badge. */}
            {clock.clock_status === 'CLOCK_UNCERTAIN' && (
              <div className="text-[11px] text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Uncertain — verification required, not a confirmed deadline.</span>
              </div>
            )}
            {clock.clock_status === 'APPARENT_LAPSE' && (
              <div className="text-[11px] text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Apparent lapse — unverified, requires legal review before treating as an expired clock.</span>
              </div>
            )}
            {clock.consequence_class && (
              <div className="text-[11px] text-slate-500">
                Consequence: <strong className="text-slate-700">{formatLabel(clock.consequence_class)}</strong>
              </div>
            )}

            <div className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-100">
              Rule set {clock.rule_set_id} v{clock.rule_set_version} &middot; Calculated {clock.calculated_at}
            </div>
          </div>
        );
      })}
    </div>
  );
};
