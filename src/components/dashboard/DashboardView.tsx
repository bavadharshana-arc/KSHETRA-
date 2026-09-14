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
  Sparkles,
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
import { RiskLevel } from '../../types';
import { RoleFocusPanel } from './RoleFocusPanel';
import { ProjectPlannerManagement } from './ProjectPlannerManagement';
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
    startDemoTour
  } = useApp();

  // Calculate dynamic metrics
  const totalParcelsCount = project.totalParcels;
  const sampleLoadedParcels = parcels.length;
  const acquiredParcelsCount = project.id === 'proj-nh79x' 
    ? parcels.filter(p => p.acquisitionStatus === 'Acquired' || p.possessionStatus === 'Complete').length + 240
    : (project.acquiredParcels || Math.round(project.totalParcels * 0.28));
  const pendingParcelsCount = totalParcelsCount - acquiredParcelsCount;
  
  const highRiskCount = parcels.filter(p => p.riskLevel === 'high').length;
  const medRiskCount = parcels.filter(p => p.riskLevel === 'medium').length;
  const lowRiskCount = parcels.filter(p => p.riskLevel === 'low').length;

  const displayHighRisk = project.id === 'proj-nh79x' ? 28 : (highRiskCount || project.highRiskParcels || 2);
  const displayMedRisk = project.id === 'proj-nh79x' ? 46 : (medRiskCount || project.medRiskParcels || 2);
  const displayLowRisk = project.id === 'proj-nh79x' ? 306 : (lowRiskCount || project.lowRiskParcels || Math.max(0, totalParcelsCount - displayHighRisk - displayMedRisk));
  
  const activeAlerts = alerts.filter(a => a.status === 'Active');
  const pendingActions = actions.filter(a => a.status === 'Pending' || a.status === 'In Progress');

  // Chart data: Stage breakdown
  const stageData = [
    { name: 'Sec 3A (Notification)', count: 42, color: '#3B82F6' },
    { name: 'Sec 3C (Objections)', count: 28, color: '#6366F1' },
    { name: 'Sec 3D (Declaration)', count: 35, color: '#8B5CF6' },
    { name: 'Sec 3G (Award)', count: 24, color: '#F59E0B' },
    { name: 'Sec 3E (Possession)', count: 242, color: '#10B981' },
  ];

  // Chart data: Risk distribution
  const riskPieData = [
    { name: 'High Risk (🔴 >70%)', value: displayHighRisk, color: '#EF4444' },
    { name: 'Medium Risk (🟡 40-70%)', value: displayMedRisk, color: '#F59E0B' },
    { name: 'Low Risk (🟢 <40%)', value: displayLowRisk, color: '#10B981' },
  ];

  // Bottleneck factors
  const bottleneckData = [
    { factor: 'Civil Court Stay Orders', count: 14, severity: 'High', delayAvg: '4.2 Mos' },
    { factor: 'Unmutated Joint Heir Claims', count: 22, severity: 'High', delayAvg: '3.6 Mos' },
    { factor: 'Compensation Valuation Dispute', count: 18, severity: 'Medium', delayAvg: '2.4 Mos' },
    { factor: 'Missing Parent Title Documents', count: 9, severity: 'Medium', delayAvg: '1.8 Mos' },
  ];

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
      <div className="rounded-2xl bg-navy-900 p-5 lg:p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="absolute inset-0 gis-grid opacity-[0.04] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 tracking-wide">
                {currentUser.badge}
              </span>
              <span className="text-xs text-slate-400 font-mono">Project Code: {project.code}</span>
            </div>
            <h1 className="text-xl lg:text-2xl font-black tracking-tight text-white">
              Land Acquisition Delay Risk Decision Console
            </h1>
            <p className="text-xs text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
              Monitoring <strong className="text-white font-semibold">{project.name}</strong> (Total {project.totalLengthKm} km Corridor).
              AI Early Warning model has flagged <strong className="text-red-300 font-semibold">{displayHighRisk} high-risk parcels</strong> facing civil litigation and joint mutation bottlenecks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={startDemoTour}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>20-Step Demo Tour</span>
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className="px-3.5 py-2 bg-white/8 hover:bg-white/15 border border-white/15 text-slate-100 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <FileText className="w-4 h-4 text-blue-300" />
              <span>Generate Official Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Role-Specific Focus Section (varies by officer role, shared widgets/data) */}
      <RoleFocusPanel />

      {/* Project Planner Management Console (Rendered ONLY for Project Planner role) */}
      <ProjectPlannerManagement />

      {/* 8 Interactive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard
          icon={MapPin}
          color="blue"
          label="Total Parcels"
          value={project.totalParcels}
          sublabel={`${project.totalLengthKm} km RoW`}
          onClick={() => { setFilters(prev => ({ ...prev, riskLevel: 'all', acquisitionStatus: 'all' })); setActiveTab('parcels'); }}
        />

        <KpiCard
          icon={CheckCircle2}
          color="emerald"
          label="Acquired"
          value={acquiredParcelsCount}
          sublabel={`${((acquiredParcelsCount / totalParcelsCount) * 100).toFixed(0)}% completed`}
          onClick={() => handleAcquisitionStatusClick('Acquired')}
        />

        <KpiCard
          icon={Clock}
          color="amber"
          label="Pending"
          value={pendingParcelsCount}
          sublabel="In acquisition pipeline"
          onClick={() => handleAcquisitionStatusClick('Pending')}
        />

        <KpiCard
          icon={AlertTriangle}
          color="red"
          label="High Risk"
          value={displayHighRisk}
          sublabel="＞70% delay probability"
          onClick={() => handleFilterClick('high')}
          tinted
          live
        />

        <KpiCard
          icon={AlertCircle}
          color="amber"
          label="Med Risk"
          value={displayMedRisk}
          sublabel="40–70% delay risk"
          onClick={() => handleFilterClick('medium')}
        />

        <KpiCard
          icon={ShieldCheck}
          color="emerald"
          label="Low Risk"
          value={displayLowRisk}
          sublabel="＜40% risk (clear)"
          onClick={() => handleFilterClick('low')}
        />

        <KpiCard
          icon={TrendingUp}
          color="blue"
          label="Avg Delay"
          value={<>{project.predictedDelayMonths} <span className="text-xs font-semibold text-slate-500">Mos</span></>}
          sublabel="Without intervention"
          onClick={() => setActiveTab('predictive')}
        />

        <KpiCard
          icon={Bell}
          color="red"
          label="Alerts"
          value={activeAlerts.length}
          sublabel="Require CALA action"
          onClick={() => setActiveTab('alerts')}
          tinted
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: LARR Statutory Pipeline & Delay Risk */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <SectionHeading
            icon={Scale}
            color="blue"
            title="LARR 2013 Statutory Stage Progress & Bottleneck Funnel"
            subtitle="Number of land parcels currently residing in each statutory acquisition milestone"
            className="mb-4"
            action={
              <button
                onClick={() => setActiveTab('parcels')}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <span>View All Parcels</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEEF4" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: '#667085' }}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 11, fill: '#667085' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0B1F3A', borderRadius: '8px', color: '#fff', fontSize: '12px', border: 'none' }}
                  itemStyle={{ color: '#FFFFFF' }}
                  formatter={(val: any) => [`${val} Parcels`, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right 1 Col: Risk Level Distribution Pie */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <SectionHeading
            icon={Gauge}
            color="indigo"
            title="Corridor Risk Level Breakdown"
            subtitle="Proportion of parcels by AI delay probability threshold"
          />

          <div className="h-52 w-full flex items-center justify-center my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {riskPieData.map((entry, index) => (
                    <Cell key={`cell-pie-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0B1F3A', borderRadius: '8px', color: '#fff', fontSize: '12px', border: 'none' }}
                  itemStyle={{ color: '#FFFFFF' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs">
            <div 
              onClick={() => handleFilterClick('high')}
              className="flex items-center justify-between p-1.5 rounded-lg hover:bg-red-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span className="font-medium text-slate-700">High Risk (🔴)</span>
              </div>
              <span className="font-bold text-red-600">28 (7.4%)</span>
            </div>

            <div 
              onClick={() => handleFilterClick('medium')}
              className="flex items-center justify-between p-1.5 rounded-lg hover:bg-amber-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="font-medium text-slate-700">Medium Risk (🟡)</span>
              </div>
              <span className="font-bold text-amber-600">46 (12.1%)</span>
            </div>

            <div 
              onClick={() => handleFilterClick('low')}
              className="flex items-center justify-between p-1.5 rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="font-medium text-slate-700">Low Risk (🟢)</span>
              </div>
              <span className="font-bold text-emerald-600">306 (80.5%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Critical High-Priority Queue & Bottleneck Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: High-Risk Priority Action Queue Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <SectionHeading
            icon={AlertTriangle}
            color="red"
            title="Critical High-Risk Action Queue"
            subtitle="Parcels requiring urgent legal or administrative intervention before award deadline"
            className="mb-4"
            action={
              <button
                onClick={() => { setFilters(prev => ({ ...prev, riskLevel: 'high' })); setActiveTab('parcels'); }}
                className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
              >
                <span>View All High Risk</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="pb-2.5">Parcel / Survey</th>
                  <th className="pb-2.5">Village / Taluk</th>
                  <th className="pb-2.5">Delay Risk</th>
                  <th className="pb-2.5">Primary Bottleneck</th>
                  <th className="pb-2.5">Intervention Status</th>
                  <th className="pb-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parcels.slice(0, 4).map(parcel => {
                  return (
                    <tr key={parcel.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-3">
                        <div className="font-bold text-slate-900 group-hover:text-blue-600 flex items-center gap-1.5">
                          <span>{parcel.id}</span>
                          <span className="text-[11px] font-normal text-slate-500 font-mono">({parcel.surveyNumber})</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{parcel.ownerName}</div>
                      </td>

                      <td className="py-3">
                        <div className="font-medium text-slate-700">{parcel.village}</div>
                        <div className="text-[10px] text-slate-400">{parcel.taluk}</div>
                      </td>

                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge color={parcel.riskLevel === 'high' ? 'red' : parcel.riskLevel === 'medium' ? 'amber' : 'emerald'}>
                            {parcel.delayRiskScore}%
                          </Badge>
                          <span className="text-[11px] text-slate-500">{parcel.predictedDelayRange}</span>
                        </div>
                      </td>

                      <td className="py-3">
                        <div className="text-slate-700 font-medium truncate max-w-[180px]" title={parcel.topRiskFactor}>
                          {parcel.topRiskFactor}
                        </div>
                      </td>

                      <td className="py-3">
                        <Badge color={
                          parcel.interventionStatus === 'Completed'
                            ? 'emerald'
                            : parcel.interventionStatus === 'In Progress'
                            ? 'blue'
                            : parcel.interventionStatus === 'Assigned'
                            ? 'amber'
                            : 'neutral'
                        }>
                          {parcel.interventionStatus}
                        </Badge>
                      </td>

                      <td className="py-3 text-right">
                        <button
                          onClick={() => openParcelDetail(parcel.id)}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white font-semibold rounded text-xs transition-colors"
                        >
                          Deep Dive
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Major Delay Factors Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <SectionHeading
            icon={AlertOctagon}
            color="amber"
            title="Corridor Delay Bottlenecks"
            subtitle="Recurring factors driving predicted delay"
            className="mb-4"
            action={<span className="text-[10px] text-slate-400 uppercase font-mono">Impact Weight</span>}
          />

          <div className="space-y-3">
            {bottleneckData.map((item, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-800">{item.factor}</span>
                  <Badge color={item.severity === 'High' ? 'red' : 'amber'}>{item.severity}</Badge>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                  <span>{item.count} Affected Parcels</span>
                  <span className="font-bold text-slate-700 font-mono">+{item.delayAvg} Delay</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => setActiveTab('corridor')}
              className="w-full py-2 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
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
