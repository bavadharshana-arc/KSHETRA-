import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Alert, CaseAction } from '../types';

export interface CorridorStats {
  // Total corridor scope
  totalParcels: number;
  acquiredParcels: number;
  acquiredPercentage: number;
  activePipelineParcels: number;

  // Corridor-wide risk breakdown
  corridorHighRisk: number;
  corridorMedRisk: number;
  corridorLowRisk: number;
  pipelineLowRisk: number;

  // Sample records loaded in memory
  sampleParcelsCount: number;

  // Real-time critical alerts and pending actions
  criticalAlertsCount: number;
  activeAlertsCount: number;
  pendingActionsCount: number;
  completedActionsCount: number;

  // Status & error handling
  isLoading: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncError: { operation: string; message: string; timestamp: string } | null;
  clearSyncError: () => void;
}

/**
 * Single source of truth for corridor-wide and sample statistics.
 * Guarantees that DashboardView, ParcelsView, CorridorAnalysisView,
 * and Reports render identical, non-conflicting metrics.
 */
export const useCorridorStats = (): CorridorStats => {
  const {
    project,
    parcels,
    alerts,
    actions,
    syncStatus,
    syncError,
    clearSyncError
  } = useApp();

  return useMemo(() => {
    const totalParcels = project?.totalParcels ?? 0;
    const acquiredParcels = project?.acquiredParcels ?? 0;
    const activePipelineParcels = Math.max(0, totalParcels - acquiredParcels);
    const acquiredPercentage = totalParcels > 0 ? Math.round((acquiredParcels / totalParcels) * 100) : 0;

    const corridorHighRisk = project?.highRiskParcels ?? 0;
    const corridorMedRisk = project?.medRiskParcels ?? 0;
    const pipelineLowRisk = project?.lowRiskParcels ?? 0;
    // Corridor low-risk includes all acquired parcels (zero remaining risk) plus the low-risk pipeline parcels: 242 + 64 = 306
    const corridorLowRisk = acquiredParcels + pipelineLowRisk;

    const sampleParcelsCount = parcels?.length ?? 0;

    const activeAlerts = alerts.filter((a: Alert) => a.status !== 'Resolved');
    const criticalAlerts = activeAlerts.filter((a: Alert) => a.level === 'CRITICAL');
    const criticalAlertsCount = criticalAlerts.length;
    const activeAlertsCount = activeAlerts.length;

    const pendingActions = actions.filter((a: CaseAction) => a.status !== 'Completed');
    const pendingActionsCount = pendingActions.length;
    const completedActionsCount = actions.length - pendingActionsCount;

    return {
      totalParcels,
      acquiredParcels,
      acquiredPercentage,
      activePipelineParcels,
      corridorHighRisk,
      corridorMedRisk,
      corridorLowRisk,
      pipelineLowRisk,
      sampleParcelsCount,
      criticalAlertsCount,
      activeAlertsCount,
      pendingActionsCount,
      completedActionsCount,
      isLoading: syncStatus === 'syncing',
      syncStatus,
      syncError,
      clearSyncError
    };
  }, [project, parcels, alerts, actions, syncStatus, syncError, clearSyncError]);
};
