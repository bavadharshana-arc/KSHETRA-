import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getNavItemsForRole, NavItemDefinition } from '../../config/roles';
import { IconTile, Badge } from '../ui';

interface SidebarProps {
  className?: string;
  onItemClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ className = '', onItemClick }) => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    alerts,
    actions,
    parcels,
    project
  } = useApp();

  const corridorHighRiskCount = project.highRiskParcels ?? 0;
  const activeCriticalAlertsCount = alerts.filter(a => a.status === 'Active' && a.level === 'CRITICAL').length;
  const pendingActionsCount = actions.filter(a => a.status === 'Pending' || a.status === 'In Progress').length;

  // Navigation items visible to the current role, in the role's priority order,
  // sourced from the centralized role configuration (src/config/roles.ts).
  const navItems = getNavItemsForRole(currentUser.role);

  const getBadgeText = (item: NavItemDefinition): string | null => {
    switch (item.badgeKind) {
      case 'static':
        return item.badgeText || null;
      case 'count-parcels':
        return `${parcels.length} dossiers`;
      case 'count-alerts':
        return activeCriticalAlertsCount > 0 ? `${activeCriticalAlertsCount}` : null;
      case 'count-actions':
        return pendingActionsCount > 0 ? `${pendingActionsCount}` : null;
      default:
        return null;
    }
  };

  return (
    <aside className={`w-64 bg-white border-r border-slate-200 text-slate-700 flex flex-col shrink-0 min-h-[calc(100vh-84px)] select-none ${className}`}>
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
          <span>High-Risk Parcels (Corridor)</span>
          <Badge color="amber" className="font-mono font-bold">{corridorHighRiskCount}</Badge>
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
          const isAiModule = item.id === 'predictive';

          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                onItemClick?.();
              }}
              className={`relative w-full flex items-center justify-between gap-2 pl-2.5 pr-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors group ${
                isActive
                  ? 'bg-blue-50 text-blue-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-blue-700" />}

              <div className="flex items-center gap-2.5 min-w-0">
                <IconTile 
                  icon={item.icon} 
                  color={isActive ? 'blue' : isAiModule ? 'ai' : item.color} 
                  size="sm" 
                />
                <span className="truncate">{item.label}</span>
              </div>

              {badgeText && (
                <Badge color={
                  isActive 
                    ? 'blue' 
                    : item.badgeKind === 'count-alerts' 
                    ? 'red' 
                    : item.badgeKind === 'count-actions' 
                    ? 'amber' 
                    : isAiModule 
                    ? 'ai' 
                    : 'neutral'
                }>
                  {badgeText}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>

    </aside>
  );
};
