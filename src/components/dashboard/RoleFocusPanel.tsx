import React from 'react';
import {
  Building2,
  ShieldAlert,
  TrendingUp,
  ListChecks,
  Route,
  GitCompareArrows,
  Clock,
  MapPinned,
  ChevronRight,
  LucideIcon
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ROLES } from '../../config/roles';
import { IconTile, AccentColor } from '../ui';

/**
 * Small, role-specific emphasis section rendered on the shared Executive
 * Dashboard. It reuses existing context data (parcels, alerts, actions,
 * alignments, project) — no new mock dataset is introduced — and simply
 * surfaces the subset of information each role cares about most, per
 * src/config/roles.ts `dashboardFocus`.
 */
export const RoleFocusPanel: React.FC = () => {
  const {
    currentUser,
    parcels,
    alerts,
    actions,
    alignments,
    project,
    setActiveTab,
    setFilters
  } = useApp();

  const role = currentUser.role;
  const config = ROLES[role];

  const goToParcels = (riskLevel: 'all' | 'low' | 'medium' | 'high') => {
    setFilters(prev => ({ ...prev, riskLevel }));
    setActiveTab('parcels');
  };

  // --- Shared derived data (reused across role sections) ---
  const highRiskParcels = parcels.filter(p => p.riskLevel === 'high');
  const acquiredCount = parcels.filter(p => p.acquisitionStatus === 'Acquired' || p.possessionStatus === 'Complete').length + 240;
  const acquisitionProgressPct = Math.round((acquiredCount / project.totalParcels) * 100);
  const pendingActions = actions.filter(a => a.status === 'Pending' || a.status === 'In Progress');
  const activeAlerts = alerts.filter(a => a.status === 'Active');
  const criticalAlerts = alerts.filter(a => a.level === 'CRITICAL' && a.status !== 'Resolved');
  const escalatedOrInProgress = alerts.filter(a => a.status === 'Escalated' || a.status === 'In Progress');

  const Card: React.FC<{
    icon: LucideIcon;
    accent: AccentColor;
    label: string;
    onClick?: () => void;
    children: React.ReactNode;
  }> = ({ icon: Icon, accent, label, onClick, children }) => (
    <div
      onClick={onClick}
      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm ${onClick ? 'hover:border-blue-300 hover:shadow-md cursor-pointer transition-all group' : ''}`}
    >
      <div className="flex items-center gap-2">
        <IconTile icon={Icon} color={accent} size="sm" />
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );

  // ---------------------------------------------------------------------
  // District Collector: district/project overview, high-risk cases,
  // alerts/escalations, acquisition progress
  // ---------------------------------------------------------------------
  if (role === 'collector') {
    const topHighRisk = highRiskParcels[0];

    return (
      <section>
        <SectionHeader title={`${config.label} Focus`} subtitle="District oversight, escalations & acquisition progress" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card icon={Building2} accent="blue" label="District & Project Overview">
            <div className="text-sm font-black text-slate-900">{currentUser.district || 'Salem'} District</div>
            <div className="text-[11px] text-slate-500 mt-1">{project.name}</div>
            <div className="text-[11px] font-semibold text-amber-600 mt-1">Status: {project.status}</div>
          </Card>

          <Card icon={ShieldAlert} accent="red" label="High-Risk Cases" onClick={() => goToParcels('high')}>
            <div className="text-xl font-black text-red-600">{highRiskParcels.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {topHighRisk ? `Top: ${topHighRisk.id} (${topHighRisk.village})` : 'No high-risk parcels'}
            </div>
          </Card>

          <Card icon={TrendingUp} accent="amber" label="Alerts & Escalations" onClick={() => setActiveTab('alerts')}>
            <div className="text-xl font-black text-amber-600">{criticalAlerts.length + escalatedOrInProgress.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {criticalAlerts.length} critical &middot; {escalatedOrInProgress.length} escalated/in progress
            </div>
          </Card>

          <Card icon={ListChecks} accent="emerald" label="Acquisition Progress" onClick={() => setActiveTab('parcels')}>
            <div className="text-xl font-black text-emerald-600">{acquisitionProgressPct}%</div>
            <div className="text-[11px] text-slate-500 mt-1">{acquiredCount} of {project.totalParcels} parcels acquired</div>
          </Card>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------
  // CALA / LA Officer: parcel-level risk, acquisition cases,
  // early warnings, action tracker
  // ---------------------------------------------------------------------
  if (role === 'cala') {
    const topRiskParcel = [...parcels].sort((a, b) => b.delayRiskScore - a.delayRiskScore)[0];
    const activeCases = parcels.filter(p => ['Pending', 'In-Progress', 'Contested'].includes(p.acquisitionStatus));
    const nextDueAction = [...pendingActions].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

    return (
      <section>
        <SectionHeader title={`${config.label} Focus`} subtitle="Parcel casework, early warnings & action tracking" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card icon={ShieldAlert} accent="red" label="Parcel-Level Risk" onClick={() => goToParcels('high')}>
            <div className="text-xl font-black text-red-600">{highRiskParcels.length} / {parcels.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {topRiskParcel ? `Highest: ${topRiskParcel.id} (${topRiskParcel.delayRiskScore}%)` : 'No parcels loaded'}
            </div>
          </Card>

          <Card icon={MapPinned} accent="blue" label="Acquisition Cases" onClick={() => setActiveTab('parcels')}>
            <div className="text-xl font-black text-blue-600">{activeCases.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">Pending / In-Progress / Contested</div>
          </Card>

          <Card icon={TrendingUp} accent="amber" label="Early Warnings" onClick={() => setActiveTab('alerts')}>
            <div className="text-xl font-black text-amber-600">{activeAlerts.length}</div>
            <div className="text-[11px] text-slate-500 mt-1 truncate">
              {activeAlerts[0] ? activeAlerts[0].title : 'No active alerts'}
            </div>
          </Card>

          <Card icon={ListChecks} accent="indigo" label="Action Tracker" onClick={() => setActiveTab('actions')}>
            <div className="text-xl font-black text-indigo-600">{pendingActions.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {nextDueAction ? `Next due: ${nextDueAction.dueDate}` : 'Nothing pending'}
            </div>
          </Card>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------
  // Project Planner: corridor analysis, alternative alignment info,
  // predicted acquisition delay, planning/route comparison
  // ---------------------------------------------------------------------
  const recommendedAlignment = alignments.find(a => a.isRecommended) || alignments[0];
  const alternativeAlignment = alignments.find(a => !a.isRecommended) || alignments[1];
  const delaySavingsMonths = alternativeAlignment && recommendedAlignment
    ? +(alternativeAlignment.predictedDelayMonths - recommendedAlignment.predictedDelayMonths).toFixed(1)
    : 0;

  return (
    <section>
      <SectionHeader title={`${config.label} Focus`} subtitle="Corridor design, alignment options & delay forecasting" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={Route} accent="blue" label="Corridor Analysis" onClick={() => setActiveTab('corridor')}>
          <div className="text-xl font-black text-blue-600">{project.corridorSections.length} Sections</div>
          <div className="text-[11px] text-slate-500 mt-1">{project.totalLengthKm} km total corridor length</div>
        </Card>

        <Card icon={GitCompareArrows} accent="indigo" label="Alternative Alignment" onClick={() => setActiveTab('corridor')}>
          <div className="text-sm font-black text-slate-900 truncate">{alternativeAlignment?.name || 'N/A'}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {recommendedAlignment ? `Recommended: ${recommendedAlignment.name}` : 'No alternatives modeled'}
          </div>
        </Card>

        <Card icon={Clock} accent="amber" label="Predicted Acquisition Delay">
          <div className="text-xl font-black text-amber-600">{recommendedAlignment?.predictedDelayMonths ?? project.predictedDelayMonths} Mos</div>
          <div className="text-[11px] text-slate-500 mt-1">
            vs {alternativeAlignment?.predictedDelayMonths ?? '—'} Mos on alternative route
          </div>
        </Card>

        <Card icon={TrendingUp} accent="emerald" label="Route Comparison" onClick={() => setActiveTab('corridor')}>
          <div className="text-xl font-black text-emerald-600">{delaySavingsMonths > 0 ? `${delaySavingsMonths} Mos Saved` : 'Compare Routes'}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span>View full alignment comparison</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </Card>
      </div>
    </section>
  );
};

const SectionHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="mb-3">
    <h2 className="font-bold text-sm text-slate-900">{title}</h2>
    <p className="text-xs text-slate-500">{subtitle}</p>
  </div>
);
