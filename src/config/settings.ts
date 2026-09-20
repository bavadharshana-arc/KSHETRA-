import { RiskLevel, SystemSettings } from '../types';
import { INITIAL_SETTINGS } from '../data/mockData';

/**
 * Local (browser-only) analyst settings. There is NO backend persistence for
 * these: they live in localStorage and are consumed by the frontend only
 * (risk banding, escalation flags). The ML model's own probabilities are never
 * altered by them.
 */
export const STORAGE_KEY_SETTINGS = 'bhu_drishti_settings_v1';

export const DEFAULT_SETTINGS: SystemSettings = { ...INITIAL_SETTINGS };

export const SETTINGS_LIMITS = {
  lowMax: { min: 20, max: 50 },
  medMax: { min: 51, max: 80 },
  escalateDays: { min: 1, max: 90 }
} as const;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Coerce arbitrary input into a valid SystemSettings (defaults for anything missing/invalid). */
export const sanitizeSettings = (raw: unknown): SystemSettings => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SystemSettings>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const lowMax = clamp(num(r.riskThresholdLowMax, DEFAULT_SETTINGS.riskThresholdLowMax), SETTINGS_LIMITS.lowMax.min, SETTINGS_LIMITS.lowMax.max);
  const medMax = Math.max(lowMax + 1, clamp(num(r.riskThresholdMedMax, DEFAULT_SETTINGS.riskThresholdMedMax), SETTINGS_LIMITS.medMax.min, SETTINGS_LIMITS.medMax.max));
  const sens = r.mlModelSensitivity;
  return {
    riskThresholdLowMax: lowMax,
    riskThresholdMedMax: medMax,
    notifyHighRiskParcel: bool(r.notifyHighRiskParcel, DEFAULT_SETTINGS.notifyHighRiskParcel),
    notifyRiskIncrease: bool(r.notifyRiskIncrease, DEFAULT_SETTINGS.notifyRiskIncrease),
    notifyNewLitigation: bool(r.notifyNewLitigation, DEFAULT_SETTINGS.notifyNewLitigation),
    notifyFieldVerification: bool(r.notifyFieldVerification, DEFAULT_SETTINGS.notifyFieldVerification),
    notifyWeeklySummary: bool(r.notifyWeeklySummary, DEFAULT_SETTINGS.notifyWeeklySummary),
    autoEscalateDelayDays: Math.round(clamp(num(r.autoEscalateDelayDays, DEFAULT_SETTINGS.autoEscalateDelayDays), SETTINGS_LIMITS.escalateDays.min, SETTINGS_LIMITS.escalateDays.max)),
    mlModelSensitivity: sens === 'Conservative' || sens === 'Aggressive' || sens === 'Balanced' ? sens : DEFAULT_SETTINGS.mlModelSensitivity
  };
};

export const loadSettings = (): SystemSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (saved) return sanitizeSettings(JSON.parse(saved));
  } catch { /* storage unavailable or corrupt — fall back to defaults */ }
  return { ...DEFAULT_SETTINGS };
};

export const saveSettings = (settings: SystemSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch { /* non-fatal: settings just won't persist */ }
};

export const areSettingsDefault = (s: SystemSettings): boolean =>
  (Object.keys(DEFAULT_SETTINGS) as (keyof SystemSettings)[]).every(k => s[k] === DEFAULT_SETTINGS[k]);

/** Band a 0–100 delay-risk score using the analyst-configured cut-offs. */
export const classifyRiskScore = (score: number, s: Pick<SystemSettings, 'riskThresholdLowMax' | 'riskThresholdMedMax'>): RiskLevel =>
  score <= s.riskThresholdLowMax ? 'low' : score <= s.riskThresholdMedMax ? 'medium' : 'high';
