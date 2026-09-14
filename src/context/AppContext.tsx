import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User, 
  UserRole, 
  Parcel, 
  Project, 
  Alert, 
  CaseAction, 
  AlignmentOption, 
  AuditLog, 
  SystemSettings, 
  NotificationItem,
  RiskLevel,
  RouteEditState,
  ProjectPrediction
} from '../types';
import { 
  INITIAL_USERS, 
  INITIAL_PROJECT, 
  INITIAL_PARCELS, 
  INITIAL_ALERTS, 
  INITIAL_ACTIONS, 
  INITIAL_ALIGNMENTS, 
  INITIAL_AUDIT_LOGS, 
  INITIAL_SETTINGS, 
  INITIAL_NOTIFICATIONS,
  generateSyntheticParcelsForProject
} from '../data/mockData';
import { fetchRealAiPrediction, fetchProjectAiPrediction } from '../services/mlApiService';
import { simulateGovernmentSync, SyncLogStep } from '../services/apiSimulation';
import { ROLES, isTabAllowedForRole } from '../config/roles';
import { isValidDemoLogin } from '../config/authCredentials';
// STEP 4 (persistence plan): typed FastAPI client — see src/services/apiClient.ts.
// AppContext is the ONLY place that imports this; components keep talking to
// AppContext exactly as before (see the Step 4 report's "orchestration layer" note).
import * as apiClient from '../services/apiClient';

export interface FilterState {
  riskLevel: 'all' | RiskLevel;
  acquisitionStatus: 'all' | 'Pending' | 'Acquired' | 'In-Progress' | 'Contested' | 'Possession Taken';
  courtCase: 'all' | 'yes' | 'no';
  compensationStatus: 'all' | 'Pending' | 'Determined' | 'Disbursed 40%' | 'Under Dispute in LA-RA Authority' | 'Disbursed 100%';
  documentStatus: 'all' | 'Verified' | 'Pending Verification' | 'Disputed' | 'Missing Documents';
  taluk: 'all' | string;
  village: 'all' | string;
  sortBy: 'riskScoreDesc' | 'riskScoreAsc' | 'surveyNo' | 'areaDesc' | 'delayMonthsDesc';
}

export const INITIAL_FILTERS: FilterState = {
  riskLevel: 'all',
  acquisitionStatus: 'all',
  courtCase: 'all',
  compensationStatus: 'all',
  documentStatus: 'all',
  taluk: 'all',
  village: 'all',
  sortBy: 'riskScoreDesc'
};

interface AppContextType {
  currentUser: User;
  users: User[];
  switchUser: (role: UserRole) => void;
  loginWithCredentials: (email: string, password: string, role: UserRole) => boolean;
  logout: () => void;
  isLoggedIn: boolean;
  
  // Navigation & Views
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // Data
  parcels: Parcel[];
  allParcels: Parcel[];
  filteredParcels: Parcel[];
  selectedParcel: Parcel | null;
  setSelectedParcel: (parcel: Parcel | null) => void;
  openParcelDetail: (parcelId: string) => void;
  
  project: Project;
  projects: Project[];
  selectedProjectId: string;
  createProject: (projectData: Omit<Project, 'id'>, customParcels?: Parcel[]) => Project;
  selectProject: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
  updateProjectRoute: (projectId: string, newRoute: [number, number][]) => void;
  
  // Interactive Route Editing on Map
  routeEditState: RouteEditState | null;
  startRouteDraft: (
    draft: Partial<Project>,
    initialCoords: [number, number][],
    isNew?: boolean,
    step?: 'select-start' | 'select-end' | 'edit-route',
    startCoords?: [number, number],
    endCoords?: [number, number]
  ) => void;
  setDraftStartCoords: (coords: [number, number]) => void;
  setDraftEndCoords: (coords: [number, number]) => void;
  setRouteEditStep: (step: 'select-start' | 'select-end' | 'edit-route') => void;
  updateDraftRoute: (coords: [number, number][], opts?: { recordHistory?: boolean }) => void;
  cancelRouteDraft: () => void;
  commitRouteDraft: () => void;
  // Undo / redo for the proposed alignment geometry (routeCoords) during map editing.
  undoAlignment: () => void;
  redoAlignment: () => void;
  canUndoAlignment: boolean;
  canRedoAlignment: boolean;

  alerts: Alert[];
  actions: CaseAction[];
  alignments: AlignmentOption[];
  auditLogs: AuditLog[];
  notifications: NotificationItem[];
  unreadNotifsCount: number;
  settings: SystemSettings;
  updateSettings: (newSettings: Partial<SystemSettings>) => void;
  
  // Search & Filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  resetFilters: () => void;
  
  // Operations & Workflows
  // PRIMARY, project/case-level AI prediction (matches how the model was trained).
  runProjectDelayPrediction: () => Promise<ProjectPrediction>;
  projectPrediction: ProjectPrediction | null;
  isProjectPredicting: boolean;
  projectPredictionError: string | null;
  // Indicative per-parcel drill-down only (not the official prediction).
  runDelayPrediction: (parcelId: string, options?: { preserveOnFailure?: boolean }) => Promise<Parcel>;
  syncGovernmentDataForParcel: (parcelId: string) => Promise<void>;
  isSyncing: boolean;
  syncProgressLogs: SyncLogStep[];

  // STEP 5B: centralized API synchronization status/error. Distinct from the
  // simulated government-sync progress above (isSyncing/syncProgressLogs) --
  // this reflects the last apiClient-backed read/mutation routed through the
  // centralized runSyncedMutation helper, so an API failure is explicit
  // state instead of only a console.error.
  syncStatus: 'idle' | 'syncing' | 'error';
  syncError: { operation: string; message: string; timestamp: string } | null;
  clearSyncError: () => void;

  createNewAction: (actionData: Omit<CaseAction, 'id' | 'createdAt'>) => void;
  updateActionStatus: (actionId: string, status: CaseAction['status'], notes?: string) => void;
  
  resolveAlert: (alertId: string, resolutionNotes?: string) => void;
  assignAlert: (alertId: string, officerName: string) => void;
  
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  
  // Guided Demo Tour
  demoTourActive: boolean;
  demoTourStep: number;
  startDemoTour: () => void;
  nextDemoTourStep: () => void;
  prevDemoTourStep: () => void;
  endDemoTour: () => void;
  
  // Reset all to sample defaults
  resetAllData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Local storage keys
  const STORAGE_KEY_USER = 'bhu_drishti_user';
  // Bumped to _v2: the seed parcel records (mockData.ts) were corrected so every
  // parcel carries its own canonical court / revenue / GIS record. Older cached
  // copies could hold records overwritten by the previous (parcel-agnostic)
  // "gov sync", so they are discarded once and re-seeded from INITIAL_PARCELS.
  const STORAGE_KEY_PARCELS = 'bhu_drishti_parcels_v2';
  const STORAGE_KEY_PROJECTS = 'bhu_drishti_projects';
  const STORAGE_KEY_SELECTED_PROJECT_ID = 'bhu_drishti_selected_project_id';
  const STORAGE_KEY_ALERTS = 'bhu_drishti_alerts';
  const STORAGE_KEY_ACTIONS = 'bhu_drishti_actions';
  const STORAGE_KEY_LOGS = 'bhu_drishti_logs';
  const STORAGE_KEY_SESSION = 'bhu_drishti_session_active';

