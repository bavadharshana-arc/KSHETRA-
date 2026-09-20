import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Sliders, 
  Bell, 
  Cpu, 
  RotateCcw, 
  Save, 
  CheckCircle2, 
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SystemSettings } from '../../types';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS, areSettingsDefault, classifyRiskScore, sanitizeSettings } from '../../config/settings';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, resetSettings, resetAllData, parcels } = useApp();

  const [formSettings, setFormSettings] = useState<SystemSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // Keep the form in sync when settings change elsewhere (e.g. full data reset).
  useEffect(() => { setFormSettings(settings); }, [settings]);

  const isDirty = JSON.stringify(sanitizeSettings(formSettings)) !== JSON.stringify(settings);

  // Live preview: how the ACTIVE project's parcels band under the form's cut-offs.
  const preview = parcels.reduce(
    (acc, p) => { acc[classifyRiskScore(p.delayRiskScore, formSettings)]++; return acc; },
    { low: 0, medium: 0, high: 0 }
  );

  const setLow = (v: number) =>
    setFormSettings(prev => ({ ...prev, riskThresholdLowMax: v, riskThresholdMedMax: Math.max(prev.riskThresholdMedMax, v + 1) }));

  const handleRestoreDefaults = () => {
    resetSettings();
    setFormSettings({ ...DEFAULT_SETTINGS });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formSettings);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-navy-800" />
          <span>System Settings & Model Thresholds</span>
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          Configure AI delay risk alert thresholds, notification triggers, and auto-escalation timelines.
        </p>
      </div>

      <div role="note" className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0 mt-px" aria-hidden="true" />
        <span>
          <strong className="text-slate-800">Local settings.</strong> Saved in this browser only (no server-side persistence).
          They change how risk scores are banded and how overdue actions are flagged in this interface; they do not alter the trained model's probabilities.
        </span>
      </div>

      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>Settings saved locally and applied across the interface.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Risk Threshold Sliders */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div>
            <h2 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-navy-700" />
              <span>Delay Risk Level Thresholds</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize probability cutoff values used to classify parcels into Low, Medium, and High Risk.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between font-medium text-slate-700 mb-1">
                <span>Low Risk Upper Limit (Clear Title):</span>
                <span className="font-bold font-mono text-emerald-700">{formSettings.riskThresholdLowMax}%</span>
              </div>
              <input
                type="range"
                id="risk-threshold-low"
                aria-label="Low Risk Upper Limit"
                aria-valuemin={20}
                aria-valuemax={50}
                aria-valuenow={formSettings.riskThresholdLowMax}
                aria-valuetext={`${formSettings.riskThresholdLowMax}%`}
                min="20"
                max="50"
                value={formSettings.riskThresholdLowMax}
                onChange={(e) => setLow(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>20% (Strict)</span>
                <span>50% (Lenient)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between font-medium text-slate-700 mb-1">
                <span>Medium Risk Upper Limit (Verification Required):</span>
                <span className="font-bold font-mono text-amber-700">{formSettings.riskThresholdMedMax}%</span>
              </div>
              <input
                type="range"
                id="risk-threshold-med"
                aria-label="Medium Risk Upper Limit"
                aria-valuemin={51}
                aria-valuemax={80}
                aria-valuenow={formSettings.riskThresholdMedMax}
                aria-valuetext={`${formSettings.riskThresholdMedMax}%`}
                min="51"
                max="80"
                value={formSettings.riskThresholdMedMax}
                onChange={(e) => setFormSettings(prev => ({ ...prev, riskThresholdMedMax: Number(e.target.value) }))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>51%</span>
                <span>80%</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200 text-amber-900 text-xs">
              <strong>High Risk Cutoff:</strong> parcels scoring <strong>&ge; {formSettings.riskThresholdMedMax + 1}%</strong> are shown as High Risk.
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 text-xs" aria-live="polite">
              <div className="font-semibold text-slate-900 mb-1">Preview on the active project ({parcels.length} parcels)</div>
              {parcels.length === 0 ? (
                <span className="text-slate-500">Data unavailable — the active project has no parcels.</span>
              ) : (
                <div className="flex gap-4 font-mono">
                  <span className="text-emerald-700">Low: {preview.low}</span>
                  <span className="text-amber-700">Medium: {preview.medium}</span>
                  <span className="text-rose-700">High: {preview.high}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Automated Notification Subscriptions */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3.5">
          <div>
            <h2 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-700" />
              <span>Automated Alert & Event Triggers</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Demo preferences for e-Courts / statutory-deadline alerts (webhook integration is proposed, not connected).
            </p>
          </div>

          <div className="space-y-2.5 text-xs">
            <label className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors">
              <div>
                <div className="font-semibold text-slate-900">New High-Risk Parcel Alert</div>
                <div className="text-[11px] text-slate-500">Trigger instant alert when AI prediction exceeds threshold</div>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyHighRiskParcel}
                onChange={(e) => setFormSettings(prev => ({ ...prev, notifyHighRiskParcel: e.target.checked }))}
                className="w-4 h-4 text-navy-800 rounded border-slate-300"
              />
            </label>

            <label className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors">
              <div>
                <div className="font-semibold text-slate-900">e-Courts Stay Order Webhook Alert</div>
                <div className="text-[11px] text-slate-500">Notify immediately when interim stay or injunction is filed</div>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyNewLitigation}
                onChange={(e) => setFormSettings(prev => ({ ...prev, notifyNewLitigation: e.target.checked }))}
                className="w-4 h-4 text-navy-800 rounded border-slate-300"
              />
            </label>

            <label className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors">
              <div>
                <div className="font-semibold text-slate-900">Field Verification Completion Digest</div>
                <div className="text-[11px] text-slate-500">Notify when Special Tahsildar validates heirship papers</div>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyFieldVerification}
                onChange={(e) => setFormSettings(prev => ({ ...prev, notifyFieldVerification: e.target.checked }))}
                className="w-4 h-4 text-navy-800 rounded border-slate-300"
              />
            </label>

            <label className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors">
              <div>
                <div className="font-semibold text-slate-900">Risk Increase Alert</div>
                <div className="text-[11px] text-slate-500">Demo preference — no delivery channel is connected</div>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyRiskIncrease}
                onChange={(e) => setFormSettings(prev => ({ ...prev, notifyRiskIncrease: e.target.checked }))}
                className="w-4 h-4 text-navy-800 rounded border-slate-300"
              />
            </label>

            <label className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors">
              <div>
                <div className="font-semibold text-slate-900">Weekly Summary Digest</div>
                <div className="text-[11px] text-slate-500">Demo preference — no email/webhook delivery is connected</div>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyWeeklySummary}
                onChange={(e) => setFormSettings(prev => ({ ...prev, notifyWeeklySummary: e.target.checked }))}
                className="w-4 h-4 text-navy-800 rounded border-slate-300"
              />
            </label>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
              <label htmlFor="auto-escalate-days">
                <div className="font-semibold text-slate-900">Overdue-Action Escalation Window</div>
                <div className="text-[11px] text-slate-500">Open actions overdue by at least this many days are flagged "Escalation due" on the Actions board</div>
              </label>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  id="auto-escalate-days"
                  type="number"
                  min={SETTINGS_LIMITS.escalateDays.min}
                  max={SETTINGS_LIMITS.escalateDays.max}
                  value={formSettings.autoEscalateDelayDays}
                  onChange={(e) => setFormSettings(prev => ({ ...prev, autoEscalateDelayDays: Number(e.target.value) || SETTINGS_LIMITS.escalateDays.min }))}
                  className="w-16 p-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-right focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
                <span className="text-slate-500">days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Model Inference Mode */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3.5">
          <div>
            <h2 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-ai-600" />
              <span>AI Inference Sensitivity</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Preference only — the deployed model has a fixed operating point, so this label is recorded but does not retune it.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            {(['Conservative', 'Balanced', 'Aggressive'] as const).map(mode => (
              <button
                type="button"
                key={mode}
                onClick={() => setFormSettings(prev => ({ ...prev, mlModelSensitivity: mode }))}
                className={`p-2.5 rounded-lg border text-center font-medium transition-all ${
                  formSettings.mlModelSensitivity === mode
                    ? 'bg-navy-900 text-white border-navy-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {mode} Mode
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              disabled={areSettingsDefault(settings) && !isDirty}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>Restore Default Settings</span>
            </button>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
              <span>Reset Entire Application Data</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {isDirty && <span className="text-[11px] text-amber-700 font-medium">Unsaved changes</span>}
            <button
              type="submit"
              disabled={!isDirty}
              className="px-5 py-2 bg-navy-900 hover:bg-navy-800 text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      </form>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-60 bg-navy-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl text-slate-700 space-y-4">
            <h3 className="font-semibold text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Reset Prototype Data to Factory Initial State?</span>
            </h3>
            <p className="text-xs text-slate-600">
              This will restore all sample parcels, alerts, actions, and prediction states to baseline values.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetAllData();
                  setShowResetConfirm(false);
                }}
                className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
