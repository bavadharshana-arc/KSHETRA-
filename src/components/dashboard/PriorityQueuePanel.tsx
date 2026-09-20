import React, { useCallback, useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SectionHeading } from '../ui';
import { ExposurePriorityCard } from '../exposure/ExposurePriorityCard';
import { getPriorityQueue } from '../../services/exposureService';
import type { ExposureAssessmentWithContext } from '../../types/exposure';

/**
 * KSHETRA — Priority Queue (Step 8C-B.4).
 *
 * Reads GET /api/exposure/priority-queue (via exposureService.ts, never a
 * direct `fetch`) for the currently active project, and renders the real,
 * already-computed Exposure & Priority results from Step 8C-B.3 — no mock
 * data, no client-side scoring, no fabricated fallback.
 *
 * KNOWN LIMITATION (Step 8C-B.3): `blockers.db_crud`/`exposure.db_crud`
 * hardcode `case_reference` to the parcel's project id, so a project
 * -scoped priority-queue query currently collapses to the single most
 * -recently-computed case for that project rather than a true ranked list
 * across all of its parcels. This is a backend engine property (unmodified
 * in this step, per the standing instruction not to touch
 * backend/blockers/** or backend/exposure/**) — the panel below shows
 * whatever the API honestly returns and says so, rather than presenting it
 * as a complete project-wide ranking.
 */
export const PriorityQueuePanel: React.FC = () => {
  const { project } = useApp();
  const [items, setItems] = useState<ExposureAssessmentWithContext[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getPriorityQueue({ projectId: project.id })
      .then((result) => setItems(result))
      .catch((err: unknown) => {
        setItems(null);
        setError(
          err instanceof Error
            ? err.message
            : 'Could not reach the KSHETRA exposure & priority service.'
        );
      })
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <SectionHeading
        icon={ListChecks}
        color="indigo"
        title="Priority Queue"
        subtitle="Exposure & Priority engine — deterministic, evidence-based case ranking"
        className="mb-3"
      />

      <div className="mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
        Ranked by the deterministic Exposure &amp; Priority engine — statutory-clock, blocker and
        possession evidence, a different signal from the AI delay prediction above. Project-wide
        ranking is currently limited by demo case linkage (Step 8C-B.3); see a parcel's own
        dossier for its individual Exposure &amp; Priority assessment.
      </div>

      {loading && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
          Loading priority queue…
        </div>
      )}

      {!loading && error && (
        <ExposurePriorityCard assessment={null} error={error} onRetry={load} />
      )}

      {!loading && !error && items && items.length === 0 && (
        <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
          No cases currently ranked.
        </div>
      )}

      {!loading && !error && items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <ExposurePriorityCard key={item.id} assessment={item} compact />
          ))}
        </div>
      )}
    </div>
  );
};
