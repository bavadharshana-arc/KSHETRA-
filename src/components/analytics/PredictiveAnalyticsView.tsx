import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Sparkles, 
  Sliders, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Play, 
  RotateCcw, 
  HelpCircle,
  FileText,
  Building,
  Gavel
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { checkBackendHealth } from '../../services/mlApiService';

export const PredictiveAnalyticsView: React.FC = () => {
  const {
    parcels,
    project,
    runDelayPrediction,
    openParcelDetail,
    setActiveTab,
    runProjectDelayPrediction,
    projectPrediction,
    isProjectPredicting,
    projectPredictionError,
  } = useApp();

  // Highest-risk corridor section from the project record (no hardcoded zone).
  const topSection = [...(project.corridorSections || [])].sort((x, y) => y.riskScore - x.riskScore)[0] || null;

  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<number>(0);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  // Real backend health: reflects the actual /health response instead of a
  // hardcoded "Online" label. `backendMode` distinguishes the trained model
  // path from the deterministic demo fallback.
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [backendMode, setBackendMode] = useState<'live-model' | 'demo-fallback' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      const { isHealthy, mode } = await checkBackendHealth();
      if (!cancelled) {
        setBackendStatus(isHealthy ? 'online' : 'offline');
        setBackendMode(isHealthy ? mode ?? 'live-model' : null);
      }
    };
    ping();
    const id = setInterval(ping, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  const [selectedSimSection, setSelectedSimSection] = useState<string>('sec-2');
  
  // Corridor What-if toggles
  const [lokAdalatIntervention, setLokAdalatIntervention] = useState<boolean>(true);
  const [sec3HEscrowFastTrack, setSec3HEscrowFastTrack] = useState<boolean>(true);
  const [dgpsSurveyReconciliation, setDgpsSurveyReconciliation] = useState<boolean>(false);

  // Illustrative reference set, shown only until a real project-level prediction
  // has produced live SHAP attributions.
  const illustrativeShapData = [
    { factor: 'Civil Stay / Injunction', importance: 38, color: '#EF4444' },
    { factor: 'Unmutated Succession Lag', importance: 26, color: '#F59E0B' },
    { factor: 'Co-owner Heir Count (>3)', importance: 18, color: '#F59E0B' },
    { factor: 'Compensation Multiplier Grievance', importance: 15, color: '#3B82F6' },
    { factor: 'DGPS Boundary Mismatch', importance: 11, color: '#10B981' },
    { factor: 'Inam / Trust Land Classification', importance: 9, color: '#8B5CF6' }
  ];

  const liveShap = projectPrediction?.isRealApiPrediction ? projectPrediction.shapFactors : null;
  const shapChartIsLive = !!(liveShap && liveShap.length > 0);
  const globalShapData = shapChartIsLive
    ? liveShap!.map((f) => ({
        factor: f.factor.length > 26 ? `${f.factor.slice(0, 24)}…` : f.factor,
        importance: Math.abs(f.impactPercent),
        color: f.severity === 'HIGH' ? '#EF4444' : f.severity === 'MEDIUM' ? '#F59E0B' : '#10B981',
      }))
    : illustrativeShapData;

  const handleRunProjectPrediction = async () => {
    await runProjectDelayPrediction();
  };

  const handleRunBatchModel = async () => {
    setIsBatchRunning(true);
    setBatchProgress(0);
    setBatchNotice(null);

    let failed = 0;
    for (let i = 0; i < parcels.length; i++) {
      // preserveOnFailure: if the backend is down, keep each parcel's existing
      // risk values instead of overwriting them with a 0 / LOW placeholder.
      const res = await runDelayPrediction(parcels[i].id, { preserveOnFailure: true });
      if (res.isRealApiPrediction === false) failed++;
      setBatchProgress(Math.round(((i + 1) / parcels.length) * 100));
      await new Promise(r => setTimeout(r, 120));
    }

    setIsBatchRunning(false);
    if (failed > 0) {
      setBatchNotice(
        `${failed} of ${parcels.length} parcels could not be scored — the prediction service was unavailable. Existing risk values were kept.`
      );
    }
  };

  // Compute Corridor Simulation Impact
  const baselineDelay = project.predictedDelayMonths; // 4.2
  let simulatedSavings = 0;
  if (lokAdalatIntervention) simulatedSavings += 1.8;
  if (sec3HEscrowFastTrack) simulatedSavings += 1.1;
  if (dgpsSurveyReconciliation) simulatedSavings += 0.5;

  const simulatedDelay = Math.max(0.6, +(baselineDelay - simulatedSavings).toFixed(1));
  const estimatedCostSavedCrores = +(simulatedSavings * 4.8).toFixed(1); // ₹4.8 Cr escalation saved per month delay avoided

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-semibold text-slate-900 tracking-tight">
              Predictive Delay & Explainable AI (XAI) Model
            </h1>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              AI Engine · LightGBM + SHAP + Cox
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Institutional AI engine forecasting corridor acquisition delays, litigation bottlenecks, and hazard trajectories.
          </p>
        </div>

        <button
          onClick={handleRunBatchModel}
          disabled={isBatchRunning}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-medium rounded-xl shadow-xs flex items-center gap-2 transition-colors"
          title="Indicative per-parcel drill-down scoring — not the official project prediction"
        >
          <Play className={`w-3.5 h-3.5 ${isBatchRunning ? 'animate-spin' : ''}`} />
          <span>{isBatchRunning ? `Scoring parcels (${batchProgress}%)...` : 'Score All Parcels (Indicative)'}</span>
        </button>
      </div>

      {/* PRIMARY: Project / Case-Level Delay Prediction */}
      <div className="rounded-2xl border border-indigo-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 bg-navy-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Cpu className="w-4 h-4 text-blue-300" />
              <h2 className="text-sm font-black tracking-tight">Project-Level Delay Prediction</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                Primary AI Output
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200 border border-white/15">
                Synthetic Demo POC
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-1 max-w-xl leading-relaxed">
              One prediction for the entire acquisition project — <strong className="text-white">{project.name}</strong>.
              Matches how the LightGBM &amp; Cox models were trained (one row = one whole case/project).
            </p>
          </div>
          <button
            onClick={handleRunProjectPrediction}
            disabled={isProjectPredicting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow flex items-center gap-2 transition-colors shrink-0"
          >
            <Cpu className={`w-3.5 h-3.5 ${isProjectPredicting ? 'animate-spin' : ''}`} />
            <span>{isProjectPredicting ? 'Running…' : projectPrediction ? 'Re-run Project Prediction' : 'Run Project Prediction'}</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Loading state */}
          {isProjectPredicting && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center gap-3">
              <Cpu className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
              <span>Contacting the prediction service and scoring {project.name}…</span>
            </div>
          )}

          {/* Failure state — clear message + retry, existing values untouched */}
          {!isProjectPredicting && projectPredictionError && (
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="flex items-start gap-2.5 flex-1">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {projectPredictionError}
                  {projectPrediction ? ' The previously shown values are unchanged.' : ''}
                </span>
              </div>
              <button
                onClick={handleRunProjectPrediction}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {!isProjectPredicting && !projectPrediction && !projectPredictionError && (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              No project-level prediction yet. Click <strong>Run Project Prediction</strong> to score
              {' '}{project.name} with the model.
            </div>
          )}

          {projectPrediction && projectPrediction.isRealApiPrediction && projectPrediction.predictionMode === 'demo-fallback' && (
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-[11px] text-blue-900 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>
                Showing a <strong>deterministic demo estimate</strong> — the trained model pipeline was
                unavailable for this run. The same inputs always produce the same estimate.
              </span>
            </div>
          )}

          {projectPrediction && projectPrediction.isRealApiPrediction && (
            <>
              {/* Headline */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Delay Probability</div>
                  <div className={`text-2xl font-black ${
                    projectPrediction.riskLevel === 'high' ? 'text-red-600' : projectPrediction.riskLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {(projectPrediction.delayProbability * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Risk Classification</div>
                  <div className={`text-2xl font-black ${
                    projectPrediction.riskLevel === 'high' ? 'text-red-600' : projectPrediction.riskLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {projectPrediction.riskLevel.toUpperCase()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Risk Score</div>
                  <div className="text-2xl font-black text-slate-900">{projectPrediction.delayRiskScore}<span className="text-sm text-slate-400">/100</span></div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Cox Relative Hazard</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {projectPrediction.survivalAnalysis ? `${projectPrediction.survivalAnalysis.partial_hazard_ratio}×` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {projectPrediction.survivalAnalysis?.hazard_tier?.split(' (')[0] ?? 'no hazard model'}
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 -mt-1">
                The classifier outputs a delay <strong>probability</strong>, not a delay duration — no
                “months of delay” figure is estimated. Time context is the Cox hazard trajectory below.
              </div>

              {/* SHAP */}
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>SHAP Top Contributing Factors (project aggregate)</span>
                </div>
                <div className="space-y-1.5">
                  {projectPrediction.shapFactors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${f.severity === 'HIGH' ? 'bg-red-500' : f.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
                        <span className="font-semibold text-slate-800 truncate">{f.factor}</span>
                      </div>
                      <span className={`font-mono font-bold shrink-0 ${f.impactPercent > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {f.impactPercent > 0 ? `+${f.impactPercent}` : f.impactPercent}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-slate-400 italic mt-1">
                  {projectPrediction.aggregationNotes[0]
                    ? projectPrediction.aggregationNotes.join(' ')
                    : 'SHAP reflects internal model attribution (correlation), not real-world causation.'}
                </div>
              </div>

              {/* Cox */}
              {projectPrediction.survivalAnalysis && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <TrendingDown className="w-3.5 h-3.5 text-purple-600" />
                    <span>Cox Proportional Hazards — Project Delay-Free Trajectory</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                    <div><span className="text-slate-500">Relative hazard:</span> <strong>{projectPrediction.survivalAnalysis.partial_hazard_ratio}×</strong></div>
                    <div className="truncate"><span className="text-slate-500">Tier:</span> <strong>{projectPrediction.survivalAnalysis.hazard_tier}</strong></div>
                    {projectPrediction.survivalAnalysis.time_analysis?.elapsed_notification_age_months != null && (
                      <div><span className="text-slate-500">Elapsed since notification:</span> <strong>{projectPrediction.survivalAnalysis.time_analysis.elapsed_notification_age_months} mo</strong></div>
                    )}
                    <div className="col-span-2 sm:col-span-3"><span className="text-slate-500">Model median delay-free:</span> <strong>{projectPrediction.survivalAnalysis.estimated_median_delay_free_milestone}</strong> <span className="text-slate-400">(from notification origin — not “months remaining”)</span></div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold">S(t) — model probability of staying delay-free through <em>t</em> elapsed months <em>since notification</em>:</div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Object.entries(projectPrediction.survivalAnalysis.delay_free_survival_curve).map(([k, m]) => (
                      <div key={k} className="p-1.5 bg-white rounded-lg border border-slate-100 text-center">
                        <div className="text-[9px] text-slate-500">Mo {m.elapsed_months}</div>
                        <div className={`text-xs font-black ${m.delay_free_probability >= 0.7 ? 'text-emerald-600' : m.delay_free_probability >= 0.4 ? 'text-amber-600' : 'text-red-600'}`}>
                          {m.delay_free_percent}
                        </div>
                      </div>
                    ))}
                  </div>
                  {projectPrediction.survivalAnalysis.time_analysis?.elapsed_past_model_median && (
                    <div className="text-[10px] text-amber-700">
                      This case has already elapsed past the model’s median delay-free point.
                      A “months remaining” figure is deliberately not estimated (see model notes).
                    </div>
                  )}
                </div>
              )}

              {/* Aggregated model input echo */}
              <details className="text-[11px] text-slate-600">
                <summary className="cursor-pointer font-semibold text-slate-700">Aggregated model input ({projectPrediction.modelInput.parcelsAnalyzed} parcel records)</summary>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                  <div>parcel_count: <strong>{projectPrediction.modelInput.parcel_count}</strong></div>
                  <div>litigation_cases: <strong>{projectPrediction.modelInput.litigation_cases}</strong></div>
                  <div>ownership_disputes: <strong>{projectPrediction.modelInput.ownership_disputes}</strong></div>
                  <div>document_issues: <strong>{projectPrediction.modelInput.document_issues}</strong></div>
                  <div>compensation_pending_pct: <strong>{projectPrediction.modelInput.compensation_pending_pct}</strong></div>
                  <div>notification_age_months: <strong>{projectPrediction.modelInput.notification_age_months}</strong></div>
                  <div className="col-span-2">acquisition_stage: <strong>{projectPrediction.modelInput.acquisition_stage}</strong></div>
                </div>
                {projectPrediction.sampleCoverage && (
                  <div className="mt-2 text-[10px] text-slate-500 not-italic">
                    Sample coverage: friction counts observed from{' '}
                    <strong>{projectPrediction.sampleCoverage.loadedParcelCount}</strong> loaded parcel
                    record(s) of <strong>{projectPrediction.sampleCoverage.projectParcelCount}</strong>{' '}
                    declared ({projectPrediction.sampleCoverage.sampleCoveragePct}% coverage). The loaded
                    subset does not represent every parcel; counts are not scaled up.
                  </div>
                )}
                {projectPrediction.inputDiagnostics?.available &&
                  projectPrediction.inputDiagnostics.any_out_of_training_range && (
                    <div className="mt-1.5 text-[10px] text-amber-700 not-italic">
                      Note: {Object.entries(projectPrediction.inputDiagnostics.features)
                        .filter(([, f]) => f.out_of_training_range)
                        .map(
                          ([name, f]) =>
                            `${name} = ${f.value} is outside the synthetic training range [${f.training_min}, ${f.training_max}]`
                        )
                        .join('; ')}
                      . The prediction still runs; treat it with extra caution (not a confidence score).
                    </div>
                  )}
              </details>

              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                Generated {projectPrediction.generatedAt} · LightGBM + SHAP + Cox via FastAPI. Trained on synthetic
                demonstration data — not an official government determination.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Batch outcome notice (e.g. backend unreachable during re-run) */}
      {batchNotice && (
        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{batchNotice}</span>
        </div>
      )}

      {/* Progress Bar (if running batch) */}
      {isBatchRunning && (
        <div className="p-4 bg-navy-900 rounded-2xl border border-navy-800 text-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-300">
            <span>Executing Delay Risk Inference Across Corridor Parcels...</span>
            <span className="font-mono">{batchProgress}%</span>
          </div>
          <div className="w-full bg-navy-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-150"
              style={{ width: `${batchProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Model Spec & Corridor Risk KPI Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Corridor Baseline Delay (catalogued)
          </div>
          <div className="text-2xl font-black text-slate-900">
            {project.predictedDelayMonths}
            {' '}<span className="text-sm font-semibold text-slate-500">Months</span>
          </div>
          <p className="text-xs text-slate-500">
            Static planning figure recorded for this corridor. The AI models produce a delay
            <strong> probability</strong> and a <strong>hazard trajectory</strong>, not a month estimate — see the
            project prediction above.
          </p>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Prediction Service Status</div>
          <div className="text-xl font-bold font-mono text-slate-900 flex items-center gap-2">
            <span className={backendStatus === 'online' ? 'text-emerald-700' : 'text-slate-800'}>
              {backendStatus === 'online' ? 'Service Online' : backendStatus === 'offline' ? 'Offline' : 'Checking…'}
            </span>
            {backendStatus === 'online' && backendMode === 'demo-fallback' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">Demo Fallback</span>
            )}
            {backendStatus === 'online' && backendMode === 'live-model' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">Live Model</span>
            )}
            {backendStatus === 'offline' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">Local Baseline Active</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {backendStatus === 'online' && backendMode === 'live-model'
              ? 'LightGBM, SHAP and Cox Survival analysis are all ready.'
              : backendStatus === 'online'
              ? 'Running locally with the deterministic demo estimator.'
              : backendStatus === 'offline'
              ? 'Local AI service is not running. Prototype operates normally using deterministic corridor benchmarks.'
              : 'Checking the prediction service…'}
          </p>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Critical Bottleneck Zone</div>
          <div className="text-xl font-bold font-mono text-slate-900">
            {topSection ? topSection.name.split(':')[0] : 'Data unavailable'}{' '}
            {topSection && <span className="text-xs font-normal text-slate-500 font-sans">({topSection.chainageKm})</span>}
          </div>
          <p className="text-xs text-slate-500">
            {topSection
              ? `Highest section risk score in the project record (${topSection.riskScore}%), with ${topSection.bottleneckCount} recorded bottlenecks.`
              : 'The active project has no corridor sections recorded.'}
          </p>
        </div>
      </div>

      {/* Main Content Grid: Global SHAP & Corridor What-If Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Col: Global SHAP Feature Importance */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{shapChartIsLive ? 'SHAP Attribution — Latest Project Prediction' : 'SHAP Feature Importance (Illustrative Reference)'}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {shapChartIsLive
                ? `Bars = each factor's share of the shown factors' combined |SHAP| (log-odds attribution) for ${project.name}. Not probability points.`
                : 'Illustrative reference only — run the project-level prediction above for live SHAP values.'}
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={globalShapData} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EAEEF4" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#667085' }} unit="%" />
                <YAxis dataKey="factor" type="category" tick={{ fontSize: 11, fill: '#37455A' }} width={130} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0B1F3A', borderRadius: '8px', color: '#fff', fontSize: '12px', border: 'none' }}
                  itemStyle={{ color: '#FFFFFF' }}
                  formatter={(val: any) => [`${val}% of shown attribution`, 'Contribution share']}
                />
                <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                  {globalShapData.map((entry, index) => (
                    <Cell key={`cell-shap-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 leading-relaxed">
            {shapChartIsLive && projectPrediction ? (
              <>
                <strong>Key Insight:</strong> For {project.name}, the strongest model driver is{' '}
                <strong>{projectPrediction.topRiskFactor}</strong>.
              </>
            ) : (
              <>
                <strong>Illustrative note:</strong> civil stay orders and unmutated partition backlogs are
                typically among the largest delay drivers. Run the project-level prediction for the actual weights.
              </>
            )}
          </div>
        </div>

        {/* Right Col: Corridor-Wide What-If Scenario Sandbox */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-600" />
              <span>Corridor-Wide Policy &amp; Intervention Sandbox</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">SCENARIO ESTIMATE</span>
            </h3>
            <p className="text-xs text-slate-500">
              Fixed per-intervention assumptions (not a model output). Each toggle applies a preset
              month/cost delta to the catalogued corridor baseline for discussion only.
            </p>
          </div>

          <div className="space-y-3 my-2">
            <label className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer transition-colors">
              <div>
                <div className="font-bold text-xs text-slate-900">Conduct Special Lok Adalat Camps</div>
                <div className="text-[11px] text-slate-500">Preset scenario: fast-tracks joint-heir partition claims</div>
              </div>
              <input 
                type="checkbox" 
                checked={lokAdalatIntervention} 
                onChange={(e) => setLokAdalatIntervention(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>

            <label className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer transition-colors">
              <div>
                <div className="font-bold text-xs text-slate-900">Section 3H(4) Court Escrow Fast-Tracking</div>
                <div className="text-[11px] text-slate-500">Deposits disputed compensation into court to vacate stay</div>
              </div>
              <input 
                type="checkbox" 
                checked={sec3HEscrowFastTrack} 
                onChange={(e) => setSec3HEscrowFastTrack(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>

            <label className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer transition-colors">
              <div>
                <div className="font-bold text-xs text-slate-900">DGPS Cadastral Boundary Reconciliation Camp</div>
                <div className="text-[11px] text-slate-500">Preset scenario: resolves area-mismatch objections on site</div>
              </div>
              <input 
                type="checkbox" 
                checked={dgpsSurveyReconciliation} 
                onChange={(e) => setDgpsSurveyReconciliation(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>
          </div>

          <div className="p-4 bg-emerald-900 text-white rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-300 font-bold uppercase tracking-wider">Scenario Estimate (fixed assumptions)</span>
              <span className="text-xs font-mono font-bold text-emerald-200">−{simulatedSavings.toFixed(1)} mo (assumed)</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center pt-1">
              <div className="p-2.5 bg-white/10 rounded-lg">
                <div className="text-[10px] text-white/60">Baseline − assumed delta</div>
                <div className="text-lg font-black text-white">{simulatedDelay} Mos</div>
              </div>

              <div className="p-2.5 bg-white/10 rounded-lg">
                <div className="text-[10px] text-white/60">Cost delta (₹4.8 Cr/mo assumption)</div>
                <div className="text-lg font-black text-amber-300">₹{estimatedCostSavedCrores} Cr</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
