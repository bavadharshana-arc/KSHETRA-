import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  MapPin,
  Gavel,
  Cpu,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  Sliders,
  Building,
  FileCheck,
  Printer,
  Sparkles,
  TrendingDown,
  ListChecks,
  Clock,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Parcel, CaseAction, ShapFactor } from '../../types';
import { simulateWhatIfScenario } from '../../services/predictionEngine';
import { getParcelLatestExposure } from '../../services/exposureService';
import type { ExposureAssessmentWithContext } from '../../types/exposure';
import { ExposurePriorityCard } from '../exposure/ExposurePriorityCard';
import { ParcelBlockersCard } from '../legal/ParcelBlockersCard';
import { CaseStoryStrip } from './CaseStoryStrip';
import { useConstructionReadiness } from '../../hooks/useConstructionReadiness';
import { getParcelClocks } from '../../services/legalService';
import type { StatutoryClockResult } from '../../types/legal';
import { StatutoryClockCard } from '../legal/StatutoryClockCard';
import { SectionHeading } from '../ui';

export const ParcelDetailModal: React.FC = () => {
  const {
    selectedParcel,
    setSelectedParcel,
    syncGovernmentDataForParcel,
    isSyncing,
    syncProgressLogs,
    createNewAction,
    updateActionStatus,
    actions,
    currentUser,
    setActiveTab,
    project,
    runProjectDelayPrediction,
    projectPrediction,
    isProjectPredicting,
    projectPredictionError,
    recordFieldVerification
  } = useApp();

  const [activeTab, setActiveTabLocal] = useState<'overview' | 'govrecords' | 'ecourts' | 'ai' | 'whatif' | 'actions'>('overview');
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  
  // Assign Action Form State
  const [actionTitle, setActionTitle] = useState<string>('');
  const [actionType, setActionType] = useState<CaseAction['actionType']>('Legal Verification');
  const [assignedOfficer, setAssignedOfficer] = useState<string>('');
  const [assignedPriority, setAssignedPriority] = useState<CaseAction['priority']>('CRITICAL');
  const [actionDueDate, setActionDueDate] = useState<string>('');
  const [actionNotes, setActionNotes] = useState<string>('');

  // What-If Simulation Sandbox State
  const readiness = useConstructionReadiness();
  const [showVerifyForm, setShowVerifyForm] = useState<boolean>(false);
  const [verifyNotes, setVerifyNotes] = useState<string>('');
  const [verifyPhoto, setVerifyPhoto] = useState<boolean>(false);
  const [simLitigation, setSimLitigation] = useState<boolean>(false);
  const [simMutation, setSimMutation] = useState<boolean>(false);
  const [simCompensation, setSimCompensation] = useState<boolean>(false);
  const [simDocVerification, setSimDocVerification] = useState<boolean>(false);

  // Exposure & Priority (Step 8C-B.4) — this parcel's own latest assessment,
  // fetched via exposureService.ts (never a direct fetch call). Declared
  // before the `!selectedParcel` early return below so this hook is called
  // unconditionally on every render, per the Rules of Hooks; the effect
  // itself no-ops when there is no selected parcel.
  const [parcelExposure, setParcelExposure] = useState<ExposureAssessmentWithContext | null>(null);
  const [exposureLoading, setExposureLoading] = useState<boolean>(false);
  const [exposureError, setExposureError] = useState<string | null>(null);
  const selectedParcelId = selectedParcel?.id;

  const loadParcelExposure = useCallback((parcelId: string, signal: { cancelled: boolean }) => {
    setExposureLoading(true);
    setExposureError(null);
    getParcelLatestExposure(parcelId)
      .then((result) => {
        if (!signal.cancelled) setParcelExposure(result);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setParcelExposure(null);
        setExposureError(
          err instanceof Error ? err.message : 'Could not reach the KSHETRA exposure & priority service.'
        );
      })
      .finally(() => {
        if (!signal.cancelled) setExposureLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedParcelId) return;
    const signal = { cancelled: false };
    loadParcelExposure(selectedParcelId, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [selectedParcelId, loadParcelExposure]);

  // Statutory Clock (frontend-completion gap close) — this parcel's own
  // clock(s), fetched via legalService.ts (GET /api/legal/clocks, never a
  // direct fetch). Same declared-before-early-return / cancellation pattern
  // as the exposure fetch above, since this hook must run unconditionally.
  const [parcelClocks, setParcelClocks] = useState<StatutoryClockResult[] | null>(null);
  const [clocksLoading, setClocksLoading] = useState<boolean>(false);
  const [clocksError, setClocksError] = useState<string | null>(null);

  const loadParcelClocks = useCallback((parcelId: string, signal: { cancelled: boolean }) => {
    setClocksLoading(true);
    setClocksError(null);
    getParcelClocks(parcelId)
      .then((result) => {
        if (!signal.cancelled) setParcelClocks(result);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setParcelClocks(null);
        setClocksError(
          err instanceof Error ? err.message : 'Could not reach the KSHETRA statutory clock service.'
        );
      })
      .finally(() => {
        if (!signal.cancelled) setClocksLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedParcelId) return;
    const signal = { cancelled: false };
    loadParcelClocks(selectedParcelId, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [selectedParcelId, loadParcelClocks]);

  if (!selectedParcel) return null;

  const parcel = selectedParcel;
  const isHigh = parcel.riskLevel === 'high';
  const isMed = parcel.riskLevel === 'medium';

  // Compute what-if simulation dynamically
  const simulationResult = simulateWhatIfScenario(parcel, {
    resolveLitigation: simLitigation,
    clearMutationDispute: simMutation,
    expediteCompensation: simCompensation,
    completeDocVerification: simDocVerification
  });

  const parcelActions = actions.filter(a => a.parcelId === parcel.id);

  // The trained model works at project/case level, so this runs the PRIMARY
  // project-level prediction for the parcel's parent acquisition project — it is
  // not a per-parcel AI prediction.
  const handlePredict = async () => {
    setIsPredicting(true);
    try {
      await runProjectDelayPrediction();
      setActiveTabLocal('ai');
    } finally {
      setIsPredicting(false);
    }
  };

  const handleSync = async () => {
    await syncGovernmentDataForParcel(parcel.id);
  };

  const handleCreateActionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createNewAction({
      parcelId: parcel.id,
      surveyNumber: parcel.surveyNumber,
      title: actionTitle,
      actionType,
      assignedOfficer,
      assignedOfficerRole: 'CALA / Special LA Officer',
      priority: assignedPriority,
      status: 'In Progress',
      dueDate: actionDueDate,
      notes: actionNotes,
      targetDelayReductionMonths: parcel.potentialReductionMonths || 0
    });
    setShowAssignModal(false);
    setActiveTabLocal('actions');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-5xl w-full shadow-2xl text-slate-700 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">

        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-navy-900 border-b border-navy-800 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isHigh
                ? 'bg-red-500/15 border-red-400/40 text-red-300'
                : isMed
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
            }`}>
              <MapPin className="w-6 h-6" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-white">
                  Parcel {parcel.id} <span className="text-slate-400 font-mono text-base font-normal">({parcel.surveyNumber})</span>
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold tracking-wide uppercase ${
                  isHigh
                    ? 'bg-red-500/20 text-red-300 border border-red-400/40 animate-pulse'
                    : isMed
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                }`}>
                  {parcel.delayRiskScore}% Delay Risk ({parcel.riskLevel.toUpperCase()})
                </span>
                <span className="text-xs font-mono text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-400/30">
                  {parcel.ulpin}
                </span>
              </div>

              <div className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span><strong>Owner:</strong> {parcel.ownerName}</span>
                <span>•</span>
                <span><strong>Extent:</strong> {parcel.areaAcres} Acres</span>
                <span>•</span>
                <span><strong>Location:</strong> {parcel.village}, Taluk {parcel.taluk}, {parcel.district}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-lg bg-white/8 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 transition-colors"
              title="Print / Save PDF Dossier"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedParcel(null)}
              className="p-2 rounded-lg bg-white/8 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs & Action Bar */}
        <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTabLocal('overview')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'overview' ? 'bg-blue-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              Overview
            </button>

            <button
              onClick={() => setActiveTabLocal('govrecords')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'govrecords' ? 'bg-blue-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Building className={`w-3.5 h-3.5 ${activeTab === 'govrecords' ? 'text-white' : 'text-blue-600'}`} />
              <span>Bhoomi / Land Records</span>
            </button>

            <button
              onClick={() => setActiveTabLocal('ecourts')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'ecourts' ? 'bg-blue-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Gavel className={`w-3.5 h-3.5 ${activeTab === 'ecourts' ? 'text-white' : 'text-red-500'}`} />
              <span>e-Courts Legal Status</span>
              {parcel.courtCase && (
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTabLocal('ai')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'ai' ? 'bg-blue-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Cpu className={`w-3.5 h-3.5 ${activeTab === 'ai' ? 'text-white' : 'text-indigo-600'}`} />
              <span>Project AI Prediction</span>
            </button>

            <button
              onClick={() => setActiveTabLocal('whatif')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'whatif' ? 'bg-blue-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Sliders className={`w-3.5 h-3.5 ${activeTab === 'whatif' ? 'text-white' : 'text-purple-600'}`} />
              <span>What-If Sandbox</span>
            </button>

            <button
              onClick={() => setActiveTabLocal('actions')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'actions' ? 'bg-blue-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <UserCheck className={`w-3.5 h-3.5 ${activeTab === 'actions' ? 'text-white' : 'text-emerald-600'}`} />
              <span>Case Actions ({parcelActions.length})</span>
            </button>
          </div>

          {/* Quick Trigger Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg border border-purple-200 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Simulating…' : 'Fetch Gov Data (Demo)'}</span>
            </button>

            <button
              onClick={handlePredict}
              disabled={isPredicting || isProjectPredicting}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
              title={`Runs the project-level model for ${project.name} (the trained model is project/case level, not per parcel)`}
            >
              <Cpu className={`w-3.5 h-3.5 ${(isPredicting || isProjectPredicting) ? 'animate-spin' : ''}`} />
              <span>{(isPredicting || isProjectPredicting) ? 'Analyzing…' : 'Run Project Prediction'}</span>
            </button>

            <button
              onClick={() => setShowAssignModal(true)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Assign Officer</span>
            </button>
          </div>
        </div>

        {/* Simulated government-sync progress log (demo, if syncing) */}
        {isSyncing && syncProgressLogs.length > 0 && (
          <div className="px-5 py-3 bg-purple-50 border-b border-purple-200 text-xs space-y-1">
            <div className="font-bold text-purple-700 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Simulated Integration — Demo: mock sync of Tamil Nilam, Bhoomi, e-Courts & Bhuvan GIS...</span>
            </div>
            {syncProgressLogs.map((step, idx) => (
              <div key={idx} className="text-slate-600 text-[11px] font-mono flex items-center gap-2">
                <span className="text-purple-600 font-semibold">[{step.source}]</span>
                <span>{step.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-slate-700">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <CaseStoryStrip parcel={parcel} clocks={parcelClocks} exposure={parcelExposure} actions={parcelActions} readiness={readiness} />

              {/* Top Contained Notice for Risk / Litigation */}
              {isHigh && (
                <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  parcel.courtRecord?.interimInjunction || parcel.courtCaseStatus?.toLowerCase().includes('stay')
                    ? 'bg-red-50/70 border-red-200 text-red-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                      parcel.courtRecord?.interimInjunction || parcel.courtCaseStatus?.toLowerCase().includes('stay')
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`} />
                    <div>
                      <div className="font-bold text-xs">
                        {parcel.courtRecord?.interimInjunction || parcel.courtCaseStatus?.toLowerCase().includes('stay')
                          ? 'ACTIVE CIVIL STAY ORDER DETECTED — Urgent legal vacation required'
                          : `HIGH DELAY RISK ATTENTION — Catalogued indicator: ${parcel.delayRiskScore}%`}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                        Suggested priority action: <strong className="text-slate-800">{parcel.recommendedAction}</strong>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTabLocal('ai')}
                    className="px-3 py-1.5 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors self-start sm:self-auto"
                  >
                    View Project AI Forecast
                  </button>
                </div>
              )}

              {/* Statutory Clock — a SEPARATE, deterministic engine result
                  (backend/legal, read-only) from the AI prediction shown in
                  the "Project AI Prediction" tab. Every date/day-count here
                  is rendered verbatim from the backend's own computed clock;
                  no legal calculation happens in the frontend. */}
              <div>
                <SectionHeading
                  icon={Clock}
                  color="indigo"
                  title="Statutory Clock"
                  subtitle="Deterministic deadline engine for this parcel's case — separate from the AI prediction"
                  className="mb-2.5"
                />
                <StatutoryClockCard
                  clocks={parcelClocks}
                  loading={clocksLoading}
                  error={clocksError}
                  onRetry={() => selectedParcelId && loadParcelClocks(selectedParcelId, { cancelled: false })}
                />
              </div>

              {/* Grid of Key Attributes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3.5 bg-white rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Acquisition Stage</div>
                  <div className="font-bold text-slate-900 text-sm mt-1">{parcel.stage}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Notified: {parcel.notificationDate}</div>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Compensation Status</div>
                  <div className="font-bold text-amber-700 text-sm mt-1">{parcel.compensationStatus}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Est. Value: ₹{parcel.estimatedCompensationCrores} Crores</div>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500">e-Courts Litigation</div>
                  <div className="font-bold text-red-600 text-sm mt-1 flex items-center gap-1">
                    <Gavel className="w-3.5 h-3.5" />
                    <span>{parcel.courtCaseStatus}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{parcel.courtRecord?.courtName || 'None'}</div>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Catalogued Delay Window</div>
                  <div className="font-bold text-blue-600 text-sm mt-1">{parcel.predictedDelayRange}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Catalogued reduction target: ~{parcel.potentialReductionMonths} mos</div>
                </div>
              </div>

              {/* Cadastral & Ownership Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-blue-600" />
                    <span>Cadastral Survey & Geometry</span>
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Survey / Sub-division:</span>
                      <span className="font-mono font-bold text-slate-900">{parcel.surveyNumber}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">14-Digit ULPIN:</span>
                      <span className="font-mono text-blue-600">{parcel.ulpin}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Total Area / Extent:</span>
                      <span className="font-medium text-slate-900">{parcel.areaAcres} Acres ({parcel.areaSqMeters.toLocaleString()} m²)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">GIS Center Coordinates:</span>
                      <span className="font-mono text-slate-600">{parcel.gpsCoordinates.lat}° N, {parcel.gpsCoordinates.lng}° E</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Offset to Highway Centerline:</span>
                      <span className="font-medium text-amber-700">14.5 Meters (Direct Conflict)</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Building className="w-4 h-4 text-purple-600" />
                    <span>Ownership & Mutation Records</span>
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Registered Co-sharers:</span>
                      <span className="font-bold text-slate-900">{parcel.coOwnerCount} Heirs</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Mutation Status:</span>
                      <span className={`font-semibold ${parcel.mutationStatus === 'Disputed' ? 'text-red-600' : 'text-slate-600'}`}>
                        {parcel.mutationStatus} ({parcel.lastMutationYearsAgo} years unmutated)
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Land Title Dispute:</span>
                      <span className="font-medium text-red-600">{parcel.ownershipDispute}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Document Verification:</span>
                      <span className="font-medium text-amber-700">{parcel.documentStatus}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Record Confidence:</span>
                      <span className="font-bold text-amber-700">{parcel.recordFreshnessScore}% Freshness ({parcel.recordConfidence})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Co-sharers Names List */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs font-bold text-slate-600 mb-2">Registered Legal Heirs & Co-sharers:</div>
                <div className="flex flex-wrap gap-2">
                  {parcel.coOwners.map((owner, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs">
                      {owner}
                    </span>
                  ))}
                </div>
              </div>

              {/* Field Verification — Parcel.fieldVerified / fieldVerificationNotes /
                  evidencePhotoAttached / fieldVerifiedAt already existed on the type
                  but were never rendered anywhere in the app before this. */}
              <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                parcel.fieldVerified ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
              }`}>
                <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${parcel.fieldVerified ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-slate-800">
                    Field Verification: {parcel.fieldVerified ? 'Verified' : 'Not yet field-verified'}
                  </div>
                  <div className="text-slate-500 mt-0.5 space-y-0.5">
                    {parcel.fieldVerified ? (
                      <>
                        <div>
                          {parcel.fieldVerifiedAt ? `Verified on ${parcel.fieldVerifiedAt}` : 'Verification date not recorded'}
                          {' · '}
                          Evidence photo: {parcel.evidencePhotoAttached ? 'Attached' : 'Not attached'}
                        </div>
                        {parcel.fieldVerificationNotes && (
                          <div className="italic text-slate-600">"{parcel.fieldVerificationNotes}"</div>
                        )}
                      </>
                    ) : (
                      <div>No field officer has confirmed this parcel's on-ground status yet.</div>
                    )}
                  </div>

                  {showVerifyForm ? (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await recordFieldVerification(parcel.id, { verified: true, notes: verifyNotes, evidencePhotoAttached: verifyPhoto });
                        setShowVerifyForm(false);
                      }}
                    >
                      <label htmlFor="verify-notes" className="block font-semibold text-slate-700">Verification notes</label>
                      <textarea
                        id="verify-notes"
                        value={verifyNotes}
                        onChange={(e) => setVerifyNotes(e.target.value)}
                        rows={2}
                        required
                        placeholder="What was confirmed on the ground (boundary, occupant, encumbrance)?"
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      />
                      <label className="flex items-center gap-2 text-slate-700">
                        <input type="checkbox" checked={verifyPhoto} onChange={(e) => setVerifyPhoto(e.target.checked)} className="w-4 h-4 rounded border-slate-300" />
                        <span>Photo evidence is on file (reference flag only; this app does not store image files)</span>
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium">Save verification</button>
                        <button type="button" onClick={() => setShowVerifyForm(false)} className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setVerifyNotes(parcel.fieldVerificationNotes || ''); setVerifyPhoto(!!parcel.evidencePhotoAttached); setShowVerifyForm(true); }}
                        className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg font-medium"
                      >
                        {parcel.fieldVerified ? 'Update verification' : 'Record field verification'}
                      </button>
                      {parcel.fieldVerified && (
                        <button
                          type="button"
                          onClick={() => recordFieldVerification(parcel.id, { verified: false })}
                          className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-rose-50 text-rose-800 rounded-lg font-medium"
                        >
                          Clear verification
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BHOOMI / REVENUE RECORDS */}
          {activeTab === 'govrecords' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-blue-800">
                    Tamil Nilam &amp; Bhoomi Revenue Records — Simulated Integration (Demo)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sample land-registry record. Not a live government feed — Tamil Nilam / Bhoomi Rashi are proposed integration points.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  STATUS: SIMULATED
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2.5">
                  <div className="font-bold text-slate-700 text-xs border-b border-slate-200 pb-1.5">
                    Patta / Chitta & Jamabandi Extract
                  </div>
                  <div className="flex justify-between"><span className="text-slate-500">Patta Number:</span> <span className="font-mono font-bold text-slate-900">{parcel.revenueRecord?.pattaNumber ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Khata Number:</span> <span className="font-mono text-slate-900">{parcel.revenueRecord?.khataNumber ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Land Classification:</span> <span className="text-amber-700 font-semibold">{parcel.revenueRecord?.landClassification ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sub-Registrar Jurisdiction:</span> <span className="text-slate-700">{parcel.revenueRecord?.subRegistrarOffice ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Last Jamabandi Update:</span> <span className="text-slate-600">{parcel.revenueRecord?.lastJamabandiDate ?? '—'}</span></div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2.5">
                  <div className="font-bold text-slate-700 text-xs border-b border-slate-200 pb-1.5">
                    Valuation & Encumbrance Certificate (EC)
                  </div>
                  <div className="flex justify-between"><span className="text-slate-500">Guideline Value (per Acre):</span> <span className="font-mono font-bold text-emerald-600">{parcel.revenueRecord ? `₹${parcel.revenueRecord.guidelineValuePerAcre.toLocaleString('en-IN')}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Total Statutory Valuation:</span> <span className="font-mono font-bold text-slate-900">{parcel.revenueRecord ? `₹${(parcel.revenueRecord.guidelineValuePerAcre * parcel.areaAcres).toLocaleString('en-IN')}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Encumbrance Status:</span> <span className="text-red-600 font-semibold">{parcel.revenueRecord?.encumbranceStatus ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sample record timestamp:</span> <span className="font-mono text-slate-600">{parcel.lastSyncedAt ?? '—'}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: E-COURTS LEGAL STATUS */}
          {activeTab === 'ecourts' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-red-800 flex items-center gap-2">
                    <Gavel className="w-5 h-5 text-red-600" />
                    <span>e-Courts CIS 3.0 Case Dossier — Simulated Integration (Demo)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sample case data. NJDG / e-Courts CIS 3.0 is a proposed integration point — not connected.
                  </p>
                </div>
                {parcel.courtCase && (
                  <span className={`px-2.5 py-1 rounded text-xs font-bold text-white ${
                    parcel.courtRecord?.interimInjunction ? 'bg-red-600 animate-pulse' : 'bg-amber-600'
                  }`}>
                    {parcel.courtRecord?.interimInjunction
                      ? 'STAY ORDER ACTIVE'
                      : (parcel.courtRecord?.caseStatus ?? parcel.courtCaseStatus).toUpperCase()}
                  </span>
                )}
              </div>

              {parcel.courtRecord ? (
                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Case Number & Type</div>
                      <div className="font-bold text-sm text-slate-900 font-mono mt-0.5">{parcel.courtRecord.caseNumber}</div>
                      <div className="text-[11px] text-slate-600">{parcel.courtRecord.caseType}</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">16-Digit CNR Number</div>
                      <div className="font-bold text-sm text-blue-600 font-mono mt-0.5">{parcel.courtRecord.cnrNumber}</div>
                      <div className="text-[11px] text-slate-500">{parcel.courtRecord.courtName}</div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Petitioner(s)</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{parcel.courtRecord.petitioner}</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Respondent(s)</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{parcel.courtRecord.respondent}</div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-white rounded-lg border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-600 text-xs">Prayer / Civil Suit Grounds:</div>
                    <p className="text-slate-500 leading-relaxed italic">
                      "{parcel.courtRecord.prayer}"
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px]">
                      <span className="text-amber-700 font-semibold">Next Scheduled Hearing: {parcel.courtRecord.nextHearingDate}</span>
                      <span className={parcel.courtRecord.interimInjunction ? 'text-red-600 font-bold' : 'text-slate-600 font-bold'}>
                        Interim Injunction: {parcel.courtRecord.interimInjunction ? 'YES' : 'NO'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-medium text-xs text-slate-600">No active litigation registered in e-Courts for this parcel.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PROJECT-LEVEL AI PREDICTION (LightGBM + SHAP + Cox) */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* Scope notice: this is a PROJECT/CASE-level prediction, not per parcel */}
              <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 leading-relaxed">
                <strong>Project-Level Delay Prediction.</strong> The trained model works at acquisition
                project/case level, so this result is for the whole project —{' '}
                <strong>{project.name}</strong> ({project.code}) — that Parcel {parcel.id} belongs to. It is
                <strong> not</strong> a single-parcel prediction. Use “Run Project Prediction” in the top bar to refresh.
              </div>

              {/* Backend failure notice (existing values kept) + retry */}
              {projectPredictionError && !projectPrediction?.isRealApiPrediction && (
                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <div className="flex items-start gap-2.5 flex-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{projectPredictionError}</span>
                  </div>
                  <button
                    onClick={handlePredict}
                    disabled={isPredicting || isProjectPredicting}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs font-bold rounded-lg shrink-0 self-start sm:self-auto"
                  >
                    {(isPredicting || isProjectPredicting) ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              )}

              {/* No prediction yet */}
              {!projectPrediction && !projectPredictionError && (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <Cpu className="w-6 h-6 text-slate-400 mx-auto" />
                  <p>No project-level prediction has been run yet for {project.name}.</p>
                  <button
                    onClick={handlePredict}
                    disabled={isPredicting || isProjectPredicting}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg"
                  >
                    {(isPredicting || isProjectPredicting) ? 'Analyzing…' : 'Run Project Prediction'}
                  </button>
                </div>
              )}

              {projectPrediction && projectPrediction.isRealApiPrediction && (
                <>
                  {/* Prediction Score Card */}
                  <div className="p-5 rounded-2xl bg-navy-900 border border-navy-800 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-blue-400" />
                          <span>AI Prediction Engine · LightGBM + SHAP + Cox</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30">
                            {projectPrediction.predictionMode === 'demo-fallback' ? 'Demo fallback · synthetic data' : 'Local engine · synthetic data'}
                          </span>
                        </div>
                        <h3 className="text-2xl font-black text-white mt-2">
                          Project Delay Probability:{' '}
                          <span className={
                            projectPrediction.riskLevel === 'high' ? 'text-red-300' : projectPrediction.riskLevel === 'medium' ? 'text-amber-300' : 'text-emerald-300'
                          }>
                            {(projectPrediction.delayProbability * 100).toFixed(1)}%
                          </span>
                        </h3>
                        <p className="text-xs text-white/70 mt-1 max-w-xl leading-relaxed">
                          Risk Score: <strong className="text-white">{projectPrediction.delayRiskScore}/100</strong>
                          {projectPrediction.survivalAnalysis && (
                            <> {' '}&bull; Cox relative hazard: <strong className="text-white">{projectPrediction.survivalAnalysis.partial_hazard_ratio}×</strong></>
                          )}
                          {' '}&bull; aggregated from{' '}
                          <strong className="text-white">{projectPrediction.modelInput.parcelsAnalyzed}</strong> parcel record(s).
                          {' '}The model gives a delay probability, not a delay duration.
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] uppercase font-bold text-white/50">Risk Classification</div>
                        <div className={`text-xl font-black ${
                          projectPrediction.riskLevel === 'high' ? 'text-red-300' : projectPrediction.riskLevel === 'medium' ? 'text-amber-300' : 'text-emerald-300'
                        }`}>
                          {projectPrediction.riskLevel.toUpperCase()}
                        </div>
                        <div className="text-[10px] text-white/40 mt-0.5">Generated {projectPrediction.generatedAt}</div>
                      </div>
                    </div>
                  </div>

                  {/* Explainable AI (SHAP) Contribution Breakdown */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-700" />
                        <span>Explainable AI (SHAP): Top Contributing Factors</span>
                      </h3>
                      <span className="text-[11px] text-slate-500 font-mono">Project SHAP Attribution</span>
                    </div>

                    <div className="space-y-2.5">
                      {projectPrediction.shapFactors.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                          No SHAP feature attribution returned by the model.
                        </div>
                      ) : (
                        projectPrediction.shapFactors.map((shap, idx) => (
                          <div key={idx} className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5 max-w-xl">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${
                                  shap.severity === 'HIGH' ? 'bg-red-500' : shap.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'
                                }`}></span>
                                <span className="font-bold text-xs text-slate-900">{shap.factor}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 leading-relaxed pl-4">
                                {shap.description}
                              </p>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                              <div className="text-right">
                                <span className={`text-sm font-black font-mono ${
                                  shap.impactPercent > 0 ? (shap.severity === 'HIGH' ? 'text-red-600' : 'text-amber-700') : 'text-emerald-600'
                                }`}>
                                  {shap.impactPercent > 0 ? `+${shap.impactPercent}%` : `${shap.impactPercent}%`}
                                </span>
                                <div className="text-[9px] uppercase font-bold text-slate-500">Contribution share</div>
                                {shap.shapValue != null && (
                                  <div className="text-[9px] text-slate-400 font-mono">raw {shap.shapValue >= 0 ? '+' : ''}{shap.shapValue.toFixed(2)} log-odds</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 italic">
                      * % = each factor's share of the shown factors' combined |SHAP| (LightGBM log-odds attribution).
                      Sign = direction. Not a probability-point change.
                      {projectPrediction.aggregationNotes.length > 0 && ` ${projectPrediction.aggregationNotes.join(' ')}`}
                    </div>
                  </div>

                  {/* Cox Proportional Hazards Survival Analysis Component */}
                  {projectPrediction.survivalAnalysis && (
                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-purple-600" />
                            <h4 className="font-bold text-sm text-slate-900">Cox Proportional Hazards: Project Delay-Free Trajectory</h4>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Probability the project remains on track without significant delay over elapsed milestones
                          </p>
                        </div>
                        <div>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
                            Relative Hazard: {projectPrediction.survivalAnalysis.partial_hazard_ratio}x
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="text-[10px] uppercase font-bold text-slate-400">Hazard Tier</div>
                          <div className="font-bold text-slate-900 mt-0.5">{projectPrediction.survivalAnalysis.hazard_tier}</div>
                          {projectPrediction.survivalAnalysis.time_analysis?.elapsed_notification_age_months != null && (
                            <div className="text-[10px] text-slate-500 mt-0.5">Elapsed since notification: {projectPrediction.survivalAnalysis.time_analysis.elapsed_notification_age_months} mo</div>
                          )}
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="text-[10px] uppercase font-bold text-slate-400">Model Median Delay-Free (from notification)</div>
                          <div className="font-bold text-slate-900 mt-0.5">{projectPrediction.survivalAnalysis.estimated_median_delay_free_milestone}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Absolute-from-origin, not “months remaining”.</div>
                        </div>
                      </div>

                      {projectPrediction.survivalAnalysis.time_analysis?.remaining_time_note && (
                        <div className="text-[10px] text-slate-500 italic">{projectPrediction.survivalAnalysis.time_analysis.remaining_time_note}</div>
                      )}

                      {projectPrediction.survivalAnalysis.delay_free_survival_curve && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-slate-700">S(t) — model probability of staying delay-free through <em>t</em> elapsed months since notification:</div>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {Object.entries(projectPrediction.survivalAnalysis.delay_free_survival_curve).map(([key, milestone]) => (
                              <div key={key} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                <div className="text-[10px] text-slate-500 font-semibold">Month {milestone.elapsed_months}</div>
                                <div className={`text-base font-black mt-0.5 ${
                                  milestone.delay_free_probability >= 0.70 ? 'text-emerald-600' :
                                  milestone.delay_free_probability >= 0.40 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {milestone.delay_free_percent}
                                </div>
                                <div className="text-[9px] text-slate-400 mt-0.5">Delay-Free</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-2.5 bg-slate-50 rounded-xl text-[11px] text-slate-500 italic">
                        * {projectPrediction.survivalAnalysis.non_completion_notice}
                      </div>
                    </div>
                  )}

                  {/* Executive Summary */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="font-bold text-xs text-slate-600 uppercase tracking-wider">Executive Decision Insight</div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {projectPrediction.aiExplanation}
                    </p>
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                      Institutional Demo Notice: Prototype decision-support model trained on synthetic benchmark data. Not certified for official judicial or statutory awards.
                    </div>
                  </div>
                </>
              )}

              {/* Exposure & Priority (Step 8C-B.4) — a SEPARATE, deterministic
                  rule-based result (statutory clock -> blocker -> exposure ->
                  priority -> owner/action), never merged into the AI
                  prediction score above. This section does not depend on
                  projectPrediction existing — it renders whenever this
                  parcel has its own Exposure & Priority engine result. */}
              <div className="pt-2 border-t border-slate-200">
                <SectionHeading
                  icon={ShieldAlert}
                  color="indigo"
                  title="Blockers, Evidence & Owner"
                  subtitle="B1–B4 blockers from the blocker engine, with evidence and the responsible owner"
                  className="mb-3"
                />
                <ParcelBlockersCard parcelId={parcel.id} compact />
              </div>

              <div className="pt-2 border-t border-slate-200">
                <SectionHeading
                  icon={ListChecks}
                  color="indigo"
                  title="Exposure & Priority Assessment"
                  subtitle="Deterministic engine output for this parcel — separate from the AI prediction above"
                  className="mb-3"
                />
                <ExposurePriorityCard
                  assessment={parcelExposure}
                  loading={exposureLoading}
                  error={exposureError}
                  onRetry={() => selectedParcelId && loadParcelExposure(selectedParcelId, { cancelled: false })}
                  emptyMessage="No Exposure & Priority assessment computed for this case yet."
                />
              </div>
            </div>
          )}

          {/* TAB 5: WHAT-IF SCENARIO SIMULATION SANDBOX */}
          {activeTab === 'whatif' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                <h3 className="font-bold text-sm text-purple-800 flex items-center gap-2">
                  <Sliders className="w-4 h-4" />
                  <span>Interactive What-If Scenario Sandbox</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Test the impact of targeted administrative and legal interventions on delay risk and project completion timeline.
                </p>
              </div>

              {/* Interactive Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="p-3.5 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer transition-colors">
                  <div>
                    <div className="font-bold text-xs text-slate-900">Vacate Court Stay Order</div>
                    <div className="text-[10px] text-slate-500">File counter-affidavit & deposit in LA-RA</div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={simLitigation}
                    onChange={(e) => setSimLitigation(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded bg-white border-slate-300"
                  />
                </label>

                <label className="p-3.5 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer transition-colors">
                  <div>
                    <div className="font-bold text-xs text-slate-900">Special Lok Adalat Partition Settlement</div>
                    <div className="text-[10px] text-slate-500">Consensual share deed among 5 co-heirs</div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={simMutation}
                    onChange={(e) => setSimMutation(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded bg-white border-slate-300"
                  />
                </label>

                <label className="p-3.5 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer transition-colors">
                  <div>
                    <div className="font-bold text-xs text-slate-900">Fast-Track Compensation Disbursal</div>
                    <div className="text-[10px] text-slate-500">Release 100% award into designated accounts</div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={simCompensation}
                    onChange={(e) => setSimCompensation(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded bg-white border-slate-300"
                  />
                </label>

                <label className="p-3.5 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer transition-colors">
                  <div>
                    <div className="font-bold text-xs text-slate-900">Doorstep Document Verification</div>
                    <div className="text-[10px] text-slate-500">Deploy Special Revenue Inspector for KYC</div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={simDocVerification}
                    onChange={(e) => setSimDocVerification(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded bg-white border-slate-300"
                  />
                </label>
              </div>

              {/* Simulation Comparison Result */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold text-slate-500 uppercase">Simulated Impact Comparison</div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">SCENARIO — LOCAL HEURISTIC</span>
                </div>
                <p className="text-[10px] text-slate-500 -mt-2">
                  Rule-based what-if estimator (not the ML model). Delay-month figures are the catalogued
                  baseline and a heuristic scenario value, for discussion only.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-white rounded-xl">
                    <div className="text-[10px] text-slate-500">Current Risk</div>
                    <div className="text-lg font-black text-red-600">{parcel.delayRiskScore}%</div>
                  </div>

                  <div className="p-3 bg-white rounded-xl">
                    <div className="text-[10px] text-slate-500">Simulated Risk</div>
                    <div className={`text-lg font-black ${
                      simulationResult.delayRiskScore < 40 ? 'text-emerald-600' : simulationResult.delayRiskScore < 70 ? 'text-amber-700' : 'text-red-600'
                    }`}>
                      {simulationResult.delayRiskScore}%
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl">
                    <div className="text-[10px] text-slate-500">Catalogued Delay</div>
                    <div className="text-lg font-black text-slate-900">{parcel.predictedDelayMonths} Mos</div>
                  </div>

                  <div className="p-3 bg-white rounded-xl">
                    <div className="text-[10px] text-slate-500">Heuristic Scenario</div>
                    <div className="text-lg font-black text-emerald-600">{simulationResult.predictedDelayMonths ?? '—'} Mos</div>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center justify-between">
                  <span>Scenario timeline delta: <strong>{+(parcel.predictedDelayMonths - (simulationResult.predictedDelayMonths ?? parcel.predictedDelayMonths)).toFixed(1)} Months</strong></span>
                  <span className="font-bold uppercase tracking-wider text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                    {simulationResult.riskLevel.toUpperCase()} RISK
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: CASE ACTIONS & DISPATCH */}
          {activeTab === 'actions' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Active Corrective Actions for {parcel.id}</h3>
                  <p className="text-xs text-slate-500">Case assignments and progress tracking for CALA and field officers</p>
                </div>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <span>+ Create Action</span>
                </button>
              </div>

              {parcelActions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl space-y-2">
                  <UserCheck className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs text-slate-500">No corrective actions assigned yet for this parcel.</p>
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-white text-blue-600 text-xs font-semibold rounded-lg"
                  >
                    Assign Officer to Start Action
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {parcelActions.map(action => (
                    <div key={action.id} className="p-4 bg-white rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">{action.title}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              action.priority === 'CRITICAL' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}>
                              {action.priority}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Assigned to: <strong className="text-slate-700">{action.assignedOfficer}</strong> (Due: {action.dueDate})
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                            action.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : action.status === 'In Progress' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {action.status}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        {action.notes}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                        <span className="text-emerald-600 font-medium">Target Reduction: -{action.targetDelayReductionMonths} Mos</span>
                        <div className="flex items-center gap-2">
                          {action.status !== 'Completed' && (
                            <>
                              {action.status === 'Pending' && (
                                <button
                                  onClick={() => updateActionStatus(action.id, 'In Progress')}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded text-[11px]"
                                >
                                  Start Action
                                </button>
                              )}
                              <button
                                onClick={() => updateActionStatus(action.id, 'Completed', 'Legal verification decree submitted.')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-[11px]"
                              >
                                Mark Completed
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs text-slate-500">
          <div>
            Demo data snapshot: <span className="font-mono text-slate-700">{parcel.lastSyncedAt || '2026-08-23'}</span> <span className="text-slate-400">· synthetic record</span>
          </div>
          <button
            onClick={() => setSelectedParcel(null)}
            className="px-4 py-1.5 bg-slate-100 hover:bg-white text-slate-700 rounded-lg font-medium"
          >
            Close Dossier
          </button>
        </div>

      </div>

      {/* Action Assignment Sub-Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-60 bg-navy-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 shadow-2xl text-slate-700 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span>Create & Assign Case Action for {parcel.id}</span>
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleCreateActionSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Action Title / Directive</label>
                <input 
                  type="text"
                  value={actionTitle}
                  onChange={(e) => setActionTitle(e.target.value)}
                  placeholder="e.g. File petition to vacate stay"
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Action Category</label>
                  <select 
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  >
                    <option value="Legal Verification">Legal Verification</option>
                    <option value="Fast-Track Compensation">Fast-Track Compensation</option>
                    <option value="Lok Adalat Settlement">Lok Adalat Settlement</option>
                    <option value="Joint Mutation Camp">Joint Mutation Camp</option>
                    <option value="Field Geo-Survey">Field Geo-Survey</option>
                    <option value="Collector Hearing">Collector Hearing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Assigned Officer</label>
                  <input 
                    type="text"
                    value={assignedOfficer}
                    onChange={(e) => setAssignedOfficer(e.target.value)}
                    placeholder="Officer name / designation"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Priority Level</label>
                  <select 
                    value={assignedPriority}
                    onChange={(e) => setAssignedPriority(e.target.value as any)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Target Due Date</label>
                  <input 
                    type="date"
                    value={actionDueDate}
                    onChange={(e) => setActionDueDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Action Instructions & Notes</label>
                <textarea 
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-white text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg"
                >
                  Dispatch Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
