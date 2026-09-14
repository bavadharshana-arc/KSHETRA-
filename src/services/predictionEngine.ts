import { Parcel, ShapFactor, RiskLevel } from '../types';

export interface PredictionResult {
  delayRiskScore: number;
  riskLevel: RiskLevel;
  /**
   * `null` from the ML `/predict` path — the classifier outputs a probability, not
   * a duration. A number appears only from the local What-If heuristic (a
   * deterministic scenario estimate) or from catalogued parcel data.
   */
  predictedDelayMonths: number | null;
  predictedDelayRange: string;
  delayConfidence: 'High' | 'Medium' | 'Low';
  topRiskFactor: string;
  aiExplanation: string;
  shapFactors: ShapFactor[];
  riskFactorsList: string[];
  recommendedAction: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  predictedDelayAfterIntervention: number | null;
  potentialReductionMonths: number | null;
}

export interface WhatIfScenarioOptions {
  resolveLitigation?: boolean;
  clearMutationDispute?: boolean;
  expediteCompensation?: boolean;
  completeDocVerification?: boolean;
  conductFieldSurvey?: boolean;
}

export function calculateParcelDelayPrediction(parcel: Parcel): PredictionResult {
  // Baseline probability
  let score = 10;
  const shapFactors: ShapFactor[] = [];
  const riskFactorsList: string[] = [];

  // 1. Legal / Litigation Factors (Max ~38%)
  if (parcel.courtCase || parcel.courtCaseStatus !== 'None') {
    if (parcel.courtCaseStatus === 'Active - Stay Order' || parcel.courtRecord?.interimInjunction) {
      score += 34;
      shapFactors.push({
        factor: `Civil Court Stay Order (${parcel.courtRecord?.caseNumber || 'Active Injunction'})`,
        impactPercent: 34,
        category: 'legal',
        description: 'Interim injunction halts Section 3E eviction and statutory possession timeline.',
        severity: 'HIGH'
      });
      riskFactorsList.push(`Active stay order: ${parcel.courtRecord?.caseNumber || 'Interim Stay'}`);
    } else if (parcel.courtCaseStatus === 'Pending Hearing') {
      score += 24;
      shapFactors.push({
        factor: `Litigation Pending Hearing (${parcel.courtRecord?.caseNumber || 'Court Case'})`,
        impactPercent: 24,
        category: 'legal',
        description: 'Pending court hearings create uncertainty in final award disbursement.',
        severity: 'HIGH'
      });
      riskFactorsList.push(`Pending court case: ${parcel.courtRecord?.caseNumber || 'Civil Suit'}`);
    } else if (parcel.courtCaseStatus === 'Disposed') {
      score += 6;
      shapFactors.push({
        factor: 'Recently Disposed Litigation',
        impactPercent: 6,
        category: 'legal',
        description: 'Case disposed, awaiting certified decree copy for revenue record update.',
        severity: 'LOW'
      });
    }
  } else {
    shapFactors.push({
      factor: 'No Active Court Litigation',
      impactPercent: -15,
      category: 'legal',
      description: 'Zero civil suits or writ petitions registered in e-Courts database.',
      severity: 'LOW'
    });
  }

  // 2. Ownership & Mutation Lag Factors (Max ~30%)
  if (parcel.ownershipDispute !== 'No') {
    const disputeImpact = parcel.ownershipDispute.includes('Partition') ? 22 : 18;
    score += disputeImpact;
    shapFactors.push({
      factor: `Ownership Conflict: ${parcel.ownershipDispute}`,
      impactPercent: disputeImpact,
      category: 'ownership',
      description: `${parcel.coOwnerCount} co-sharers with unapportioned boundary partition claims.`,
      severity: 'HIGH'
    });
    riskFactorsList.push(`Ownership dispute: ${parcel.ownershipDispute}`);
  }

  if (parcel.coOwnerCount > 3) {
    const coOwnerImpact = Math.min(18, (parcel.coOwnerCount - 1) * 3);
    score += coOwnerImpact;
    shapFactors.push({
      factor: `Fragmented Title (${parcel.coOwnerCount} Co-owners)`,
      impactPercent: coOwnerImpact,
      category: 'ownership',
      description: 'High coordination overhead required to obtain consent signatures & KYC from all legal heirs.',
      severity: 'MEDIUM'
    });
    riskFactorsList.push(`${parcel.coOwnerCount} registered co-owners require joint signatures`);
  }

  if (parcel.lastMutationYearsAgo > 5 || parcel.mutationStatus === 'Stale' || parcel.mutationStatus === 'Disputed') {
    const mutationImpact = Math.min(20, Math.floor(parcel.lastMutationYearsAgo * 1.4));
    score += mutationImpact;
    shapFactors.push({
      factor: `Unmutated Revenue Records (${parcel.lastMutationYearsAgo} years stale)`,
      impactPercent: mutationImpact,
      category: 'mutation',
      description: 'Land records in Bhoomi / Tamil Nilam have not been updated since legal devolution.',
      severity: parcel.lastMutationYearsAgo > 10 ? 'HIGH' : 'MEDIUM'
    });
    riskFactorsList.push(`Revenue mutation stale for ${parcel.lastMutationYearsAgo} years`);
  } else if (parcel.mutationStatus === 'Up-to-date') {
    shapFactors.push({
      factor: 'Up-to-date Mutation in Revenue Portal',
      impactPercent: -12,
      category: 'mutation',
      description: 'Clean digital Patta with updated Jamabandi registry.',
      severity: 'LOW'
    });
  }

  // 3. Compensation & Award Status (Max ~22%)
  if (parcel.compensationStatus === 'Under Dispute in LA-RA Authority') {
    score += 20;
    shapFactors.push({
      factor: 'Compensation Valuation Referred to LA-RA Authority',
      impactPercent: 20,
      category: 'compensation',
      description: 'Disagreement on commercial multiplier and structural asset valuation.',
      severity: 'HIGH'
    });
    riskFactorsList.push('Compensation valuation under dispute with CALA');
  } else if (parcel.compensationStatus === 'Pending') {
    score += 12;
    shapFactors.push({
      factor: 'Compensation Award Disbursement Pending',
      impactPercent: 12,
      category: 'compensation',
      description: 'Award inquiry completed; statutory fund disbursement pending.',
      severity: 'MEDIUM'
    });
    riskFactorsList.push('Statutory compensation disbursement pending');
  } else if (parcel.compensationStatus === 'Disbursed 100%') {
    score -= 18;
    shapFactors.push({
      factor: '100% Compensation Disbursed to Landowners',
      impactPercent: -18,
      category: 'compensation',
      description: 'Full financial settlement deposited via RTGS into verified bank accounts.',
      severity: 'LOW'
    });
  }

  // 4. Document Verification Status (Max ~15%)
  if (parcel.documentStatus === 'Missing Documents' || parcel.documentStatus === 'Disputed') {
    score += 15;
    shapFactors.push({
      factor: 'Incomplete / Missing Link Documents',
      impactPercent: 15,
      category: 'document',
      description: 'Parent title deeds or encumbrance certificates missing in Sub-Registrar records.',
      severity: 'MEDIUM'
    });
    riskFactorsList.push('Missing registered parent documents or death certificates');
  } else if (parcel.documentStatus === 'Pending Verification') {
    score += 8;
    shapFactors.push({
      factor: 'Document Verification in Progress',
      impactPercent: 8,
      category: 'document',
      description: 'Revenue field staff validating legal heir identity papers.',
      severity: 'LOW'
    });
  }

  // Bound score between 5% and 98%
  const finalScore = Math.max(5, Math.min(98, score));

  // Determine Risk Level
  let riskLevel: RiskLevel = 'low';
  if (finalScore >= 70) {
    riskLevel = 'high';
  } else if (finalScore >= 40) {
    riskLevel = 'medium';
  }

  // Predicted Delay in Months
  let predictedDelayMonths = 0.2;
  if (riskLevel === 'high') {
    predictedDelayMonths = +(2.5 + (finalScore - 70) * 0.1).toFixed(1);
  } else if (riskLevel === 'medium') {
    predictedDelayMonths = +(1.0 + (finalScore - 40) * 0.05).toFixed(1);
  } else {
    predictedDelayMonths = +(0.2 + finalScore * 0.015).toFixed(1);
  }

  let predictedDelayRange = '0–1 Month';
  if (predictedDelayMonths >= 4.0) {
    predictedDelayRange = '4–6 Months';
  } else if (predictedDelayMonths >= 2.5) {
    predictedDelayRange = '3–5 Months';
  } else if (predictedDelayMonths >= 1.5) {
    predictedDelayRange = '1–3 Months';
  } else {
    predictedDelayRange = '0–1 Month';
  }

  // Top Risk Factor
  const sortedShap = [...shapFactors].sort((a, b) => b.impactPercent - a.impactPercent);
  const topRiskFactor = sortedShap[0]?.factor || 'Standard administrative acquisition cycle';

  // AI Explanation
  let aiExplanation = '';
  if (riskLevel === 'high') {
    aiExplanation = `Parcel ${parcel.id} has an elevated delay probability of ${finalScore}% due to severe bottleneck factors: ${sortedShap.slice(0, 2).map(s => s.factor).join(' and ')}. Immediate administrative and legal intervention is required to avoid a ${predictedDelayRange} corridor schedule delay.`;
  } else if (riskLevel === 'medium') {
    aiExplanation = `Parcel ${parcel.id} exhibits a moderate delay probability of ${finalScore}%, influenced by ${sortedShap[0]?.factor || 'administrative verification lag'}. Resolving document verifications will keep this parcel on schedule.`;
  } else {
    aiExplanation = `Parcel ${parcel.id} is on track with a low delay risk of ${finalScore}%. Title documentation and statutory milestones are largely compliant.`;
  }

  // Priority & Recommended Action
  let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let recommendedAction = 'Continue routine field survey and statutory possession handover.';
  let potentialReductionMonths = +(predictedDelayMonths * 0.7).toFixed(1);
  let predictedDelayAfterIntervention = +(predictedDelayMonths - potentialReductionMonths).toFixed(1);

  if (parcel.courtCaseStatus === 'Active - Stay Order' || parcel.courtCase) {
    priority = 'CRITICAL';
    recommendedAction = 'Initiate early legal verification with Government Pleader & refer compensation to LA-RA Authority under Sec 3H(4) to vacate stay.';
  } else if (parcel.ownershipDispute !== 'No' || parcel.lastMutationYearsAgo > 10) {
    priority = 'HIGH';
    recommendedAction = 'Organize Special Legal Aid Lok Adalat camp at Taluk office for consensual award distribution among legal heirs.';
  } else if (parcel.compensationStatus === 'Pending' || parcel.compensationStatus === 'Under Dispute in LA-RA Authority') {
    priority = 'HIGH';
    recommendedAction = 'Fast-track CALA compensation determination hearing and deposit undisputed award into designated bank escrow.';
  } else if (parcel.documentStatus === 'Pending Verification' || parcel.documentStatus === 'Missing Documents') {
    priority = 'MEDIUM';
    recommendedAction = 'Deploy Special Revenue Inspector for doorstep verification of legal heir certificates and indemnity bonds.';
  }

  return {
    delayRiskScore: finalScore,
    riskLevel,
    predictedDelayMonths,
    predictedDelayRange,
    delayConfidence: 'High',
    topRiskFactor,
    aiExplanation,
    shapFactors,
    riskFactorsList: riskFactorsList.length > 0 ? riskFactorsList : ['Standard statutory milestones in progress'],
    recommendedAction,
    priority,
    predictedDelayAfterIntervention,
    potentialReductionMonths
  };
}

