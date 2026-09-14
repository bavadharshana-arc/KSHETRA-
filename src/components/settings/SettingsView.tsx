import React, { useState } from 'react';
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

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, resetAllData } = useApp();

  const [formSettings, setFormSettings] = useState<SystemSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

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
        <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          <span>System Settings & Model Thresholds</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure AI delay risk alert thresholds, notification triggers, and auto-escalation timelines.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Configuration saved successfully. AI prediction thresholds updated across all modules.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Risk Threshold Sliders */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              <span>Delay Risk Level Thresholds</span>
            </h3>
            <p className="text-xs text-slate-500">
              Customize probability cutoff values used to classify parcels into Low, Medium, and High Risk.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                <span>Low Risk Upper Limit (🟢 Clear Title):</span>
                <span className="font-bold text-emerald-600">{formSettings.riskThresholdLowMax}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="50"
                value={formSettings.riskThresholdLowMax}
                onChange={(e) => setFormSettings(prev => ({ ...prev, riskThresholdLowMax: Number(e.target.value) }))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>20% (Strict)</span>
                <span>50% (Lenient)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                <span>Medium Risk Upper Limit (🟡 Verification Required):</span>
                <span className="font-bold text-amber-600">{formSettings.riskThresholdMedMax}%</span>
              </div>
              <input
                type="range"
                min="51"
                max="80"
                value={formSettings.riskThresholdMedMax}
                onChange={(e) => setFormSettings(prev => ({ ...prev, riskThresholdMedMax: Number(e.target.value) }))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>51%</span>
                <span>80%</span>
              </div>
            </div>

            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-800 text-xs">
              <strong>High Risk Cutoff:</strong> Any parcel scoring <strong>&ge; {formSettings.riskThresholdMedMax + 1}%</strong> triggers an automated High-Risk Early Warning Alert for CALA intervention.
            </div>
          </div>
        </div>

        {/* Automated Notification Subscriptions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-600" />
              <span>Automated Alert & Event Triggers</span>
            </h3>
            <p className="text-xs text-slate-500">
              Demo preferences for e-Courts / statutory-deadline alerts (webhook integration is proposed, not connected).
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <label className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-bold text-slate-900">New High-Risk Parcel Alert</div>
                <div className="text-[11px] text-slate-500">Trigger instant alert when AI prediction exceeds threshold</div>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyHighRiskParcel}
                onChange={(e) => setFormSettings(prev => ({ ...prev, notifyHighRiskParcel: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>

            <label className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-bold text-slate-900">e-Courts Stay Order Webhook Alert</div>
                <div className="text-[11px] text-slate-500">Notify immediately when interim stay or injunction is filed</div>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyNewLitigation}
                onChange={(e) => setFormSettings(prev => ({ ...prev, notifyNewLitigation: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>

            <label className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-bold text-slate-900">Field Verification Completion Digest</div>
                <div className="text-[11px] text-slate-500">Notify when Special Tahsildar validates heirship papers</div>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyFieldVerification}
                onChange={(e) => setFormSettings(prev => ({ ...prev, notifyFieldVerification: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>
          </div>
        </div>

        {/* Model Inference Mode */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>AI Inference Sensitivity</span>
            </h3>
            <p className="text-xs text-slate-500">
              Select ML tuning model for early warning risk flags
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            {(['Conservative', 'Balanced', 'Aggressive'] as const).map(mode => (
              <button
                type="button"
                key={mode}
                onClick={() => setFormSettings(prev => ({ ...prev, mlModelSensitivity: mode }))}
                className={`p-3 rounded-xl border text-center font-bold transition-all ${
                  formSettings.mlModelSensitivity === mode
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {mode} Mode
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-4 h-4 text-amber-600" />
            <span>Reset Entire Application Data</span>
          </button>

          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-md shadow-blue-900/20"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-60 bg-navy-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-700 space-y-4">
            <h3 className="font-bold text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Reset Prototype Data to Factory Initial State?</span>
            </h3>
            <p className="text-xs text-slate-500">
              This will restore all sample parcels, alerts, actions, and prediction states.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetAllData();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs"
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
