import React from 'react';
import type { Parcel, CaseAction } from '../../types';
import type { StatutoryClockResult } from '../../types/legal';
import type { ExposureAssessmentWithContext } from '../../types/exposure';
import type { ConstructionReadinessResult } from '../../hooks/useConstructionReadiness';
import { describeConstructionImpact } from '../../data/geo/corridorRelation';

type Tone = 'ok' | 'warn' | 'bad' | 'none';

interface Step {
  label: string;
  value: string;
  tone: Tone;
}

const TONE: Record<Tone, string> = {
  ok: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
  warn: 'border-amber-200 bg-amber-50/60 text-amber-900',
  bad: 'border-rose-200 bg-rose-50/60 text-rose-900',
  none: 'border-slate-200 bg-slate-50 text-slate-600'
};

interface CaseStoryStripProps {
  parcel: Parcel;
  clocks: StatutoryClockResult[] | null;
  exposure: ExposureAssessmentWithContext | null;
  actions: CaseAction[];
  readiness: ConstructionReadinessResult;
}

/**
 * One-line case narrative for a parcel:
 * identity -> acquisition stage -> statutory clock -> risk -> blocker -> owner
 * -> action -> construction impact -> field verification -> resolution.
 * Every value is read from state already loaded for this dossier; where a
 * source has nothing, the step says so instead of guessing.
 */
export const CaseStoryStrip: React.FC<CaseStoryStripProps> = ({ parcel, clocks, exposure, actions, readiness }) => {
  const lapsed = clocks?.some(c => c.clock_status === 'APPARENT_LAPSE') ?? false;
  const uncertain = clocks?.some(c => c.clock_status !== 'CLOCK_CERTAIN') ?? false;
  const minDays = clocks
    ?.map(c => c.days_remaining)
    .filter((d): d is number => typeof d === 'number')
    .sort((a, b) => a - b)[0];

  const openAction = actions.find(a => a.status !== 'Completed');
  const doneAction = actions.find(a => a.status === 'Completed');

  // Same spatial truth as the GIS view: direct impact only when the parcel overlaps the ROW.
  const impact = describeConstructionImpact(readiness.available ? readiness.relations[parcel.id] : undefined, parcel.riskLevel);
  const construction: Step = {
    label: 'Construction impact',
    value: impact.tone === 'unavailable' ? 'Cannot be established' : impact.tone === 'none' ? 'No direct impact' : impact.tone === 'proximity' ? 'Proximity only' : impact.impact,
    tone: impact.tone === 'blocked' ? 'bad' : impact.tone === 'partial' || impact.tone === 'proximity' ? 'warn' : impact.tone === 'ready' ? 'ok' : 'none'
  };

  const resolved = parcel.interventionStatus === 'Completed' || parcel.acquisitionStatus === 'Possession Taken' || parcel.acquisitionStatus === 'Acquired';

  const steps: Step[] = [
    { label: 'Identity', value: `${parcel.id} · Sy. ${parcel.surveyNumber}`, tone: 'none' },
    { label: 'Acquisition stage', value: `${parcel.acquisitionStatus} · ${parcel.stage}`, tone: parcel.acquisitionStatus === 'Contested' ? 'bad' : 'none' },
    {
      label: 'Statutory clock',
      value: clocks === null ? 'Unavailable' : clocks.length === 0 ? 'No clock computed' : lapsed ? 'Apparent lapse' : minDays !== undefined ? `${minDays} days remaining${uncertain ? ' (uncertain)' : ''}` : 'Basis insufficient',
      tone: clocks === null || clocks.length === 0 ? 'none' : lapsed ? 'bad' : uncertain ? 'warn' : 'ok'
    },
    { label: 'Risk', value: `${parcel.delayRiskScore}% · ${parcel.riskLevel.toUpperCase()}`, tone: parcel.riskLevel === 'high' ? 'bad' : parcel.riskLevel === 'medium' ? 'warn' : 'ok' },
    {
      label: 'Blocker',
      value: exposure?.primary_blocker_id ? `Primary: ${exposure.primary_blocker_id}` : parcel.topRiskFactor || 'None on record',
      tone: exposure?.primary_blocker_id ? 'bad' : 'none'
    },
    { label: 'Owner', value: openAction?.assignedOfficer || parcel.assignedOfficer || 'Unassigned', tone: openAction?.assignedOfficer || parcel.assignedOfficer ? 'ok' : 'warn' },
    { label: 'Action', value: openAction ? `${openAction.status}: ${openAction.title}` : doneAction ? 'Completed' : 'No action yet', tone: openAction ? 'warn' : doneAction ? 'ok' : 'none' },
    construction,
    { label: 'Field verification', value: parcel.fieldVerified ? `Verified${parcel.fieldVerifiedAt ? ` ${parcel.fieldVerifiedAt}` : ''}` : 'Not verified', tone: parcel.fieldVerified ? 'ok' : 'warn' },
    { label: 'Resolution', value: resolved ? 'Resolved / acquired' : 'Open', tone: resolved ? 'ok' : 'none' }
  ];

  return (
    <section aria-label="Case story" className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Case story</div>
      <ol className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {steps.map((st, i) => (
          <li key={st.label} className={`rounded-lg border p-2 text-[11px] leading-snug ${TONE[st.tone]}`}>
            <div className="text-[9.5px] uppercase tracking-wider font-semibold opacity-70">{i + 1}. {st.label}</div>
            <div className="font-semibold break-words line-clamp-2" title={st.value}>{st.value}</div>
          </li>
        ))}
      </ol>
    </section>
  );
};