export function simulateWhatIfScenario(
  parcel: Parcel, 
  options: WhatIfScenarioOptions
): PredictionResult {
  // Create a cloned parcel with modified attributes
  const modifiedParcel: Parcel = {
    ...parcel,
    courtCase: options.resolveLitigation ? false : parcel.courtCase,
    courtCaseStatus: options.resolveLitigation ? 'None' : parcel.courtCaseStatus,
    ownershipDispute: options.clearMutationDispute ? 'No' : parcel.ownershipDispute,
    mutationStatus: options.clearMutationDispute ? 'Up-to-date' : parcel.mutationStatus,
    lastMutationYearsAgo: options.clearMutationDispute ? 1 : parcel.lastMutationYearsAgo,
    compensationStatus: options.expediteCompensation ? 'Disbursed 100%' : parcel.compensationStatus,
    documentStatus: options.completeDocVerification ? 'Verified' : parcel.documentStatus,
    fieldVerified: options.conductFieldSurvey ? true : parcel.fieldVerified
  };

  if (options.resolveLitigation && modifiedParcel.courtRecord) {
    modifiedParcel.courtRecord = {
      ...modifiedParcel.courtRecord,
      caseStatus: 'Disposed',
      interimInjunction: false
    };
  }

  return calculateParcelDelayPrediction(modifiedParcel);
}

// Re-export real FastAPI inference method
export { fetchRealAiPrediction } from './mlApiService';
