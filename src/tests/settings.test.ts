import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY_SETTINGS,
  areSettingsDefault,
  classifyRiskScore,
  loadSettings,
  sanitizeSettings,
  saveSettings
} from '../config/settings';

describe('local settings (config/settings.ts)', () => {
  beforeEach(() => localStorage.clear());

  it('defaults reproduce the built-in 40/70 risk banding', () => {
    expect(classifyRiskScore(39, DEFAULT_SETTINGS)).toBe('low');
    expect(classifyRiskScore(40, DEFAULT_SETTINGS)).toBe('medium');
    expect(classifyRiskScore(69, DEFAULT_SETTINGS)).toBe('medium');
    expect(classifyRiskScore(70, DEFAULT_SETTINGS)).toBe('high');
  });

  it('custom thresholds move the band edges', () => {
    const s = sanitizeSettings({ riskThresholdLowMax: 30, riskThresholdMedMax: 60 });
    expect(classifyRiskScore(45, s)).toBe('medium');
    expect(classifyRiskScore(61, s)).toBe('high');
    expect(classifyRiskScore(30, s)).toBe('low');
  });

  it('sanitises garbage and enforces medMax > lowMax', () => {
    const s = sanitizeSettings({ riskThresholdLowMax: 999, riskThresholdMedMax: -5, autoEscalateDelayDays: 'x', mlModelSensitivity: 'Nope' });
    expect(s.riskThresholdLowMax).toBe(50);
    expect(s.riskThresholdMedMax).toBeGreaterThan(s.riskThresholdLowMax);
    expect(s.autoEscalateDelayDays).toBe(DEFAULT_SETTINGS.autoEscalateDelayDays);
    expect(s.mlModelSensitivity).toBe('Balanced');
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('persists and reloads', () => {
    const custom = sanitizeSettings({ ...DEFAULT_SETTINGS, riskThresholdLowMax: 25, autoEscalateDelayDays: 30 });
    saveSettings(custom);
    expect(loadSettings()).toEqual(custom);
    expect(areSettingsDefault(loadSettings())).toBe(false);
  });

  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
