import React from 'react';
import { ChevronRight, ShieldCheck, HelpCircle, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getNavItemsForRole, NavItemDefinition } from '../../config/roles';
import { IconTile, Badge } from '../ui';

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    alerts,
    actions,
    parcels,
    startDemoTour
  } = useApp();

  const activeAlertsCount = alerts.filter(a => a.status === 'Active').length;
  const pendingActionsCount = actions.filter(a => a.status === 'Pending' || a.status === 'In Progress').length;
  const highRiskParcelsCount = parcels.filter(p => p.riskLevel === 'high').length;

  // Navigation items visible to the current role, in the role's priority order,
  // sourced from the centralized role configuration (src/config/roles.ts).
  const navItems = getNavItemsForRole(currentUser.role);

  const getBadgeText = (item: NavItemDefinition): string | null => {
    switch (item.badgeKind) {
      case 'static':
        return item.badgeText || null;
      case 'count-parcels':
        return parcels.length ? `${parcels.length}` : null;
      case 'count-alerts':
        return activeAlertsCount > 0 ? `${activeAlertsCount}` : null;
      case 'count-actions':
        return pendingActionsCount > 0 ? `${pendingActionsCount}` : null;
      default:
        return null;
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 text-slate-700 flex flex-col shrink-0 min-h-[calc(100vh-84px)] select-none">
      {/* Current User Role summary card */}
      <div className="p-3.5 mx-3 mt-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-2.5 text-xs">
          <IconTile icon={ShieldCheck} color="navy" size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Authenticated Session
            </div>
            <div className="font-semibold text-slate-800 text-xs truncate">
              {currentUser.roleTitle}
            </div>
          </div>
        </div>
        <div className="mt-2.5 pt-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>High Risk Parcels</span>
          <Badge color="red">{highRiskParcelsCount}</Badge>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="px-2 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Decision Support Modules
        </div>

        {navItems.map(item => {
          const isActive = activeTab === item.id;
          const badgeText = getBadgeText(item);

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative w-full flex items-center justify-between gap-2 pl-2.5 pr-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors group ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-blue-600" />}

              <div className="flex items-center gap-2.5 min-w-0">
                <IconTile icon={item.icon} color={isActive ? 'blue' : item.color} size="sm" />
                <span className="truncate">{item.label}</span>
              </div>

              {badgeText && (
                <Badge color={isActive ? 'blue' : item.badgeKind === 'count-alerts' ? 'red' : item.badgeKind === 'count-actions' ? 'amber' : item.color}>
                  {badgeText}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Help & Demo Trigger Banner */}
      <div className="p-3.5 border-t border-slate-200 m-3 mt-0 rounded-xl bg-amber-50 border border-amber-200">
        <div className="flex items-center justify-between text-xs text-amber-900 mb-1">
          <span className="font-semibold flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
            Evaluation Flow
          </span>
          <span className="text-[10px] text-amber-700 font-mono font-semibold">20 Steps</span>
        </div>
        <p className="text-[11px] text-amber-800/80 mb-2.5 leading-relaxed">
          Follow the guided demonstration to evaluate the entire AI delay prediction lifecycle.
        </p>
        <button
          onClick={startDemoTour}
          className="w-full py-1.5 bg-white hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg border border-amber-300 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Launch Tour</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