  const [users] = useState<User[]>(INITIAL_USERS);
  
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_USER);
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fallback */ }
    }
    return INITIAL_USERS[1]; // default to CALA
  });

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_SESSION) === 'true';
  });
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* fallback */ }
    }
    return [INITIAL_PROJECT];
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SELECTED_PROJECT_ID);
    return saved || INITIAL_PROJECT.id;
  });

  const [allParcels, setAllParcels] = useState<Parcel[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PARCELS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(p => p.projectId ? p : { ...p, projectId: INITIAL_PROJECT.id });
        }
      } catch { /* fallback */ }
    }
    return INITIAL_PARCELS.map(p => ({ ...p, projectId: INITIAL_PROJECT.id }));
  });

  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [routeEditState, setRouteEditState] = useState<RouteEditState | null>(null);

  // Active Project Determination:
  // For planner: uses selectedProjectId.
  // For collector & cala: uses INITIAL_PROJECT.id so their workflow remains 100% untouched.
  const project: Project = React.useMemo(() => {
    if (currentUser.role === 'planner') {
      return projects.find(p => p.id === selectedProjectId) || projects[0] || INITIAL_PROJECT;
    }
    return projects.find(p => p.id === INITIAL_PROJECT.id) || projects[0] || INITIAL_PROJECT;
  }, [currentUser.role, projects, selectedProjectId]);

  // Active Parcels isolated strictly to the active project
  const parcels: Parcel[] = React.useMemo(() => {
    const matched = allParcels.filter(p => p.projectId === project.id);
    if (matched.length === 0 && project.id === INITIAL_PROJECT.id) {
      return allParcels.filter(p => !p.projectId || p.projectId === INITIAL_PROJECT.id);
    }
    return matched;
  }, [allParcels, project.id]);

  const [alerts, setAlerts] = useState<Alert[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ALERTS);
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fallback */ }
    }
    return INITIAL_ALERTS;
  });

  const [actions, setActions] = useState<CaseAction[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIONS);
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fallback */ }
    }
    return INITIAL_ACTIONS;
  });

  const STORAGE_KEY_ALIGNMENTS = 'bhu_drishti_alignments';
  const [alignments, setAlignments] = useState<AlignmentOption[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ALIGNMENTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* fallback */ }
    }
    return INITIAL_ALIGNMENTS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LOGS);
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fallback */ }
    }
    return INITIAL_AUDIT_LOGS;
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  // Sync State (simulated government sync progress, unchanged from before)
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgressLogs, setSyncProgressLogs] = useState<SyncLogStep[]>([]);

  // STEP 5B: CENTRALIZED API SYNC STATUS/ERROR STATE.
  // Every apiClient-backed mutation below used to hand-roll its own
  // try/catch (call the API; on success set local state from the
  // server-confirmed value; on failure console.error + fall back to a
  // locally computed value) -- a dozen near-identical, independent copies of
  // the same fallback logic. That is now unified: runSyncedMutation() is the
  // one place that decides what "this API call failed" means, and syncStatus
  // /syncError is the one piece of state that says so, instead of failures
  // being visible only in the browser console.
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [syncError, setSyncError] = useState<{ operation: string; message: string; timestamp: string } | null>(null);
  const clearSyncError = () => {
    setSyncError(null);
    setSyncStatus('idle');
  };

  // Centralized synchronization/mutation helper.
  //
  // `operation` is a short diagnostic label (e.g. "updateParcel:P-0556").
  // `apiCall` performs the actual apiClient request. `localFallback` computes
  // the value to use if the API call fails, so callers keep exactly their
  // previous optimistic-update behavior (state/cache stays internally
  // consistent -- the UI is not left mid-mutation) -- the difference from
  // before is that the failure is no longer swallowed: it is recorded in
  // syncStatus/syncError for the app to surface, and a *successful* result is
  // never fabricated. localStorage remains a CACHE only; the API/database is
  // the source of truth whenever it is reachable.
  async function runSyncedMutation<T>(
    operation: string,
    apiCall: () => Promise<T>,
    localFallback: () => T
  ): Promise<T> {
    setSyncStatus('syncing');
    try {
      const result = await apiCall();
      setSyncStatus('idle');
      setSyncError(null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[KSHETRA] Sync failed (${operation}):`, err);
      setSyncStatus('error');
      setSyncError({ operation, message, timestamp: new Date().toISOString() });
      return localFallback();
    }
  }

  // Project-level (primary) AI prediction state, keyed by project id so switching
  // projects does not lose a project's last prediction.
  const [projectPredictions, setProjectPredictions] = useState<Record<string, ProjectPrediction>>({});
  const [isProjectPredicting, setIsProjectPredicting] = useState<boolean>(false);
  const [projectPredictionError, setProjectPredictionError] = useState<string | null>(null);

  // Guided Demo Tour State
  const [demoTourActive, setDemoTourActive] = useState<boolean>(false);
  const [demoTourStep, setDemoTourStep] = useState<number>(1);

  // Sync state to LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SESSION, String(isLoggedIn));
  }, [isLoggedIn]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SELECTED_PROJECT_ID, selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PARCELS, JSON.stringify(allParcels));
  }, [allParcels]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ACTIONS, JSON.stringify(actions));
  }, [actions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ALIGNMENTS, JSON.stringify(alignments));
  }, [alignments]);

  // STEP 4 (persistence plan): API-FIRST INITIAL LOAD.
  //
  // The useState initializers above already seed projects/parcels/alerts/
  // actions/auditLogs from localStorage (or the bundled INITIAL_* mock data)
  // synchronously, so the UI paints instantly with no loading flash — that
  // localStorage-reading code is UNCHANGED and deliberately left in place
  // (Step 5 will build the real migration/fallback system; this is not it).
  //
  // On mount, this effect then asks the FastAPI backend for the current
  // state and — ONLY if the backend answered successfully — replaces that
  // local/placeholder state with the server's data, making the API the
  // source of truth going forward for this session. If the backend is
  // unreachable, the fetch throws, the catch below just logs a warning, and
  // the app keeps running on whatever was already loaded from localStorage —
  // the existing degrade-gracefully behavior is preserved, not replaced.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // STEP 5B: routed through the same centralized helper as every other
      // API interaction, so a failed initial load is recorded in
      // syncStatus/syncError (not just a console.warn) exactly like a failed
      // mutation is. The `null` fallback preserves the exact prior behavior
      // on failure: keep whatever localStorage/mock data was already loaded
      // by the useState initializers above, untouched.
      const results = await runSyncedMutation(
        'initial-load',
        () => Promise.all([
          apiClient.listProjects(),
          apiClient.listParcels(),
          apiClient.listAlerts(),
          apiClient.listActions(),
          apiClient.listAuditLogs({ limit: 200 }),
        ]),
        () => null
      );
      if (cancelled || !results) return;

      const [apiProjects, apiParcels, apiAlerts, apiActions, apiAuditLogs] = results;

      // STEP 5B: unified across every API-backed collection (previously only
      // projects/parcels were guarded) -- an empty API response never blindly
      // wipes out useful cached/demo state that already painted the screen.
      // In the intended setup (Step 1's seed.py has run) these are always
      // non-empty, so this is a safety net, not a preference for local data.
      if (apiProjects.length > 0) setProjects(apiProjects);
      if (apiParcels.length > 0) setAllParcels(apiParcels);
      if (apiAlerts.length > 0) setAlerts(apiAlerts);
      if (apiActions.length > 0) setActions(apiActions);
      if (apiAuditLogs.length > 0) setAuditLogs(apiAuditLogs);
    })();

    return () => {
      cancelled = true;
    };
    // Runs exactly once on mount — this is the initial load, not a live sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensures the active tab is always a module the given role can actually see.
  // Prevents landing on a blank/inaccessible screen after a role switch.
  const ensureTabAllowedForRole = (role: UserRole) => {
    setActiveTab(prevTab => (isTabAllowedForRole(role, prevTab) ? prevTab : ROLES[role].defaultTab));
  };

  const switchUser = (role: UserRole) => {
    const found = users.find(u => u.role === role);
    if (found) {
      setCurrentUser(found);
      setIsLoggedIn(true);
      ensureTabAllowedForRole(role);
      logAudit(`Switched active user session to ${found.name} (${found.roleTitle})`);
    }
  };

  const loginWithCredentials = (email: string, password: string, role: UserRole): boolean => {
    if (!isValidDemoLogin(email, password, role)) {
      return false;
    }
    const found = users.find(u => u.role === role);
    if (found) {
      setCurrentUser(found);
      setIsLoggedIn(true);
      ensureTabAllowedForRole(role);
      logAudit(`User login successful: ${email} (${found.roleTitle})`);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsLoggedIn(false);
    logAudit(`User logged out: ${currentUser.name}`);
  };

  // STEP 4: audit logging stays fire-and-forget on purpose. logAudit is called
  // synchronously from ~a dozen call sites throughout this file (none of them
  // await it today), and blocking every user action on a network round-trip
  // just to write a log line would be a real UX regression this step isn't
  // asked to introduce. The local state update stays instant/optimistic;
  // the backend write happens in the background and only a console warning
  // (never a user-facing error) results if it fails — audit history is
  // append-only telemetry, not something the user is waiting on.
  const logAudit = (actionText: string, parcelId?: string, surveyNumber?: string) => {
    const newLog: AuditLog = {
      id: `LOG-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      officerId: currentUser.id,
      officerName: currentUser.name,
      role: currentUser.roleTitle,
      action: actionText,
      parcelId,
      surveyNumber,
      details: `Executed by ${currentUser.name} via Web Decision Support Console.`
    };
    setAuditLogs(prev => [newLog, ...prev]);
    void apiClient.createAuditLog(newLog).catch((err) => {
      console.warn('[KSHETRA] Failed to persist audit log entry to backend', err);
    });
  };

  const openParcelDetail = (parcelId: string) => {
    const target = parcels.find(p => p.id === parcelId);
    if (target) {
      setSelectedParcel(target);
    }
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setSearchQuery('');
  };

  const updateSettings = (newSettings: Partial<SystemSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  // PRIMARY prediction: run the trained model on the WHOLE active acquisition
  // project/case (aggregated from its parcels + project-level fields), matching
  // the unit of observation used during model training.
  //
  //   project -> aggregateProjectCaseInput -> POST /predict -> LightGBM -> SHAP
  //   -> Cox -> ProjectPrediction (stored against project.id, shown project-level)
  //
  // On backend failure the prior stored prediction is kept and the error is
  // surfaced via projectPredictionError (existing displayed values are not lost).
  const runProjectDelayPrediction = async (): Promise<ProjectPrediction> => {
    setIsProjectPredicting(true);
    setProjectPredictionError(null);
    try {
      const projectParcels = allParcels.filter(p => p.projectId === project.id);
      const result = await fetchProjectAiPrediction(project, projectParcels);

      if (!result.isRealApiPrediction) {
        setProjectPredictionError(result.apiError || 'Project-level prediction unavailable.');
        logAudit(`Project-Level AI Delay Prediction FAILED for ${project.name} (${project.code}): ${result.apiError}`);
        return result;
      }

      setProjectPredictions(prev => ({ ...prev, [project.id]: result }));
      logAudit(
        `Executed PROJECT-LEVEL AI Delay Prediction for ${project.name} (${project.code}): ` +
        `Result = ${result.delayRiskScore}% (${result.riskLevel.toUpperCase()} RISK), aggregated from ` +
        `${result.modelInput.parcelsAnalyzed} parcel record(s) ` +
        `[Source: ${result.predictionMode === 'demo-fallback' ? 'Deterministic Demo Fallback' : 'LightGBM + SHAP + Cox'}]`
      );

      if (result.riskLevel === 'high') {
        const notif: NotificationItem = {
          id: `notif-${Date.now()}`,
          title: `Project-Level HIGH Delay Risk: ${project.name}`,
          message: `Project-level model predicted ${result.delayRiskScore}% delay risk (${result.predictedDelayRange}).`,
          timestamp: 'Just now',
          type: 'prediction',
          isRead: false,
          severity: 'HIGH'
        };
        setNotifications(prev => [notif, ...prev]);
      }

      return result;
    } finally {
      setIsProjectPredicting(false);
    }
  };

  // Run AI Delay Prediction for a parcel via the live FastAPI backend.
  //
  // options.preserveOnFailure: when true, a failed/unreachable backend call does
  // NOT overwrite the parcel's existing risk values with the zeroed placeholder.
  // The batch "Re-run Model on All Parcels" uses this so a backend outage cannot
  // wipe every parcel's displayed risk to 0 / LOW. Single manual predictions keep
  // the default (false) so the modal can still surface the "API Offline" state.
  const runDelayPrediction = async (
    parcelId: string,
    options?: { preserveOnFailure?: boolean }
  ): Promise<Parcel> => {
    const target = parcels.find(p => p.id === parcelId);
    if (!target) throw new Error('Parcel not found');

    const prediction = await fetchRealAiPrediction(target, project?.totalParcels);

    if (!prediction.isRealApiPrediction && options?.preserveOnFailure) {
      logAudit(
        `AI Delay Prediction skipped for ${parcelId} (${target.surveyNumber}): prediction service unavailable — existing risk values preserved`,
        parcelId,
        target.surveyNumber
      );
      return { ...target, isRealApiPrediction: false, apiError: prediction.apiError };
    }

    // The ML model produces a delay PROBABILITY + hazard, not a duration, so it
    // does NOT overwrite the parcel's catalogued delay-month figures
    // (predictedDelayMonths / predictedDelayRange / predictedDelayAfterIntervention
    // / potentialReductionMonths) — those stay as the seed/catalogued baseline.
    //
    // STEP 4: the ML call above (fetchRealAiPrediction -> POST /predict) is
    // completely UNCHANGED — same request, same response shape. What's new is
    // that the resulting parcel fields are now persisted via PATCH
    // /api/parcels/{id} and the component receives the server-confirmed row
    // (falling back to the locally computed one if the backend write fails,
    // so a persistence hiccup never blocks the prediction UI itself).
    const parcelPatch: Partial<Parcel> = {
      delayRiskScore: prediction.delayRiskScore,
      riskLevel: prediction.riskLevel,
      delayConfidence: prediction.delayConfidence,
      topRiskFactor: prediction.topRiskFactor,
      aiExplanation: prediction.aiExplanation,
      shapFactors: prediction.shapFactors,
      riskFactorsList: prediction.riskFactorsList,
      recommendedAction: prediction.recommendedAction,
      priority: prediction.priority,
      delayProbability: prediction.delayProbability,
      isRealApiPrediction: prediction.isRealApiPrediction,
      apiError: prediction.apiError,
      survivalAnalysis: prediction.survivalAnalysis
    };

    const updatedParcel = await runSyncedMutation(
      `updateParcel:${parcelId}`,
      () => apiClient.updateParcel(parcelId, parcelPatch),
      () => ({ ...target, ...parcelPatch })
    );

    // Update in allParcels array
    setAllParcels(prev => prev.map(p => p.id === parcelId ? updatedParcel : p));
    if (selectedParcel?.id === parcelId) {
      setSelectedParcel(updatedParcel);
    }

    logAudit(`Executed AI Delay Prediction on ${parcelId} (${target.surveyNumber}): Result = ${prediction.delayRiskScore}% (${prediction.riskLevel.toUpperCase()} RISK) [Source: ${prediction.isRealApiPrediction ? (prediction.predictionMode === 'demo-fallback' ? 'Deterministic Demo Fallback' : 'LightGBM + SHAP + Cox') : 'Prediction Unavailable'}]`, parcelId, target.surveyNumber);

    // If High Risk, generate an alert if not already active
    if (prediction.riskLevel === 'high') {
      const existingAlert = alerts.find(a => a.parcelId === parcelId && a.status !== 'Resolved');
      if (!existingAlert) {
        const newAlert: Alert = {
          id: `ALT-${Date.now().toString().slice(-4)}`,
          level: 'CRITICAL',
          title: `HIGH RISK ACQUISITION DELAY: Parcel ${parcelId}`,
          projectName: target.projectName,
          projectId: target.projectId,
          parcelId: target.id,
          surveyNumber: target.surveyNumber,
          riskScore: prediction.delayRiskScore,
          trigger: prediction.topRiskFactor,
          reason: `Model delay probability ${prediction.delayRiskScore}% (HIGH). Risk factors: ${prediction.riskFactorsList.join(', ')}`,
          recommendedAction: prediction.recommendedAction,
          createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          status: 'Active'
        };
        const persistedAlert = await runSyncedMutation(
          `createAlert:${newAlert.id}`,
          () => apiClient.createAlert(newAlert),
          () => newAlert
        );
        setAlerts(prev => [persistedAlert, ...prev]);

        // Add Notification
        const notif: NotificationItem = {
          id: `notif-${Date.now()}`,
          title: `High Risk Alert Triggered: ${parcelId}`,
          message: `AI model predicted ${prediction.delayRiskScore}% delay risk for Survey ${target.surveyNumber}.`,
          timestamp: 'Just now',
          parcelId: target.id,
          type: 'alert',
          isRead: false,
          severity: 'HIGH'
        };
        setNotifications(prev => [notif, ...prev]);
      }
    }

    return updatedParcel;
  };

  // Sync Government Data simulation.
  // A simulated "sync" ONLY refreshes the sync timestamp/status. It never mutates
  // the parcel's canonical court / revenue / GIS records — those live in the
  // Parcel object (single source of truth) and are re-affirmed, not replaced.
  const syncGovernmentDataForParcel = async (parcelId: string) => {
    const parcel = allParcels.find(p => p.id === parcelId);
    if (!parcel) return;

    setIsSyncing(true);
    setSyncProgressLogs([]);

    try {
      const result = await simulateGovernmentSync(parcel, (step) => {
        setSyncProgressLogs(prev => [...prev, step]);
      });

      // STEP 4: persist just the two fields this (still purely simulated,
      // see apiSimulation.ts) sync actually changes. Server-confirmed on
      // success; falls back to the locally computed value if the backend
      // write fails, so a persistence hiccup doesn't block the sync UX.
      const syncPatch: Partial<Parcel> = { lastSyncedAt: result.syncedAt, syncStatus: 'Synced' };
      const updated = await runSyncedMutation(
        `updateParcel:${parcelId}:govSync`,
        () => apiClient.updateParcel(parcelId, syncPatch),
        () => ({ ...parcel, ...syncPatch })
      );
      setAllParcels(prev => prev.map(p => (p.id === parcelId ? updated : p)));
      if (selectedParcel?.id === parcelId) {
        setSelectedParcel(updated);
      }

      logAudit(`Ran simulated Government Data sync (demo) for parcel ${parcelId} — canonical records re-affirmed, no live government connection`, parcelId);
    } finally {
      setIsSyncing(false);
    }
  };

  // Project Management (Exclusively for Project Planner)
  const createProject = (projectData: Omit<Project, 'id'>, customParcels?: Parcel[]): Project => {
    const newId = `proj-${Date.now().toString().slice(-6)}`;
    const newCode = projectData.code || `NHAI-TN-${new Date().getFullYear()}-PRJ-${Math.floor(100 + Math.random() * 900)}`;

    const corridorPath = projectData.corridorPath && projectData.corridorPath.length > 1
      ? projectData.corridorPath
      : [
          projectData.startCoords || [11.6643, 78.1460],
          projectData.endCoords || [11.8350, 77.9850]
        ];

    // Calculate approximate length in km based on coordinates
    let calculatedKm = 0;
    for (let i = 0; i < corridorPath.length - 1; i++) {
      const [lat1, lon1] = corridorPath[i];
      const [lat2, lon2] = corridorPath[i + 1];
      const dLat = (lat2 - lat1) * 111;
      const dLon = (lon2 - lon1) * 111 * Math.cos((lat1 * Math.PI) / 180);
      calculatedKm += Math.sqrt(dLat * dLat + dLon * dLon);
    }
    const finalLengthKm = projectData.totalLengthKm || +(calculatedKm || 28.5).toFixed(1);

    const generatedParcels = customParcels || generateSyntheticParcelsForProject(
      newId,
      projectData.name,
      corridorPath
    );

    const highRisk = generatedParcels.filter(p => p.riskLevel === 'high').length;
    const medRisk = generatedParcels.filter(p => p.riskLevel === 'medium').length;
    const lowRisk = generatedParcels.filter(p => p.riskLevel === 'low').length;
    const avgDelay = +(generatedParcels.reduce((acc, p) => acc + p.predictedDelayMonths, 0) / (generatedParcels.length || 1)).toFixed(1);

    const newProject: Project = {
      ...projectData,
      id: newId,
      code: newCode,
      department: projectData.department || 'Ministry of Road Transport & Highways (MoRTH)',
      agency: projectData.agency || 'NHAI',
      totalLengthKm: finalLengthKm,
      projectValueCrores: projectData.projectValueCrores || 1850,
      totalParcels: generatedParcels.length + 120,
      acquiredParcels: 42,
      pendingParcels: (generatedParcels.length + 120) - 42,
      highRiskParcels: highRisk,
      medRiskParcels: medRisk,
      lowRiskParcels: lowRisk,
      predictedDelayMonths: avgDelay || 3.8,
      status: highRisk > 2 ? 'At Risk' : 'On Track',
      currentLarrStage: projectData.currentLarrStage || 'Declaration (Sec 3D/19)',
      corridorSections: projectData.corridorSections && projectData.corridorSections.length > 0 ? projectData.corridorSections : [
        {
          sectionId: `${newId}-sec1`,
          name: `Section 1: ${projectData.startPointName || 'Start'} Corridor Section`,
          chainageKm: `Km 0.0 - ${(finalLengthKm / 2).toFixed(1)}`,
          riskScore: highRisk > 0 ? 78 : 25,
          riskLevel: highRisk > 0 ? 'high' : 'low',
          bottleneckCount: highRisk,
          description: `Active corridor acquisition section originating from ${projectData.startPointName || 'Start Point'}.`
        },
        {
          sectionId: `${newId}-sec2`,
          name: `Section 2: ${projectData.endPointName || 'End'} Link`,
          chainageKm: `Km ${(finalLengthKm / 2).toFixed(1)} - ${finalLengthKm}`,
          riskScore: medRisk > 0 ? 46 : 18,
          riskLevel: medRisk > 0 ? 'medium' : 'low',
          bottleneckCount: medRisk,
          description: `Approaching ${projectData.endPointName || 'End Point'} terminal corridor junction.`
        }
      ],
      corridorPath,
      startPointName: projectData.startPointName,
      endPointName: projectData.endPointName,
      startCoords: projectData.startCoords || corridorPath[0],
      endCoords: projectData.endCoords || corridorPath[corridorPath.length - 1],
      isCustomProject: true
    };

    const newAlignment: AlignmentOption = {
      id: `align-${newId}`,
      name: `Plan / Alignment: ${newProject.name}`,
      code: `DPR-${newProject.code}`,
      lengthKm: finalLengthKm,
      affectedParcels: generatedParcels.length + 120,
      highRiskParcels: highRisk,
      predictedDelayMonths: avgDelay || 3.8,
      estimatedCostCrores: newProject.projectValueCrores || 1850,
      litigationFrictionScore: highRisk > 2 ? 65 : 28,
      isRecommended: false,
      recommendationReason: `Corridor alignment plan generated for ${newProject.name} between ${newProject.startPointName || 'Start'} and ${newProject.endPointName || 'End'}.`,
      pros: [
        `${generatedParcels.filter(p => p.riskLevel === 'low').length} low-risk parcels ready for direct award`,
        `Direct route corridor connecting ${newProject.startPointName || 'Start Point'} to ${newProject.endPointName || 'End Point'}`
      ],
      cons: [
        `${highRisk} parcels flagged with civil litigation or partition disputes`,
        `Estimated acquisition schedule of ${avgDelay || 3.8} months`
      ],
      pathCoordinates: corridorPath
    };

    setProjects(prev => {
      const updated = [...prev, newProject];
      try { localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });

    setAllParcels(prev => {
      const updated = [...prev, ...generatedParcels];
      try { localStorage.setItem(STORAGE_KEY_PARCELS, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });

    setAlignments(prev => {
      const updated = [...prev, newAlignment];
      try { localStorage.setItem(STORAGE_KEY_ALIGNMENTS, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });

    setSelectedProjectId(newId);
    try { localStorage.setItem(STORAGE_KEY_SELECTED_PROJECT_ID, newId); } catch { /* ignore */ }

    logAudit(`Created New Project: ${newProject.name} (${newProject.code}) with ${generatedParcels.length} parcel dossiers.`);

    // STEP 4: persist the new project + its generated parcels in the
    // background. createProject's public signature returns a plain `Project`
    // synchronously (existing callers — NewProjectModal, commitRouteDraft —
    // use that return value immediately and don't await it), so this cannot
    // become an async/awaited call without changing the interface. The local
    // state above is already updated optimistically exactly as before this
    // step; this only adds the backend write-through alongside it.
    void runSyncedMutation(
      `createProject:${newProject.id}`,
      async () => {
        await apiClient.createProject(newProject);
        await Promise.all(generatedParcels.map((gp) => apiClient.createParcel(gp)));
      },
      () => undefined
    );

    return newProject;
  };

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    try { localStorage.setItem(STORAGE_KEY_SELECTED_PROJECT_ID, projectId); } catch { /* ignore */ }
    const found = projects.find(p => p.id === projectId);
    if (found) {
      logAudit(`Selected Project: ${found.name} (${found.code})`);
    }
  };

  const deleteProject = async (projectId: string) => {
    // STEP 4: ask the backend to delete first (it cascades to the project's
    // parcels/alerts/predictions at the database level — see Step 1). If the
    // backend call fails, still perform the local cleanup below rather than
    // leaving the UI stuck on a click that appeared to do nothing — the
    // failure is logged, not hidden.
    await runSyncedMutation(
      `deleteProject:${projectId}`,
      () => apiClient.deleteProject(projectId),
      () => undefined
    );

    // 1. Ensure only the selected project is deleted from projects list
    setProjects(prev => {
      const filtered = prev.filter(p => p.id !== projectId);
      const nextProjects = filtered.length > 0 ? filtered : [INITIAL_PROJECT];
      try { localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(nextProjects)); } catch { /* ignore */ }
      return nextProjects;
    });

    // 2. Delete ONLY parcels belonging to this project
    setAllParcels(prev => {
      const filtered = prev.filter(p => p.projectId !== projectId);
      try { localStorage.setItem(STORAGE_KEY_PARCELS, JSON.stringify(filtered)); } catch { /* ignore */ }
      return filtered;
    });

    // 3. Delete alignment / plan option associated with this project
    setAlignments(prev => {
      const filtered = prev.filter(a => a.id !== `align-${projectId}`);
      try { localStorage.setItem(STORAGE_KEY_ALIGNMENTS, JSON.stringify(filtered)); } catch { /* ignore */ }
      return filtered;
    });

    // 4. If deleting the active project, switch to the first remaining project
    setSelectedProjectId(prev => {
      if (prev === projectId) {
        const remaining = projects.filter(p => p.id !== projectId);
        const nextId = remaining.length > 0 ? remaining[0].id : INITIAL_PROJECT.id;
        try { localStorage.setItem(STORAGE_KEY_SELECTED_PROJECT_ID, nextId); } catch { /* ignore */ }
        return nextId;
      }
      return prev;
    });

    logAudit(`Deleted Project ID ${projectId}`);
  };

  const updateProjectRoute = async (projectId: string, newRoute: [number, number][]) => {
    if (!newRoute || newRoute.length < 2) return;

    // Calculate new approximate km
    let calculatedKm = 0;
    for (let i = 0; i < newRoute.length - 1; i++) {
      const [lat1, lon1] = newRoute[i];
      const [lat2, lon2] = newRoute[i + 1];
      const dLat = (lat2 - lat1) * 111;
      const dLon = (lon2 - lon1) * 111 * Math.cos((lat1 * Math.PI) / 180);
      calculatedKm += Math.sqrt(dLat * dLat + dLon * dLon);
    }

    const existing = projects.find(p => p.id === projectId);
    const patch: Partial<Project> = {
      corridorPath: newRoute,
      totalLengthKm: +(calculatedKm || existing?.totalLengthKm || 0).toFixed(1),
      startCoords: newRoute[0],
      endCoords: newRoute[newRoute.length - 1]
    };

    // Fallback (API failure) merges the patch onto the LIVE previous state
    // inside the setter, not a stale captured snapshot -- matching the
    // pre-Step-5B behavior for this call site exactly.
    const updated = await runSyncedMutation(
      `updateProject:${projectId}:route`,
      () => apiClient.updateProject(projectId, patch),
      () => null
    );
    setProjects(prev => prev.map(p => (p.id === projectId ? (updated ?? { ...p, ...patch }) : p)));

    logAudit(`Updated route geometry on Map for Project ID ${projectId}`);
  };

  const generateRoutePoints = (start: [number, number], end: [number, number]): [number, number][] => {
    const [sLat, sLng] = start;
    const [eLat, eLng] = end;
    return [
      start,
      [
        +(sLat + (eLat - sLat) * 0.25 + 0.008).toFixed(6),
        +(sLng + (eLng - sLng) * 0.25 - 0.006).toFixed(6)
      ],
      [
        +(sLat + (eLat - sLat) * 0.50 - 0.005).toFixed(6),
        +(sLng + (eLng - sLng) * 0.50 + 0.008).toFixed(6)
      ],
      [
        +(sLat + (eLat - sLat) * 0.75 + 0.006).toFixed(6),
        +(sLng + (eLng - sLng) * 0.75 - 0.004).toFixed(6)
      ],
      end
    ];
  };

  const startRouteDraft = (
    draft: Partial<Project>,
    initialCoords: [number, number][],
    isNew: boolean = true,
    step?: 'select-start' | 'select-end' | 'edit-route',
    startCoords?: [number, number],
    endCoords?: [number, number]
  ) => {
    setRouteEditState({
      active: true,
      isNew,
      draftProject: draft,
      routeCoords: initialCoords,
      selectionStep: step || (isNew ? (startCoords ? (endCoords ? 'edit-route' : 'select-end') : 'select-start') : 'edit-route'),
      startCoords: startCoords || (initialCoords.length > 0 ? initialCoords[0] : undefined),
      endCoords: endCoords || (initialCoords.length > 1 ? initialCoords[initialCoords.length - 1] : undefined),
      history: { past: [], future: [] }
    });
    setActiveTab('map');
  };

  // Selecting/moving a Start or End point on the map re-seeds the whole alignment,
  // so it starts a fresh alignment-edit session and clears undo/redo history.
  const setDraftStartCoords = (coords: [number, number]) => {
    setRouteEditState(prev => {
      if (!prev) return null;
      const newDraft = {
        ...prev.draftProject,
        startCoords: coords,
        startPointName: prev.draftProject.startPointName || 'Custom map location'
      };

      if (prev.endCoords) {
        const generated = generateRoutePoints(coords, prev.endCoords);
        return {
          ...prev,
          draftProject: newDraft,
          startCoords: coords,
          routeCoords: generated,
          selectionStep: 'edit-route',
          history: { past: [], future: [] }
        };
      }
      return {
        ...prev,
        draftProject: newDraft,
        startCoords: coords,
        routeCoords: [coords],
        selectionStep: 'select-end',
        history: { past: [], future: [] }
      };
    });
  };

  const setDraftEndCoords = (coords: [number, number]) => {
    setRouteEditState(prev => {
      if (!prev) return null;
      const newDraft = {
        ...prev.draftProject,
        endCoords: coords,
        endPointName: prev.draftProject.endPointName || 'Custom map location'
      };

      if (prev.startCoords) {
        const generated = generateRoutePoints(prev.startCoords, coords);
        return {
          ...prev,
          draftProject: newDraft,
          endCoords: coords,
          routeCoords: generated,
          selectionStep: 'edit-route',
          history: { past: [], future: [] }
        };
      }
      return {
        ...prev,
        draftProject: newDraft,
        endCoords: coords,
        routeCoords: [coords],
        selectionStep: 'select-start',
        history: { past: [], future: [] }
      };
    });
  };

  const setRouteEditStep = (step: 'select-start' | 'select-end' | 'edit-route') => {
    setRouteEditState(prev => prev ? { ...prev, selectionStep: step } : null);
  };

  // Every meaningful alignment-geometry edit flows through here (waypoint drag-end,
  // start/end drag-end, click-to-insert waypoint, Add Waypoint, Reset Alignment,
  // and the right-side coordinate panel). By default it records an undo snapshot
  // of the previous geometry and discards the redo branch. startCoords / endCoords
  // are kept in sync with the first / last point so the START and END markers
  // (rendered from those fields) always match the edited geometry.
  const updateDraftRoute = (coords: [number, number][], opts?: { recordHistory?: boolean }) => {
    setRouteEditState(prev => {
      if (!prev) return null;
      const record = opts?.recordHistory !== false;
      const hist = prev.history || { past: [], future: [] };
      return {
        ...prev,
        routeCoords: coords,
        startCoords: coords.length > 0 ? coords[0] : prev.startCoords,
        endCoords: coords.length > 1 ? coords[coords.length - 1] : prev.endCoords,
        history: record ? { past: [...hist.past, prev.routeCoords], future: [] } : hist
      };
    });
  };

  const undoAlignment = () => {
    setRouteEditState(prev => {
      if (!prev || !prev.history || prev.history.past.length === 0) return prev;
      const past = [...prev.history.past];
      const previous = past.pop() as [number, number][];
      return {
        ...prev,
        routeCoords: previous,
        startCoords: previous.length > 0 ? previous[0] : prev.startCoords,
        endCoords: previous.length > 1 ? previous[previous.length - 1] : prev.endCoords,
        history: { past, future: [prev.routeCoords, ...prev.history.future] }
      };
    });
  };

  const redoAlignment = () => {
    setRouteEditState(prev => {
      if (!prev || !prev.history || prev.history.future.length === 0) return prev;
      const [next, ...rest] = prev.history.future;
      return {
        ...prev,
        routeCoords: next,
        startCoords: next.length > 0 ? next[0] : prev.startCoords,
        endCoords: next.length > 1 ? next[next.length - 1] : prev.endCoords,
        history: { past: [...prev.history.past, prev.routeCoords], future: rest }
      };
    });
  };

  const cancelRouteDraft = () => {
    setRouteEditState(null);
  };

  const commitRouteDraft = () => {
    if (!routeEditState) return;

    if (routeEditState.isNew) {
      const fallback: [number, number][] = [[11.6643, 78.1460], [11.8350, 77.9850]];
      const finalCoords: [number, number][] = (routeEditState.routeCoords && routeEditState.routeCoords.length > 1
        ? routeEditState.routeCoords
        : (routeEditState.startCoords && routeEditState.endCoords 
            ? generateRoutePoints(routeEditState.startCoords, routeEditState.endCoords)
            : fallback)) as [number, number][];

      const startPt: [number, number] = finalCoords[0];
      const endPt: [number, number] = finalCoords[finalCoords.length - 1];

      createProject({
        name: routeEditState.draftProject.name || 'New Highway Corridor Project',
        code: routeEditState.draftProject.code || '',
        department: 'Ministry of Road Transport & Highways (MoRTH)',
        agency: 'NHAI',
        totalLengthKm: routeEditState.draftProject.totalLengthKm || 0,
        projectValueCrores: routeEditState.draftProject.projectValueCrores || 1500,
        totalParcels: 150,
        acquiredParcels: 30,
        pendingParcels: 120,
        highRiskParcels: 0,
        medRiskParcels: 0,
        lowRiskParcels: 0,
        predictedDelayMonths: 3.5,
        status: 'On Track',
        currentLarrStage: routeEditState.draftProject.currentLarrStage || 'Notification (Sec 3A/11)',
        corridorSections: [],
        corridorPath: finalCoords,
        startPointName: routeEditState.draftProject.startPointName || 'Custom map location',
        endPointName: routeEditState.draftProject.endPointName || 'Custom map location',
        startCoords: startPt,
        endCoords: endPt,
        projectType: routeEditState.draftProject.projectType,
        planningPriorities: routeEditState.draftProject.planningPriorities
      });
    } else if (routeEditState.draftProject.id) {
      updateProjectRoute(routeEditState.draftProject.id, routeEditState.routeCoords);
    }

    setRouteEditState(null);
  };

  // Create Case Action
  // STEP 4: server-confirmed create for both the action and the parcel it
  // touches — awaited (this function's public type is void-returning, so no
  // caller depends on a synchronous return value; see the Step 4 report).
  // Falls back to the locally computed value on a backend failure so the
  // action/parcel UI still updates rather than silently doing nothing.
  const createNewAction = async (actionData: Omit<CaseAction, 'id' | 'createdAt'>) => {
    const newAction: CaseAction = {
      ...actionData,
      id: `ACT-${Date.now().toString().slice(-4)}`,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16)
    };

    const persistedAction = await runSyncedMutation(
      `createAction:${newAction.id}`,
      () => apiClient.createAction(newAction),
      () => newAction
    );
    setActions(prev => [persistedAction, ...prev]);

    // Update parcel status
    const parcelPatch: Partial<Parcel> = {
      interventionStatus: 'In Progress',
      assignedOfficer: actionData.assignedOfficer,
      assignedDueDate: actionData.dueDate
    };
    const updatedParcel = await runSyncedMutation(
      `updateParcel:${actionData.parcelId}:action`,
      () => apiClient.updateParcel(actionData.parcelId, parcelPatch),
      () => null
    );
    setAllParcels(prev => prev.map(p => (p.id === actionData.parcelId ? (updatedParcel ?? { ...p, ...parcelPatch }) : p)));
    if (selectedParcel?.id === actionData.parcelId) {
      setSelectedParcel(prev => (updatedParcel ?? (prev ? { ...prev, ...parcelPatch } : null)));
    }

    logAudit(`Created Action ${persistedAction.id}: "${persistedAction.title}" assigned to ${persistedAction.assignedOfficer}`, actionData.parcelId, actionData.surveyNumber);

    // Notification (client-side only — NotificationItem has no backend table in this step)
    setNotifications(prev => [{
      id: `notif-${Date.now()}`,
      title: `Action Assigned: ${persistedAction.title}`,
      message: `Assigned to ${persistedAction.assignedOfficer} (Due: ${persistedAction.dueDate})`,
      timestamp: 'Just now',
      parcelId: persistedAction.parcelId,
      type: 'action',
      isRead: false,
      severity: persistedAction.priority === 'CRITICAL' || persistedAction.priority === 'HIGH' ? 'HIGH' : 'MEDIUM'
    }, ...prev]);
  };

  // Update Action Status
  // STEP 4: server-confirmed update for the action, and (when completed) for
  // the parcel's re-evaluated risk fields and any associated alerts.
  const updateActionStatus = async (actionId: string, status: CaseAction['status'], notes?: string) => {
    const existingAction = actions.find(a => a.id === actionId);
    if (!existingAction) return;

    const actionPatch: Partial<CaseAction> = {
      status,
      notes: notes ? `${existingAction.notes} | Update: ${notes}` : existingAction.notes,
      completedAt: status === 'Completed'
        ? new Date().toISOString().replace('T', ' ').substring(0, 16)
        : existingAction.completedAt
    };

    const updatedAction = await runSyncedMutation(
      `updateAction:${actionId}`,
      () => apiClient.updateAction(actionId, actionPatch),
      () => ({ ...existingAction, ...actionPatch })
    );
    setActions(prev => prev.map(a => (a.id === actionId ? updatedAction : a)));

    const affectedParcelId = existingAction.parcelId;
    const targetReduction = existingAction.targetDelayReductionMonths;

    if (affectedParcelId && status === 'Completed') {
      // If completed, reduce delay and re-evaluate risk
      const parcel = allParcels.find(p => p.id === affectedParcelId);
      if (parcel) {
        const newDelay = Math.max(0.1, +(parcel.predictedDelayMonths - targetReduction).toFixed(1));
        const newScore = Math.max(15, Math.floor(parcel.delayRiskScore * 0.45));
        const newRiskLevel: RiskLevel = newScore >= 70 ? 'high' : newScore >= 40 ? 'medium' : 'low';
        const parcelPatch: Partial<Parcel> = {
          delayRiskScore: newScore,
          riskLevel: newRiskLevel,
          predictedDelayMonths: newDelay,
          predictedDelayRange: newDelay <= 1 ? '0–1 Month' : `${Math.floor(newDelay)}–${Math.ceil(newDelay)} Months`,
          interventionStatus: 'Completed',
          possessionStatus: 'Complete'
        };

        const updatedParcel = await runSyncedMutation(
          `updateParcel:${affectedParcelId}:actionCompleted`,
          () => apiClient.updateParcel(affectedParcelId, parcelPatch),
          () => ({ ...parcel, ...parcelPatch })
        );
        setAllParcels(prev => prev.map(p => (p.id === affectedParcelId ? updatedParcel : p)));
        if (selectedParcel?.id === affectedParcelId) setSelectedParcel(updatedParcel);
      }

      // Resolve associated alert(s), if any
      const relatedAlerts = alerts.filter(al => al.parcelId === affectedParcelId);
      for (const al of relatedAlerts) {
        const alertPatch: Partial<Alert> = {
          status: 'Resolved',
          resolutionNotes: `Resolved via completed action ${actionId}`
        };
        const updatedAlert = await runSyncedMutation(
          `updateAlert:${al.id}:autoResolve`,
          () => apiClient.updateAlert(al.id, alertPatch),
          () => null
        );
        setAlerts(prev => prev.map(a => (a.id === al.id ? (updatedAlert ?? { ...a, ...alertPatch }) : a)));
      }
    }

    if (affectedParcelId) {
      logAudit(`Updated Action ${actionId} status to "${status}"`, affectedParcelId);
    }
  };

  const resolveAlert = async (alertId: string, resolutionNotes?: string) => {
    const patch: Partial<Alert> = {
      status: 'Resolved',
      resolutionNotes: resolutionNotes || 'Marked as resolved by officer.'
    };
    const updated = await runSyncedMutation(
      `updateAlert:${alertId}:resolve`,
      () => apiClient.updateAlert(alertId, patch),
      () => null
    );
    setAlerts(prev => prev.map(a => (a.id === alertId ? (updated ?? { ...a, ...patch }) : a)));
    logAudit(`Resolved Alert ${alertId}`);
  };

  const assignAlert = async (alertId: string, officerName: string) => {
    const patch: Partial<Alert> = { status: 'Assigned', assignedTo: officerName };
    const updated = await runSyncedMutation(
      `updateAlert:${alertId}:assign`,
      () => apiClient.updateAlert(alertId, patch),
      () => null
    );
    setAlerts(prev => prev.map(a => (a.id === alertId ? (updated ?? { ...a, ...patch }) : a)));
    logAudit(`Assigned Alert ${alertId} to ${officerName}`);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const startDemoTour = () => {
    setDemoTourActive(true);
    setDemoTourStep(1);
    setActiveTab('dashboard');
  };

  const nextDemoTourStep = () => {
    setDemoTourStep(prev => prev + 1);
  };

  const prevDemoTourStep = () => {
    setDemoTourStep(prev => Math.max(1, prev - 1));
  };

  const endDemoTour = () => {
    setDemoTourActive(false);
    setDemoTourStep(1);
  };

  const resetAllData = () => {
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_PARCELS);
    localStorage.removeItem(STORAGE_KEY_PROJECTS);
    localStorage.removeItem(STORAGE_KEY_SELECTED_PROJECT_ID);
    localStorage.removeItem(STORAGE_KEY_ALERTS);
    localStorage.removeItem(STORAGE_KEY_ACTIONS);
    localStorage.removeItem(STORAGE_KEY_LOGS);
    setProjects([INITIAL_PROJECT]);
    setSelectedProjectId(INITIAL_PROJECT.id);
    setAllParcels(INITIAL_PARCELS.map(p => ({ ...p, projectId: INITIAL_PROJECT.id })));
    setRouteEditState(null);
    setAlerts(INITIAL_ALERTS);
    setActions(INITIAL_ACTIONS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setCurrentUser(INITIAL_USERS[1]);
    setSelectedParcel(null);
    resetFilters();
  };

  // Filtered parcels logic
  const filteredParcels = parcels.filter(parcel => {
    // Search query matches Parcel ID, ULPIN, Survey Number, Owner Name, Village, Taluk
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match = 
        parcel.id.toLowerCase().includes(q) ||
        parcel.ulpin.toLowerCase().includes(q) ||
        parcel.surveyNumber.toLowerCase().includes(q) ||
        parcel.ownerName.toLowerCase().includes(q) ||
        parcel.village.toLowerCase().includes(q) ||
        parcel.taluk.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Risk level filter
    if (filters.riskLevel !== 'all' && parcel.riskLevel !== filters.riskLevel) {
      return false;
    }

    // Acquisition status filter
    if (filters.acquisitionStatus !== 'all' && parcel.acquisitionStatus !== filters.acquisitionStatus) {
      return false;
    }

    // Court Case filter
    if (filters.courtCase === 'yes' && (!parcel.courtCase && parcel.courtCaseStatus === 'None')) {
      return false;
    }
    if (filters.courtCase === 'no' && (parcel.courtCase || parcel.courtCaseStatus !== 'None')) {
      return false;
    }

    // Compensation status filter
    if (filters.compensationStatus !== 'all' && parcel.compensationStatus !== filters.compensationStatus) {
      return false;
    }

    // Document status filter
    if (filters.documentStatus !== 'all' && parcel.documentStatus !== filters.documentStatus) {
      return false;
    }

    // Taluk / Village
    if (filters.taluk !== 'all' && parcel.taluk !== filters.taluk) {
      return false;
    }
    if (filters.village !== 'all' && parcel.village !== filters.village) {
      return false;
    }

    return true;
  }).sort((a, b) => {
    switch (filters.sortBy) {
      case 'riskScoreDesc':
        return b.delayRiskScore - a.delayRiskScore;
      case 'riskScoreAsc':
        return a.delayRiskScore - b.delayRiskScore;
      case 'surveyNo':
        return a.surveyNumber.localeCompare(b.surveyNumber);
      case 'areaDesc':
        return b.areaAcres - a.areaAcres;
      case 'delayMonthsDesc':
        return b.predictedDelayMonths - a.predictedDelayMonths;
      default:
        return b.delayRiskScore - a.delayRiskScore;
    }
  });

  const unreadNotifsCount = notifications.filter(n => !n.isRead).length;

  return (
    <AppContext.Provider value={{
      currentUser,
      users,
      switchUser,
      loginWithCredentials,
      logout,
      isLoggedIn,
      activeTab,
      setActiveTab,
      parcels,
      allParcels,
      filteredParcels,
      selectedParcel,
      setSelectedParcel,
      openParcelDetail,
      project,
      projects,
      selectedProjectId,
      createProject,
      selectProject,
      deleteProject,
      updateProjectRoute,
      routeEditState,
      startRouteDraft,
      setDraftStartCoords,
      setDraftEndCoords,
      setRouteEditStep,
      updateDraftRoute,
      cancelRouteDraft,
      commitRouteDraft,
      undoAlignment,
      redoAlignment,
      canUndoAlignment: !!routeEditState?.history?.past.length,
      canRedoAlignment: !!routeEditState?.history?.future.length,
      alerts,
      actions,
      alignments,
      auditLogs,
      notifications,
      unreadNotifsCount,
      settings,
      updateSettings,
      searchQuery,
      setSearchQuery,
      filters,
      setFilters,
      resetFilters,
      runProjectDelayPrediction,
      projectPrediction: projectPredictions[project.id] || null,
      isProjectPredicting,
      projectPredictionError,
      runDelayPrediction,
      syncGovernmentDataForParcel,
      isSyncing,
      syncProgressLogs,
      syncStatus,
      syncError,
      clearSyncError,
      createNewAction,
      updateActionStatus,
      resolveAlert,
      assignAlert,
      markNotificationRead,
      markAllNotificationsRead,
      demoTourActive,
      demoTourStep,
      startDemoTour,
      nextDemoTourStep,
      prevDemoTourStep,
      endDemoTour,
      resetAllData
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
