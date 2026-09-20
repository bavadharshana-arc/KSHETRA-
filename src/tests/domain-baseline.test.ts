import { describe, it, expect } from 'vitest';
import { 
  INITIAL_PROJECT, 
  INITIAL_PARCELS, 
  INITIAL_ALERTS, 
  INITIAL_ACTIONS 
} from '../data/mockData';
import { RiskLevel } from '../types';

describe('KSHETRA Domain Logic Baseline (Pre-Refactor Safety Net)', () => {
  describe('Audited Mock Data Constants', () => {
    it('locks in the exact count of INITIAL_PARCELS (8 sample dossiers)', () => {
      expect(INITIAL_PARCELS).toBeDefined();
      expect(INITIAL_PARCELS.length).toBe(8);
      
      const ids = INITIAL_PARCELS.map(p => p.id);
      expect(ids).toEqual([
        'P-0245',
        'P-0189',
        'P-0084',
        'P-0312',
        'P-0421',
        'P-0556',
        'P-0610',
        'P-0733'
      ]);
    });

    it('locks in ground-truth values for critical sample parcel P-0556', () => {
      const p0556 = INITIAL_PARCELS.find(p => p.id === 'P-0556');
      expect(p0556).toBeDefined();
      expect(p0556?.surveyNumber).toBe('310/2A');
      expect(p0556?.areaAcres).toBe(5.60);
      expect(p0556?.delayRiskScore).toBe(89);
      expect(p0556?.riskLevel).toBe('high');
      expect(p0556?.predictedDelayMonths).toBe(5.2);
      expect(p0556?.predictedDelayRange).toBe('4–6 Months');
      expect(p0556?.courtCase).toBe(true);
      expect(p0556?.topRiskFactor).toBe('7-Way Stale Succession Dispute & Missing Registered Partition Deed');
    });

    it('locks in ground-truth values for stay-order parcel P-0245', () => {
      const p0245 = INITIAL_PARCELS.find(p => p.id === 'P-0245');
      expect(p0245).toBeDefined();
      expect(p0245?.surveyNumber).toBe('125/2');
      expect(p0245?.delayRiskScore).toBe(82);
      expect(p0245?.riskLevel).toBe('high');
      expect(p0245?.courtCase).toBe(true);
      expect(p0245?.courtCaseStatus).toBe('Active - Stay Order');
      expect(p0245?.courtRecord?.interimInjunction).toBe(true);
      expect(p0245?.courtRecord?.caseNumber).toBe('O.S. 412 / 2023');
    });

    it('locks in raw project totals from INITIAL_PROJECT', () => {
      expect(INITIAL_PROJECT.id).toBe('proj-nh79x');
      expect(INITIAL_PROJECT.totalLengthKm).toBe(68.4);
      expect(INITIAL_PROJECT.totalParcels).toBe(380);
      expect(INITIAL_PROJECT.acquiredParcels).toBe(242);
      expect(INITIAL_PROJECT.pendingParcels).toBe(138);
      expect(INITIAL_PROJECT.highRiskParcels).toBe(28);
      expect(INITIAL_PROJECT.medRiskParcels).toBe(46);
      expect(INITIAL_PROJECT.lowRiskParcels).toBe(64); // Raw field in pending pipeline
      expect(INITIAL_PROJECT.predictedDelayMonths).toBe(4.2);
    });

    it('verifies pipeline and corridor risk conservation arithmetic', () => {
      // Pipeline integrity: acquired + pending = total
      expect(INITIAL_PROJECT.acquiredParcels + INITIAL_PROJECT.pendingParcels).toBe(INITIAL_PROJECT.totalParcels);
      expect(242 + 138).toBe(380);

      // Pending risk sum: 28 high + 46 med + 64 low = 138
      expect(INITIAL_PROJECT.highRiskParcels + INITIAL_PROJECT.medRiskParcels + INITIAL_PROJECT.lowRiskParcels).toBe(INITIAL_PROJECT.pendingParcels);
      expect(28 + 46 + 64).toBe(138);

      // Corridor-wide low risk (computed: acquired clear + pending low)
      const corridorLowRisk = INITIAL_PROJECT.acquiredParcels + INITIAL_PROJECT.lowRiskParcels;
      expect(corridorLowRisk).toBe(306);

      // Entire corridor conservation: 28 high + 46 med + 306 low = 380
      expect(INITIAL_PROJECT.highRiskParcels + INITIAL_PROJECT.medRiskParcels + corridorLowRisk).toBe(INITIAL_PROJECT.totalParcels);
      expect(28 + 46 + 306).toBe(380);
    });

    it('locks in alert counts and verifies active stay injunction alerts', () => {
      expect(INITIAL_ALERTS.length).toBe(4);
      
      const activeAlerts = INITIAL_ALERTS.filter(a => a.status === 'Active');
      expect(activeAlerts.length).toBe(2);

      const criticalStays = INITIAL_ALERTS.filter(a => a.status === 'Active' && a.level === 'CRITICAL');
      expect(criticalStays.length).toBe(2);
      expect(criticalStays.map(a => a.id)).toEqual(['ALT-1092', 'ALT-1088']);
    });

    it('locks in action counts', () => {
      expect(INITIAL_ACTIONS.length).toBe(4);
      const pendingOrInProgress = INITIAL_ACTIONS.filter(a => a.status === 'Pending' || a.status === 'In Progress');
      expect(pendingOrInProgress.length).toBe(3);
      const completed = INITIAL_ACTIONS.filter(a => a.status === 'Completed');
      expect(completed.length).toBe(1);
    });
  });

  describe('Risk Threshold Math & Classification', () => {
    // Pure domain classifier matching the system settings algorithm
    const classifyRisk = (score: number, lowMax: number, medMax: number): RiskLevel => {
      if (score <= lowMax) return 'low';
      if (score <= medMax) return 'medium';
      return 'high';
    };

    it('classifies standard default boundary values correctly (40 / 70)', () => {
      const lowMax = 40;
      const medMax = 70;

      expect(classifyRisk(0, lowMax, medMax)).toBe('low');
      expect(classifyRisk(40, lowMax, medMax)).toBe('low');
      expect(classifyRisk(41, lowMax, medMax)).toBe('medium');
      expect(classifyRisk(70, lowMax, medMax)).toBe('medium');
      expect(classifyRisk(71, lowMax, medMax)).toBe('high');
      expect(classifyRisk(100, lowMax, medMax)).toBe('high');
    });

    it('dynamically adapts when thresholds are reconfigured without mutating scores', () => {
      const pScore = 45; // default medium (40-70)
      
      expect(classifyRisk(pScore, 40, 70)).toBe('medium');
      // If lowMax raised to 50, parcel becomes low risk
      expect(classifyRisk(pScore, 50, 70)).toBe('low');
      // If medMax lowered to 44, parcel becomes high risk
      expect(classifyRisk(pScore, 30, 44)).toBe('high');
    });
  });
});
