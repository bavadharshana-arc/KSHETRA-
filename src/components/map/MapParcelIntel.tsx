import React, { useEffect, useState } from 'react';
import type { Parcel } from '../../types';
import type { Blocker } from '../../types/blockers';
import type { StatutoryClockResult } from '../../types/legal';
import { getParcelBlockers } from '../../services/blockersService';
import { getParcelClocks } from '../../services/legalService';

const TYPE_LABEL: Record<string, string> = {
  B1: 'Statutory clock exposure',
  B2: 'Title & record friction',
  B3: 'Contested compensation / R&R',
  B4: 'Possession-blocking encumbrance'
};

const Line: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="p-2.5">
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
    <div className="font-semibold text-slate-900 leading-snug">{value}</div>
  </div>
);

/** Blocker, owner, statutory clock and recommended action for the parcel selected on the map. */
export const MapParcelIntel: React.FC<{ parcel: Parcel }> = ({ parcel }) => {
  const [blockers, setBlockers] = useState<Blocker[] | null | 'error'>(null);
  const [clocks, setClocks] = useState<StatutoryClockResult[] | null | 'error'>(null);

  useEffect(() => {
    let cancelled = false;
    setBlockers(null);
    setClocks(null);
    getParcelBlockers(parcel.id).then(r => { if (!cancelled) setBlockers(r); }).catch(() => { if (!cancelled) setBlockers('error'); });
    getParcelClocks(parcel.id).then(r => { if (!cancelled) setClocks(r); }).catch(() => { if (!cancelled) setClocks('error'); });
    return () => { cancelled = true; };
  }, [parcel.id]);

  const primary = Array.isArray(blockers) ? blockers.find(b => b.is_primary) || blockers[0] : undefined;
  const blockerText =
    blockers === null ? 'Loading…'
    : blockers === 'error' ? 'Data unavailable'
    : primary ? `${primary.blocker_type} · ${TYPE_LABEL[primary.blocker_type] ?? ''} · ${primary.severity}`
    : parcel.topRiskFactor || 'None recorded';

  let clockText = 'Loading…';
  if (clocks === 'error') clockText = 'Data unavailable';
  else if (Array.isArray(clocks)) {
    if (clocks.length === 0) clockText = 'No clock computed';
    else if (clocks.some(c => c.clock_status === 'APPARENT_LAPSE')) clockText = 'Apparent lapse';
    else {
      const days = clocks.map(c => c.days_remaining).filter((d): d is number => typeof d === 'number').sort((a, b) => a - b)[0];
      clockText = days !== undefined ? `${days} days remaining` : 'Basis insufficient';
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 text-xs divide-y divide-slate-100">
      <Line label="Blocker" value={blockerText} />
      {primary?.owner_role && <Line label="Owner" value={primary.owner_role} />}
      <Line label="Statutory clock" value={clockText} />
      <Line label="Recommended action" value={parcel.recommendedAction || 'None recorded'} />
    </div>
  );
};
