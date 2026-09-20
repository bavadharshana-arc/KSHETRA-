import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Parcel, Project } from '../../types';
import type { ConstructionReadinessResult } from '../../hooks/useConstructionReadiness';
import { listBlockers } from '../../services/blockersService';
import type { BlockerType } from '../../types/blockers';

const BLOCKER_TYPES: BlockerType[] = ['B1', 'B2', 'B3', 'B4'];

interface Props {
  project: Project;
  parcels: Parcel[];
  readiness: ConstructionReadinessResult;
  /** How many loaded parcels have demo geometry. */
  geometryCount: number;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-2 py-0.5">
    <span className="text-slate-500">{label}</span>
    <span className="font-mono text-slate-900 text-right">{children}</span>
  </div>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">{children}</div>
);

/**
 * Compact project-wide assessment for the map. Every figure is derived from
 * existing state (loaded parcels, the readiness hook, the blocker engine);
 * anything that cannot be derived reads "Data unavailable".
 */
export const ProjectAssessmentPanel: React.FC<Props> = ({ project, parcels, readiness, geometryCount }) => {
  const [open, setOpen] = useState(true);
  const [blockerCounts, setBlockerCounts] = useState<Record<BlockerType, number> | null>(null);
  const [blockersFailed, setBlockersFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBlockerCounts(null);
    setBlockersFailed(false);
    listBlockers({ projectId: project.id })
      .then(list => {
        if (cancelled) return;
        const counts: Record<BlockerType, number> = { B1: 0, B2: 0, B3: 0, B4: 0 };
        for (const b of list) counts[b.blocker_type] += 1;
        setBlockerCounts(counts);
      })
      .catch(() => { if (!cancelled) setBlockersFailed(true); });
    return () => { cancelled = true; };
  }, [project.id]);

  const high = parcels.filter(p => p.riskLevel === 'high').length;
  const med = parcels.filter(p => p.riskLevel === 'medium').length;
  const low = parcels.filter(p => p.riskLevel === 'low').length;
  const direct = readiness.affectedParcels.ready + readiness.affectedParcels.partial + readiness.affectedParcels.blocked;
  const noGeometry = parcels.length - geometryCount;

  return (
    <section aria-label="Project assessment" className="absolute top-3 left-3 z-10 w-60 bg-white/93 text-slate-700 rounded-md border border-slate-300 shadow-sm text-[11px]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-50/80 border-b border-slate-100 font-bold text-[10.5px] uppercase tracking-wider text-slate-600"
      >
        <span>Project assessment</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
      {open && (
        <div className="p-2.5 space-y-2">
          <div>
            <Heading>Land exposure</Heading>
            <Row label="Loaded parcels">{parcels.length}</Row>
            <Row label="High / Med / Low">
              <span className="text-red-700">{high}</span> / <span className="text-amber-700">{med}</span> / <span className="text-green-700">{low}</span>
            </Row>
            {project.totalParcels > parcels.length && (
              <div className="text-[10px] text-slate-400">Project record lists {project.totalParcels}; only loaded parcels are assessed.</div>
            )}
          </div>

          <div>
            <Heading>Construction readiness</Heading>
            {readiness.available ? (
              <>
                <Row label="Ready">{readiness.readyKm} km</Row>
                <Row label="Partial">{readiness.partialKm} km</Row>
                <Row label="Blocked">{readiness.blockedKm} km</Row>
                <div className="text-[10px] text-slate-400">of {readiness.totalCorridorKm} km corridor; {readiness.unsurveyedKm} km not assessed</div>
              </>
            ) : (
              <div className="text-slate-500">Data unavailable</div>
            )}
          </div>

          <div>
            <Heading>Spatial impact</Heading>
            {readiness.available ? (
              <>
                <Row label="Direct (overlap ROW)">{direct}</Row>
                <Row label="Proximity only">{readiness.proximityParcels}</Row>
                <Row label="No direct impact">{readiness.outsideParcels}</Row>
                {noGeometry > 0 && <Row label="No geometry">{noGeometry}</Row>}
              </>
            ) : (
              <div className="text-slate-500">Data unavailable</div>
            )}
          </div>

          <div>
            <Heading>Blockers</Heading>
            {blockersFailed ? (
              <div className="text-slate-500">Data unavailable</div>
            ) : blockerCounts === null ? (
              <div className="text-slate-400">Loading…</div>
            ) : (
              <div className="grid grid-cols-4 gap-1 text-center font-mono">
                {BLOCKER_TYPES.map(t => (
                  <div key={t} className="rounded border border-slate-200 py-0.5">
                    <div className="text-[9px] text-slate-500">{t}</div>
                    <div className="font-bold text-slate-900">{blockerCounts[t]}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-500 leading-snug">
            Demo data: {geometryCount} of {parcels.length} parcels have synthetic geometry.
          </div>
        </div>
      )}
    </section>
  );
};
