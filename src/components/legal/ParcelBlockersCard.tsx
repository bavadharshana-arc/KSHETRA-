import React, { useEffect, useState } from 'react';
import { ShieldAlert, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { AccentColor } from '../ui/colors';
import { getBlocker, getParcelBlockers } from '../../services/blockersService';
import type { Blocker, BlockerSeverity, BlockerType, BlockerWithEvidence } from '../../types/blockers';

/** Labels copied from backend/blockers/enums.py (same source as ExposurePriorityCard). */
const BLOCKER_TYPE_LABEL: Record<BlockerType, string> = {
  B1: 'Statutory Clock Exposure',
  B2: 'Title & Record Friction',
  B3: 'Contested Compensation / R&R',
  B4: 'Possession-Blocking Encumbrance'
};

const SEVERITY_ACCENT: Record<BlockerSeverity, AccentColor> = {
  CRITICAL: 'red',
  HIGH: 'amber',
  MODERATE: 'amber',
  WATCH: 'neutral',
  INFORMATIONAL: 'neutral'
};

const fmt = (s: string) => s.replace(/_/g, ' ');

interface ParcelBlockersCardProps {
  parcelId: string;
  /** Hide the outer heading (when the parent already provides one). */
  compact?: boolean;
}

/**
 * B1–B4 blockers for one parcel, read from GET /api/parcels/{id}/blockers.
 * Expanding a row loads GET /api/blockers/{id} for evidence + recommended
 * actions (WHY → EVIDENCE → OWNER → ACTION). Read-only; nothing is invented —
 * an empty list means the engine has no persisted blocker for this parcel.
 */
export const ParcelBlockersCard: React.FC<ParcelBlockersCardProps> = ({ parcelId, compact = false }) => {
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, BlockerWithEvidence | 'loading' | 'error'>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOpenId(null);
    getParcelBlockers(parcelId)
      .then(r => { if (!cancelled) setBlockers(r); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setBlockers(null);
        setError(e instanceof Error ? e.message : 'Could not reach the KSHETRA blocker engine.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [parcelId, retry]);

  const toggle = (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (detail[id] && detail[id] !== 'error') return;
    setDetail(d => ({ ...d, [id]: 'loading' }));
    getBlocker(id)
      .then(r => setDetail(d => ({ ...d, [id]: r })))
      .catch(() => setDetail(d => ({ ...d, [id]: 'error' })));
  };

  return (
    <section aria-label="Blockers" className="space-y-2">
      {!compact && (
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          Blockers (B1–B4)
        </h4>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500" role="status">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Loading blockers…
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-center justify-between gap-2">
          <span>Blocker data unavailable: {error}</span>
          <button type="button" onClick={() => setRetry(n => n + 1)} className="font-semibold underline">Retry</button>
        </div>
      )}

      {!loading && !error && blockers && blockers.length === 0 && (
        <p className="text-xs text-slate-500 p-2.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/60">
          The blocker engine has not recorded any blocker for this parcel.
        </p>
      )}

      {!loading && !error && blockers && blockers.length > 0 && (
        <ul className="space-y-2">
          {blockers.map(b => {
            const open = openId === b.id;
            const d = detail[b.id];
            return (
              <li key={b.id} className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggle(b.id)}
                  aria-expanded={open}
                  className="w-full p-2.5 flex items-start justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-slate-900">{b.blocker_type}</span>
                      <span className="text-xs font-semibold text-slate-800">{BLOCKER_TYPE_LABEL[b.blocker_type]}</span>
                      {b.is_primary && <Badge color="blue">Primary</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                      <Badge color={SEVERITY_ACCENT[b.severity]}>{b.severity}</Badge>
                      <Badge color="neutral">{fmt(b.status)}</Badge>
                      <span>Owner: <strong className="text-slate-800">{b.owner_role || '—'}</strong></span>
                    </div>
                  </div>
                  {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />}
                </button>

                {open && (
                  <div className="px-2.5 pb-2.5 space-y-2 text-[11px] text-slate-700 border-t border-slate-100 pt-2">
                    <div>Responsible authority: <strong>{b.responsible_authority || '—'}</strong></div>
                    <div className="flex flex-wrap gap-1.5">
                      {b.affects_clock && <Badge color="amber">Affects statutory clock</Badge>}
                      {b.affects_possession && <Badge color="amber">Affects possession</Badge>}
                      {b.affects_project && <Badge color="amber">Affects project</Badge>}
                    </div>
                    {b.notes && <p className="text-slate-600">{b.notes}</p>}
                    {b.resolution_status && (
                      <p className="text-emerald-800">Resolution: {fmt(b.resolution_status)}{b.resolution_notes ? ` — ${b.resolution_notes}` : ''}</p>
                    )}

                    {d === 'loading' && <div className="text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />Loading evidence…</div>}
                    {d === 'error' && <div className="text-amber-800">Evidence could not be loaded. Collapse and expand to retry.</div>}
                    {d && d !== 'loading' && d !== 'error' && (
                      <>
                        <div>
                          <div className="font-semibold text-slate-900 mb-1">Evidence ({d.evidence.length})</div>
                          {d.evidence.length === 0 ? (
                            <p className="text-slate-500">No evidence rows attached.</p>
                          ) : (
                            <ul className="space-y-1">
                              {d.evidence.map(ev => (
                                <li key={ev.id} className="p-2 rounded bg-slate-50 border border-slate-100">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge color={ev.relation === 'CONTRADICTS' ? 'red' : ev.relation === 'AMBIGUOUS' ? 'amber' : 'emerald'}>{ev.relation}</Badge>
                                    <span className="font-medium">{fmt(ev.evidence_type)}</span>
                                    <span className="text-slate-500">· {ev.source_type ? fmt(ev.source_type) : fmt(ev.source_ref_type)} · {fmt(ev.verification_status)}</span>
                                  </div>
                                  <p className="mt-0.5 text-slate-600">{ev.description}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 mb-1">Recommended actions ({d.actions.length})</div>
                          {d.actions.length === 0 ? (
                            <p className="text-slate-500">No recommended action recorded.</p>
                          ) : (
                            <ul className="space-y-1">
                              {d.actions.map(a => (
                                <li key={a.id} className="p-2 rounded bg-slate-50 border border-slate-100">
                                  <div className="font-medium">{fmt(a.action_type)} <span className="text-slate-500 font-normal">· {a.owner_role} · {fmt(a.priority)} · {fmt(a.status)}</span></div>
                                  {a.rationale && <p className="text-slate-600 mt-0.5">{a.rationale}</p>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
