import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  MapPin,
  FileText,
  TrendingUp,
  ShieldCheck,
  ArrowUpRight,
  Bell,
  ChevronRight,
  Scale,
  Gauge
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { useApp } from '../../context/AppContext';
import type { Parcel } from '../../types';
import { useCorridorStats } from '../../hooks/useCorridorStats';
import { RiskLevel } from '../../types';
import { RoleFocusPanel } from './RoleFocusPanel';
import { ProjectPlannerManagement } from './ProjectPlannerManagement';
import { PriorityQueuePanel } from './PriorityQueuePanel';
import { KpiCard, SectionHeading, Badge } from '../ui';

export const DashboardView: React.FC = () => {
  const { 
    parcels, 
    project, 
    alerts, 
    actions, 
    currentUser, 
    setActiveTab, 
    setFilters, 
    openParcelDetail,
    settings
  } = useApp();

  const corridorStats = useCorridorStats();
  const totalParcelsCount = corridorStats.totalParcels;
  const sampleLoadedParcels = corridorStats.sampleParcelsCount;
  const acquiredParcelsCount = corridorStats.acquiredParcels;
  const pendingParcelsCount = corridorStats.activePipelineParcels;

  const displayHighRisk = corridorStats.corridorHighRisk;
  const displayMedRisk = corridorStats.corridorMedRisk;
  const displayLowRisk = corridorStats.corridorLowRisk;
  
  const activeAlerts = alerts.filter(a => a.status === 'Active');
  const pendingActions = actions.filter(a => a.status === 'Pending' || a.status === 'In Progress');

  // ------------------------------------------------------------------
  // Everything below is DERIVED from the parcel records loaded in the app
  // (synthetic/demo data). Project-level totals (parcel counts, risk split)
  // come from the project record and are labelled as such. Nothing here is a
  // hardcoded corridor figure.
  // ------------------------------------------------------------------
  const sampleN = parcels.length;
  const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : '0.0');
  const lowMax = settings.riskThresholdLowMax;
  const medMax = settings.riskThresholdMedMax;

  const STAGE_DEFS: { code: string; title: string; stage: Parcel['stage']; barColor: string }[] = [
    { code: 'Sec 3A', title: 'Preliminary Acquisition Notification', stage: 'Notification (Sec 3A/11)', barColor: 'bg-slate-600' },
    { code: 'Sec 3C', title: 'Hearing of Objections (CALA)', stage: 'SIA & Objection (Sec 3C/15)', barColor: 'bg-slate-700' },
    { code: 'Sec 3D', title: 'Declaration of Acquisition (Gazette Vesting)', stage: 'Declaration (Sec 3D/19)', barColor: 'bg-navy-800' },
    { code: 'Sec 3G', title: 'Award & Valuation Determination', stage: 'Award Inquiry (Sec 3G/23)', barColor: 'bg-amber-600' },
    { code: 'Comp.', title: 'Compensation Disbursement', stage: 'Compensation Disbursement', barColor: 'bg-navy-900' },
    { code: 'Sec 3E', title: 'Physical Possession Delivered', stage: 'Possession (Sec 3E/38)', barColor: 'bg-navy-950' }
  ];
  const stageCounts = STAGE_DEFS.map(d => ({
    ...d,
    count: parcels.filter(p => p.stage === d.stage).length,
    highRisk: parcels.filter(p => p.stage === d.stage && p.riskLevel === 'high').length
  }));
  const maxHighRisk = Math.max(0, ...stageCounts.filter(st => st.code !== 'Sec 3E').map(st => st.highRisk));
  const stageData = stageCounts.map(st => ({
    ...st,
    pct: sampleN > 0 ? +pct(st.count, sampleN) : 0,
    isBottleneck: maxHighRisk > 0 && st.code !== 'Sec 3E' && st.highRisk === maxHighRisk,
    isCompleted: st.code === 'Sec 3E'
  }));
  const bottleneckStage = stageData.find(st => st.isBottleneck) || null;
  const maxStageCount = Math.max(1, ...stageData.map(st => st.count));

  // Risk Distribution (project record split; bands follow the analyst thresholds in Settings)
  const riskPieData = [
    { name: `High Risk (>${medMax}%)`, value: displayHighRisk, color: '#D97706' },
    { name: `Medium Risk (${lowMax + 1}–${medMax}%)`, value: displayMedRisk, color: '#94A3B8' },
    { name: `Low Risk (<=${lowMax}%)`, value: displayLowRisk, color: '#0F172A' },
  ];

  // Bottleneck factors: counted from the loaded parcel records; delay is the mean of those parcels' own predictedDelayMonths.
  const bottleneckDefs: { factor: string; test: (p: Parcel) => boolean }[] = [
    { factor: 'Civil Court Stay / Pending Litigation', test: p => p.courtCase && (p.courtCaseStatus === 'Active - Stay Order' || p.courtCaseStatus === 'Pending Hearing') },
    { factor: 'Unmutated / Disputed Title Records', test: p => p.mutationStatus === 'Disputed' || p.mutationStatus === 'Stale' || p.ownershipDispute !== 'No' },
    { factor: 'Compensation Valuation Dispute', test: p => p.compensationStatus === 'Under Dispute in LA-RA Authority' },
    { factor: 'Missing / Disputed Title Documents', test: p => p.documentStatus === 'Missing Documents' || p.documentStatus === 'Disputed' }
  ];
  const bottleneckData = bottleneckDefs
    .map(d => {
      const hit = parcels.filter(d.test);
      const avg = hit.length ? hit.reduce((acc, p) => acc + p.predictedDelayMonths, 0) / hit.length : 0;
      return { factor: d.factor, count: hit.length, delayAvg: avg, severity: sampleN > 0 && hit.length / sampleN >= 0.25 ? 'High' : 'Medium' };
    })
    .filter(d => d.count > 0)
    .sort((x, y) => y.count - x.count);

  const queueParcels = [...parcels]
    .filter(p => p.interventionStatus !== 'Completed')
    .sort((x, y) => y.delayRiskScore - x.delayRiskScore)
    .slice(0, 5);

  const handleFilterClick = (risk: 'all' | RiskLevel) => {
    setFilters(prev => ({ ...prev, riskLevel: risk }));
    setActiveTab('parcels');
  };

  const handleAcquisitionStatusClick = (status: 'Pending' | 'Acquired' | 'In-Progress') => {
    setFilters(prev => ({ ...prev, acquisitionStatus: status }));
    setActiveTab('parcels');
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Officer Welcome */}
      <div className="rounded-2xl bg-navy-900 p-5 lg:p-6 text-white shadow-sm relative overflow-hidden border border-navy-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-white/10 text-slate-200 border border-white/15 tracking-wide">
                {currentUser.badge}
              </span>
              <span className="text-xs text-slate-400 font-mono">Project: {project.code}</span>
            </div>
            <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">
              Land Acquisition Delay Risk Decision Console
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Active Corridor: <strong className="text-white font-medium">{project.name}</strong> ({project.totalLengthKm} km Right-of-Way).
              The project record lists <strong className="text-amber-300 font-semibold">{displayHighRisk} high-risk parcels</strong>; {sampleN} parcel records are loaded in this demo workspace (synthetic data).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('reports')}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-blue-300" />
              <span>Generate Official Dossier</span>
            </button>
          </div>
        </div>
      </div>

      {/* Role-Specific Focus Section (varies by officer role, shared widgets/data) */}
      <RoleFocusPanel />

      {/* Project Planner Management Console (Rendered ONLY for Project Planner role) */}
      <ProjectPlannerManagement />

      {/* Tiered Executive KPI Section */}
      <div className="space-y-3">
        {/* Tier 1: Hero Metrics (2 Primary Corridor Signals) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <KpiCard
            variant="hero"
            color="amber"
            tinted
            live
            label="High-Risk Parcels (Corridor)"
            badgeText="Attention Required"
            value={displayHighRisk}
            sublabel={totalParcelsCount > 0 ? `${pct(displayHighRisk, totalParcelsCount)}% of project parcels · >${medMax}% delay risk` : `Data unavailable · >${medMax}% delay risk`}
            onClick={() => handleFilterClick('high')}
          />

          <KpiCard
            variant="hero"
            color="blue"
            label="Average Predicted Delay"
            badgeText="Status Quo Baseline"
            value={<>{project.predictedDelayMonths} <span className="text-base font-normal text-slate-500">Months</span></>}
            sublabel="Project record estimate of commissioning delay without intervention"
            onClick={() => setActiveTab('predictive')}
          />
        </div>

        {/* Tier 2: Secondary Executive Strip (6 Secondary Baseline Stats) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <KpiCard
            variant="compact"
            color="neutral"
            label="Total Parcels"
            value={project.totalParcels}
            sublabel={`${project.totalLengthKm} km RoW`}
            onClick={() => { setFilters(prev => ({ ...prev, riskLevel: 'all', acquisitionStatus: 'all' })); setActiveTab('parcels'); }}
          />

          <KpiCard
            variant="compact"
            color="emerald"
            label="Physical Possession"
            value={acquiredParcelsCount}
            sublabel={totalParcelsCount > 0 ? `${pct(acquiredParcelsCount, totalParcelsCount)}% of project parcels` : "Data unavailable"}
            onClick={() => handleAcquisitionStatusClick('Acquired')}
          />

          <KpiCard
            variant="compact"
            color="neutral"
            label="In Pipeline"
            value={pendingParcelsCount}
            sublabel="Sec 3A to 3G Stages"
            onClick={() => handleAcquisitionStatusClick('Pending')}
          />

          <KpiCard
            variant="compact"
            color="amber"
            label="Medium Risk"
            value={displayMedRisk}
            sublabel={`${lowMax + 1}–${medMax}% Delay Risk`}
            onClick={() => handleFilterClick('medium')}
          />

          <KpiCard
            variant="compact"
            color="neutral"
            label="Low Risk (Clear)"
            value={displayLowRisk}
            sublabel={`<=${lowMax}% Delay Risk (incl. acquired)`}
            onClick={() => handleFilterClick('low')}
          />

          <KpiCard
            variant="compact"
            color="red"
            showSeverityBorder
            label="Active Critical Alerts"
            value={activeAlerts.filter(a => a.level === 'CRITICAL').length}
            sublabel={`${activeAlerts.length} active alerts in total`}
            onClick={() => setActiveTab('alerts')}
          />
        </div>
      </div>

      {/* Priority Queue — real Exposure & Priority engine results (Step 8C-B.3/B.4),
          a deterministic rule-based signal, separate from the AI delay prediction above */}
      <PriorityQueuePanel />

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: LARR Statutory Pipeline & Delay Risk Funnel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <SectionHeading
              icon={Scale}
              title="LARR 2013 Statutory Stage Progress & Bottleneck Funnel"
              subtitle={`Loaded parcel records by statutory milestone (${sampleN} of ${totalParcelsCount} project parcels · synthetic data)`}
              action={
                <button
                  onClick={() => setActiveTab('parcels')}
                  className="text-xs text-navy-800 hover:text-navy-950 font-medium flex items-center gap-1 transition-colors"
                >
                  <span>View All Parcels</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              }
            />

            {/* Statutory Overview Metric Strip: project record totals */}
            <div className="grid grid-cols-3 gap-2.5 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs">
              <div>
                <span className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-500 block">Total Corridor RoW</span>
                <span className="text-base font-bold font-mono text-slate-900">{totalParcelsCount} Parcels</span>
                <span className="text-[10.5px] text-slate-500 block">{project.totalLengthKm} km Alignment · project record</span>
              </div>
              <div>
                <span className="text-[10.5px] uppercase tracking-wider font-semibold text-amber-800 block">In Statutory Pipeline</span>
                <span className="text-base font-bold font-mono text-amber-700">{pendingParcelsCount} Parcels</span>
                <span className="text-[10.5px] text-slate-500 block">{pct(pendingParcelsCount, totalParcelsCount)}% of project parcels</span>
              </div>
              <div>
                <span className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-700 block">Possession Delivered</span>
                <span className="text-base font-bold font-mono text-slate-900">{acquiredParcelsCount} Parcels</span>
                <span className="text-[10.5px] text-slate-500 block">{pct(acquiredParcelsCount, totalParcelsCount)}% of project parcels</span>
              </div>
            </div>

            {sampleN === 0 && (
              <p className="text-xs text-slate-500 p-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 mb-3">
                Data unavailable: no parcel records are loaded for this project, so the stage funnel cannot be computed.
              </p>
            )}

            {/* Horizontal Funnel Progress Stages */}
            <div className="space-y-3.5">
              {stageData.map((stage) => (
                <div key={stage.code} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-slate-100 text-slate-800 border border-slate-200 shrink-0">
                        {stage.code}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">{stage.title}</span>
                      {stage.isBottleneck && (
                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                          Critical Bottleneck
                        </span>
                      )}
                      {stage.isCompleted && (
                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                          Handed Over
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 font-mono shrink-0 ml-2">
                      <span className="text-slate-500 text-[11px]">{stage.pct}%</span>
                      <span className="font-bold text-slate-900 text-right w-20">{stage.count} {stage.count === 1 ? "Parcel" : "Parcels"}</span>
                    </div>
                  </div>

                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${stage.barColor}`}
                      style={{ width: `${(stage.count / maxStageCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {bottleneckStage
                  ? `${bottleneckStage.code} holds the most high-risk loaded parcels (${bottleneckStage.highRisk} of ${bottleneckStage.count}).`
                  : 'No high-risk parcels among the loaded records.'}
              </span>
            </span>
            <button 
              onClick={() => { setFilters(prev => ({ ...prev, acquisitionStatus: 'Pending' })); setActiveTab('parcels'); }}
              className="font-medium text-navy-800 hover:underline shrink-0 text-right"
            >
              Filter Pipeline Parcels →
            </button>
          </div>
        </div>

        {/* Right 1 Col: Risk Level Distribution Donut */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <SectionHeading
              icon={Gauge}
              color="ai"
              title="Corridor Risk Level Breakdown"
              subtitle="Proportion of parcels by AI delay probability threshold"
            />

            <div className="relative h-44 w-full flex items-center justify-center my-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  >
                    {riskPieData.map((entry, index) => (
                      <Cell key={`cell-pie-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0A192F', borderRadius: '6px', color: '#fff', fontSize: '11px', border: 'none' }}
                    itemStyle={{ color: '#FFFFFF' }}
                    formatter={(val: any) => [`${val} Parcels`, 'Count']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold font-mono text-slate-900">{project.totalParcels}</span>
                <span className="text-[9.5px] uppercase font-semibold text-slate-500 tracking-wider">Total RoW</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
              <div 
                onClick={() => handleFilterClick('high')}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-amber-50/60 cursor-pointer transition-colors border border-transparent hover:border-amber-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-600 shrink-0"></span>
                  <div>
                    <div className="font-semibold text-slate-900">High Risk (&gt;70%)</div>
                    <div className="text-[10px] text-slate-500">Requires CALA Directives</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-amber-800 font-mono">{displayHighRisk} Parcels</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {totalParcelsCount > 0 ? ((displayHighRisk / totalParcelsCount) * 100).toFixed(1) : '0.0'}%
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleFilterClick('medium')}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 shrink-0"></span>
                  <div>
                    <div className="font-semibold text-slate-900">Medium Risk (40–70%)</div>
                    <div className="text-[10px] text-slate-500">Revenue Mutation Follow-up</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-800 font-mono">{displayMedRisk} Parcels</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {totalParcelsCount > 0 ? ((displayMedRisk / totalParcelsCount) * 100).toFixed(1) : '0.0'}%
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleFilterClick('low')}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs bg-navy-950 shrink-0"></span>
                  <div>
                    <div className="font-semibold text-slate-900">Low Risk (&lt;40%)</div>
                    <div className="text-[10px] text-slate-500">Clear Title / Routine Award</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-800 font-mono">{displayLowRisk} Parcels</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {totalParcelsCount > 0 ? ((displayLowRisk / totalParcelsCount) * 100).toFixed(1) : '0.0'}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Critical High-Priority Queue & Bottleneck Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: High-Risk Priority Action Queue Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <SectionHeading
            icon={AlertTriangle}
            color="amber"
            title="Critical High-Risk Action Queue"
            subtitle="Loaded parcels with open interventions, ranked by delay-risk score"
            action={
              <button
                onClick={() => { setFilters(prev => ({ ...prev, riskLevel: 'high' })); setActiveTab('parcels'); }}
                className="text-xs text-navy-800 hover:text-navy-950 font-medium flex items-center gap-1 transition-colors"
              >
                <span>View All {displayHighRisk} High Risk</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="pb-2.5">Parcel / Survey</th>
                  <th className="pb-2.5">Village / Taluk</th>
                  <th className="pb-2.5">Delay Risk</th>
                  <th className="pb-2.5">Primary Bottleneck</th>
                  <th className="pb-2.5">Intervention Status</th>
                  <th className="pb-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queueParcels.map(parcel => {
                  const hasStayOrder = parcel.courtRecord?.interimInjunction || parcel.courtCaseStatus?.toLowerCase().includes('stay');

                  return (
                    <tr key={parcel.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-2.5">
                        <div className="font-semibold text-slate-900 group-hover:text-navy-900 flex items-center gap-1.5">
                          <span className="font-mono">{parcel.id}</span>
                          <span className="text-[11px] font-normal text-slate-500 font-mono">({parcel.surveyNumber})</span>
                          {hasStayOrder && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                              STAY
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-slate-500 truncate max-w-[140px]">{parcel.ownerName}</div>
                      </td>

                      <td className="py-2.5">
                        <div className="font-medium text-slate-800">{parcel.village}</div>
                        <div className="text-[10px] text-slate-500">{parcel.taluk}</div>
                      </td>

                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5 font-mono">
                          <Badge color={hasStayOrder ? 'red' : parcel.riskLevel === 'high' ? 'amber' : 'neutral'}>
                            {parcel.delayRiskScore}%
                          </Badge>
                          <span className="text-[11px] text-slate-500 font-mono">{parcel.predictedDelayRange}</span>
                        </div>
                      </td>

                      <td className="py-2.5">
                        <div className="text-slate-800 font-medium truncate max-w-[180px]" title={parcel.topRiskFactor}>
                          {parcel.topRiskFactor}
                        </div>
                      </td>

                      <td className="py-2.5">
                        <Badge color={
                          parcel.interventionStatus === 'Completed'
                            ? 'emerald'
                            : parcel.interventionStatus === 'In Progress'
                            ? 'neutral'
                            : parcel.interventionStatus === 'Assigned'
                            ? 'amber'
                            : 'neutral'
                        }>
                          {parcel.interventionStatus}
                        </Badge>
                      </td>

                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => openParcelDetail(parcel.id)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-navy-900 text-slate-700 hover:text-white font-medium rounded text-xs transition-colors border border-slate-200"
                        >
                          Dossier
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {queueParcels.length === 0 && (
              <p className="text-xs text-slate-500 py-4 text-center">No open parcels in the queue: data unavailable or all interventions completed.</p>
            )}
          </div>
        </div>

        {/* Right 1 Col: Major Delay Factors Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <SectionHeading
              icon={AlertOctagon}
              color="amber"
              title="Corridor Delay Bottlenecks"
              subtitle={`Counted from the ${sampleN} loaded parcel records`}
              action={<span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Mean predicted delay</span>}
            />

            {bottleneckData.length === 0 && (
              <p className="text-xs text-slate-500 p-3 rounded-lg border border-dashed border-slate-200">Data unavailable: no bottleneck factors found in the loaded records.</p>
            )}
            <div className="space-y-2.5">
              {bottleneckData.map((item, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-900">{item.factor}</span>
                    <Badge color={item.severity === 'High' ? 'amber' : 'neutral'}>{item.severity}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-xs text-slate-500 font-mono">
                    <span>{item.count} Affected Parcels</span>
                    <span className="font-bold text-slate-800">~{item.delayAvg.toFixed(1)} Mos avg</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => setActiveTab('corridor')}
              className="w-full py-2 bg-navy-900 hover:bg-navy-800 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <span>Explore Corridor Alignment Alternatives</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
