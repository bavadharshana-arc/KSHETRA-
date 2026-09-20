import React, { useMemo, useState } from 'react';
import {
  Compass,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Layers,
  ChevronRight,
  TrendingUp,
  Construction,
  Navigation
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AlignmentOption } from '../../types';
import { useConstructionReadiness } from '../../hooks/useConstructionReadiness';
import { NOMINAL_ROW_WIDTH_METERS, PROXIMITY_BUFFER_METERS } from '../../data/geo/corridorRelation';
import { SectionHeading, Badge } from '../ui';

export const CorridorAnalysisView: React.FC = () => {
  const { project, alignments, setActiveTab, setFilters, updateProjectRoute } = useApp();
  const readiness = useConstructionReadiness();

  // Alignments are cross-project state (like allParcels) — scope to the
  // active project only, exactly the same discipline already applied to
  // parcels via AppContext.parcels. Un-scoped, a custom project would show
  // (and could "promote") the flagship demo's Alignment A/B/C.
  const projectAlignments = useMemo(
    () => alignments.filter(a => a.projectId === project.id),
    [alignments, project.id]
  );

  const recommendedAlignment = projectAlignments.find(a => a.isRecommended);

  // The alignment currently promoted to the project's real route — derived
  // by comparing the live corridorPath against each option's own
  // pathCoordinates, never a separately-tracked/fabricated flag. If the
  // route has since been hand-edited on the map (or no alignment has ever
  // been promoted), honestly no option matches.
  const activeAlignment = useMemo(
    () =>
      projectAlignments.find(
        a => JSON.stringify(a.pathCoordinates) === JSON.stringify(project.corridorPath)
      ) || null,
    [projectAlignments, project.corridorPath]
  );

  const [selectedAlignmentId, setSelectedAlignmentId] = useState<string>(
    activeAlignment?.id || recommendedAlignment?.id || projectAlignments[0]?.id || ''
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    project.corridorSections[0]?.sectionId || ''
  );

  const selectedAlignment =
    projectAlignments.find(a => a.id === selectedAlignmentId) || activeAlignment || projectAlignments[0];
  const selectedSection = project.corridorSections.find(s => s.sectionId === selectedSectionId) || project.corridorSections[0];

  const handleInspectSectionParcels = () => {
    // Corridor sections don't carry a taluk field, so this filters by the
    // section's own real riskLevel rather than asserting a taluk the data
    // doesn't actually have.
    setFilters(prev => ({ ...prev, riskLevel: selectedSection.riskLevel, taluk: 'all' }));
    setActiveTab('parcels');
  };

  // Promotes the currently selected/compared alignment to the project's real
  // active route. Reuses the existing AppContext.updateProjectRoute (the
  // same call the map's manual route-draft flow already uses via
  // commitRouteDraft) — no new persistence path, no fabricated route data,
  // just this alignment's own already-modeled pathCoordinates.
  const handlePromoteAlignment = (alignment: AlignmentOption) => {
    updateProjectRoute(project.id, alignment.pathCoordinates);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
              Corridor & Alignment Risk Optimization
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              Project Planner Module
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Section-by-section acquisition delay vulnerability analysis and alternative alignment feasibility comparison.
          </p>
        </div>

        <button
          onClick={() => setActiveTab('map')}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Layers className="w-4 h-4" />
          <span>Inspect on GIS Map</span>
        </button>
      </div>

      {/* Construction Readiness — "Acquired" (a LARR statutory status) is not
          the same thing as "construction-ready" (a contractor's workfront can
          actually mobilize here today). Computed from the same real turf.js
          spatial join GisMapView already uses per-parcel
          (src/hooks/useConstructionReadiness.ts), never fabricated — when the
          active project's parcels have no matching real cadastral geometry,
          this renders an honest empty state instead of invented numbers. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <SectionHeading
          icon={Construction}
          color="teal"
          title="Construction Readiness"
          subtitle="Construction-ready vs blocked workfront — distinct from statutory acquisition status"
        />

        {!readiness.available ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
            {readiness.reason}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Corridor</div>
                <div className="text-lg font-black text-slate-900 mt-0.5">{readiness.totalCorridorKm} km</div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="text-[10px] uppercase font-bold text-emerald-700">Construction-Ready</div>
                <div className="text-lg font-black text-emerald-700 mt-0.5">
                  {readiness.readyKm} km <span className="text-xs font-semibold">({readiness.readyPct}%)</span>
                </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div className="text-[10px] uppercase font-bold text-amber-800">Partially Ready</div>
                <div className="text-lg font-black text-amber-800 mt-0.5">{readiness.partialKm} km</div>
              </div>
              <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                <div className="text-[10px] uppercase font-bold text-red-700">Blocked Workfront</div>
                <div className="text-lg font-black text-red-700 mt-0.5">
                  {readiness.blockedKm} km <span className="text-xs font-semibold">({readiness.blockedPct}%)</span>
                </div>
              </div>
            </div>

            {/* Proportional stacked bar */}
            <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100">
              {readiness.readyKm > 0 && (
                <div className="bg-emerald-500 h-full" style={{ width: `${(readiness.readyKm / readiness.totalCorridorKm) * 100}%` }} />
              )}
              {readiness.partialKm > 0 && (
                <div className="bg-amber-500 h-full" style={{ width: `${(readiness.partialKm / readiness.totalCorridorKm) * 100}%` }} />
              )}
              {readiness.blockedKm > 0 && (
                <div className="bg-red-500 h-full" style={{ width: `${(readiness.blockedKm / readiness.totalCorridorKm) * 100}%` }} />
              )}
              {readiness.unsurveyedKm > 0 && (
                <div className="bg-slate-300 h-full" style={{ width: `${(readiness.unsurveyedKm / readiness.totalCorridorKm) * 100}%` }} />
              )}
            </div>
            {readiness.unsurveyedKm > 0 && (
              <div className="text-[10.5px] text-slate-400">
                {readiness.unsurveyedKm} km of corridor has no overlapping surveyed parcel footprint — shown grey: not assessed, not counted as ready or blocked.
              </div>
            )}

            {readiness.blockedSegments.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Major Blockers Preventing Construction</div>
                <div className="space-y-1.5">
                  {readiness.blockedSegments.map((seg) => (
                    <div key={seg.parcelId} className="flex items-center justify-between text-xs p-2 bg-red-50/60 rounded-lg border border-red-100">
                      <span className="text-slate-700">
                                                Parcel <span className="font-mono">{seg.parcelId}</span> overlaps the ROW <span className="text-slate-400">({seg.lengthKm} km of corridor)</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Badge color="red">Blocked</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-[10.5px] text-slate-400 pt-1">
                            Parcels whose footprint overlaps the nominal {NOMINAL_ROW_WIDTH_METERS} m ROW (planning assumption, not a legal boundary):{' '}
              {readiness.affectedParcels.ready} ready / {readiness.affectedParcels.partial} partial / {readiness.affectedParcels.blocked} blocked.{' '}
              {readiness.proximityParcels} parcel(s) sit within {PROXIMITY_BUFFER_METERS} m but outside the ROW (potential proximity only, no length attributed);{' '}
              {readiness.outsideParcels} are farther away. Downstream workfront impact is not computed.
            </div>
          </div>
        )}
      </div>

      {/* Corridor Section Breakdown Cards */}
      <div>
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Corridor Route Vulnerability by Section (Chainage Km 0 to {project.totalLengthKm})
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {project.corridorSections.map(sec => {
            const isSelected = selectedSectionId === sec.sectionId;
            const isHigh = sec.riskLevel === 'high';
            const isMed = sec.riskLevel === 'medium';

            return (
              <div
                key={sec.sectionId}
                onClick={() => setSelectedSectionId(sec.sectionId)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-navy-900 text-white border-blue-500 shadow-xl ring-2 ring-blue-500/20'
                    : 'bg-white text-slate-900 border-slate-200 hover:border-blue-300 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                      {sec.chainageKm}
                    </span>
                    <h3 className="font-bold text-sm mt-0.5">{sec.name}</h3>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    isHigh ? 'bg-red-500/20 text-red-400 border border-red-500/40' : isMed ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  }`}>
                    {sec.riskScore}% RISK
                  </span>
                </div>

                <p className={`text-xs mt-2.5 line-clamp-2 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                  {sec.description}
                </p>

                <div className={`mt-4 pt-3 border-t flex items-center justify-between text-xs ${isSelected ? 'border-navy-700/60' : 'border-slate-100'}`}>
                  <span className={isSelected ? 'text-slate-400' : 'text-slate-500'}>
                    Bottlenecks: <strong>{sec.bottleneckCount} Parcels</strong>
                  </span>
                  <span className={`font-semibold flex items-center gap-0.5 ${isSelected ? 'text-blue-300' : 'text-blue-600'}`}>
                    <span>Inspect</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Section Drilldown & Action */}
      <div className="p-5 bg-navy-900 text-white rounded-2xl border border-navy-800 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] text-blue-300 uppercase font-bold tracking-wider">Active Section Assessment</div>
            <h3 className="text-lg font-black text-white">{selectedSection.name} ({selectedSection.chainageKm})</h3>
          </div>

          <button
            onClick={handleInspectSectionParcels}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
          >
            View {selectedSection.riskLevel.toUpperCase()}-Risk Parcels in This Section
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {selectedSection.description}
          {recommendedAlignment && (
            <>
              {' '}Recommended alignment: <strong>{recommendedAlignment.name}</strong> — {recommendedAlignment.recommendationReason}
            </>
          )}
        </p>
      </div>

      {/* Alternative Alignment Comparison Matrix */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Alternative Alignment Tradeoff Matrix (Alignment A vs B vs C)
            </h3>
            <p className="text-xs text-slate-500">
              Quantitative comparison of delay schedule, capital expenditure, and litigation friction
            </p>
          </div>

          {recommendedAlignment && (
            <span className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Recommended: {recommendedAlignment.name}
            </span>
          )}
        </div>

        {/* Selected vs Active comparison — requirement: show which alignment
            is being inspected, which one is the project's real active route,
            and how they differ on friction / construction impact. */}
        {selectedAlignment && (
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Navigation className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Comparing to Active Route</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50">
                <div className="text-[10px] uppercase font-bold text-blue-700">Selected: {selectedAlignment.name}</div>
                <div className="grid grid-cols-2 gap-2 mt-2 font-mono">
                  <div>Length: <strong>{selectedAlignment.lengthKm} km</strong></div>
                  <div>Cost: <strong>₹{selectedAlignment.estimatedCostCrores.toLocaleString()} Cr</strong></div>
                  <div>High-Risk: <strong>{selectedAlignment.highRiskParcels}</strong></div>
                  <div>Friction: <strong>{selectedAlignment.litigationFrictionScore}/100</strong></div>
                </div>
              </div>

              <div className={`p-3 rounded-xl border ${activeAlignment ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                <div className={`text-[10px] uppercase font-bold ${activeAlignment ? 'text-emerald-700' : 'text-slate-500'}`}>
                  Currently Active: {activeAlignment ? activeAlignment.name : 'No listed alignment (custom / manually edited route)'}
                </div>
                {activeAlignment && (
                  <div className="grid grid-cols-2 gap-2 mt-2 font-mono">
                    <div>Length: <strong>{activeAlignment.lengthKm} km</strong></div>
                    <div>Cost: <strong>₹{activeAlignment.estimatedCostCrores.toLocaleString()} Cr</strong></div>
                    <div>High-Risk: <strong>{activeAlignment.highRiskParcels}</strong></div>
                    <div>Friction: <strong>{activeAlignment.litigationFrictionScore}/100</strong></div>
                  </div>
                )}
              </div>
            </div>

            {activeAlignment && activeAlignment.id !== selectedAlignment.id && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  Δ Delay: <strong className={selectedAlignment.predictedDelayMonths < activeAlignment.predictedDelayMonths ? 'text-emerald-600' : 'text-amber-700'}>
                    {(selectedAlignment.predictedDelayMonths - activeAlignment.predictedDelayMonths).toFixed(1)} Mos
                  </strong>
                </span>
                <span>
                  Δ High-Risk Parcels: <strong className={selectedAlignment.highRiskParcels < activeAlignment.highRiskParcels ? 'text-emerald-600' : 'text-amber-700'}>
                    {selectedAlignment.highRiskParcels - activeAlignment.highRiskParcels}
                  </strong>
                </span>
                <span>
                  Δ Cost: <strong className={selectedAlignment.estimatedCostCrores <= activeAlignment.estimatedCostCrores ? 'text-emerald-600' : 'text-amber-700'}>
                    ₹{(selectedAlignment.estimatedCostCrores - activeAlignment.estimatedCostCrores).toLocaleString()} Cr
                  </strong>
                </span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {projectAlignments.map(align => {
            const isSelected = selectedAlignmentId === align.id;
            const isRec = align.isRecommended;
            const isActive = activeAlignment?.id === align.id;

            return (
              <div
                key={align.id}
                onClick={() => setSelectedAlignmentId(align.id)}
                className={`rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-navy-900 text-white border-blue-500 shadow-xl ring-2 ring-blue-500/20'
                    : isActive
                    ? 'bg-teal-50/60 text-slate-900 border-teal-300 shadow-sm'
                    : isRec
                    ? 'bg-emerald-50/50 text-slate-900 border-emerald-300 shadow-sm'
                    : 'bg-white text-slate-900 border-slate-200 shadow-sm hover:border-slate-300'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">{align.code}</span>
                      <h4 className="font-extrabold text-sm mt-0.5">{align.name}</h4>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isActive && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-teal-600 text-white uppercase tracking-wider flex items-center gap-1">
                          <Navigation className="w-3 h-3" /> Active Route
                        </span>
                      )}
                      {isRec && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-white uppercase tracking-wider">
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className={`grid grid-cols-2 gap-2 p-3 rounded-xl text-xs ${isSelected ? 'bg-navy-800/60' : 'bg-slate-50'}`}>
                    <div>
                      <div className="text-[10px] text-slate-400">Total Length</div>
                      <div className="font-bold text-sm mt-0.5">{align.lengthKm} km</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400">Est. Cost</div>
                      <div className="font-bold text-sm mt-0.5">₹{align.estimatedCostCrores.toLocaleString()} Cr</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400">High-Risk Parcels</div>
                      <div className={`font-bold text-sm mt-0.5 ${align.highRiskParcels > 10 ? (isSelected ? 'text-red-300' : 'text-red-600') : (isSelected ? 'text-emerald-300' : 'text-emerald-600')}`}>
                        {align.highRiskParcels} Parcels
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400">Predicted Delay</div>
                      <div className={`font-bold text-sm mt-0.5 ${align.predictedDelayMonths > 2 ? (isSelected ? 'text-amber-300' : 'text-amber-700') : (isSelected ? 'text-emerald-300' : 'text-emerald-600')}`}>
                        {align.predictedDelayMonths} Months
                      </div>
                    </div>
                  </div>

                  <p className={`text-xs leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>
                    {align.recommendationReason}
                  </p>

                  {/* Pros & Cons */}
                  <div className="space-y-1.5 text-xs pt-2">
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-400">Key Advantages:</div>
                    {align.pros.slice(0, 2).map((p, idx) => (
                      <div key={idx} className={`flex items-center gap-1.5 text-[11px] ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`}>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className={isSelected ? 'text-slate-200' : 'text-slate-700'}>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`mt-4 pt-3 border-t flex items-center justify-between gap-2 text-xs ${isSelected ? 'border-navy-700/60' : 'border-slate-100'}`}>
                  <span className="font-bold text-[11px]">Friction: {align.litigationFrictionScore}/100</span>
                  {isActive ? (
                    <span className="font-semibold text-[11px] text-teal-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Currently Active
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromoteAlignment(align);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-white text-navy-900 hover:bg-slate-100'
                          : 'bg-blue-600 text-white hover:bg-blue-500'
                      }`}
                    >
                      Set as Active Alignment
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
