import React, { useState } from 'react';
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
  TrendingUp
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AlignmentOption } from '../../types';

export const CorridorAnalysisView: React.FC = () => {
  const { project, alignments, setActiveTab, setFilters } = useApp();

  const [selectedAlignmentId, setSelectedAlignmentId] = useState<string>('align-b');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('sec-2');

  const selectedAlignment = alignments.find(a => a.id === selectedAlignmentId) || alignments[1];
  const selectedSection = project.corridorSections.find(s => s.sectionId === selectedSectionId) || project.corridorSections[1];

  const handleInspectSectionParcels = () => {
    setFilters(prev => ({ ...prev, taluk: 'Omalur', riskLevel: 'all' }));
    setActiveTab('parcels');
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

      {/* Corridor Section Breakdown Cards */}
      <div>
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Corridor Route Vulnerability by Section (Chainage Km 0 to 68.4)
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
            Filter All Section 2 Parcels (Omalur)
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {selectedSection.description} AI models recommend evaluating <strong>Alignment B (Agro Bypass)</strong> to circumvent the 19 disputed parcels in this stretch.
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

          <span className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            AI Recommended: Alignment B
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {alignments.map(align => {
            const isSelected = selectedAlignmentId === align.id;
            const isRec = align.isRecommended;

            return (
              <div
                key={align.id}
                onClick={() => setSelectedAlignmentId(align.id)}
                className={`rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-navy-900 text-white border-blue-500 shadow-xl ring-2 ring-blue-500/20'
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

                    {isRec && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-white uppercase tracking-wider">
                        RECOMMENDED
                      </span>
                    )}
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

                <div className={`mt-4 pt-3 border-t flex items-center justify-between text-xs ${isSelected ? 'border-navy-700/60' : 'border-slate-100'}`}>
                  <span className="font-bold text-[11px]">Litigation Friction Score: {align.litigationFrictionScore}/100</span>
                  <span className={`font-semibold ${isSelected ? 'text-blue-300' : 'text-blue-600'}`}>{isSelected ? 'Active Selection' : 'Select'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
