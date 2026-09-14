export type UserRole = 'collector' | 'cala' | 'planner';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleTitle: string;
  badge: string;
  organization: string;
  department: string;
  district?: string;
  project?: string;
  avatarUrl?: string;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export type LarrStage = 
  | 'Notification (Sec 3A/11)' 
  | 'SIA & Objection (Sec 3C/15)' 
  | 'Declaration (Sec 3D/19)' 
  | 'Award Inquiry (Sec 3G/23)' 
  | 'Compensation Disbursement' 
  | 'Possession (Sec 3E/38)';

export type DataConfidence = 'Low' | 'Medium' | 'High';

export interface ShapFactor {
  factor: string;
  /**
   * SIGNED "contribution share" (%): magnitude = |SHAP_i| / Σ|SHAP_j| over the
   * DISPLAYED factors, ×100; sign = direction (+ increases modelled risk, −
   * decreases). This is a share of the shown attribution — NOT a probability-point
   * change. The raw SHAP value (LightGBM log-odds) is in `shapValue`.
   */
  impactPercent: number;
  /** Raw SHAP contribution in LightGBM log-odds / raw-margin space (preserved). */
  shapValue?: number;
  category: 'legal' | 'ownership' | 'compensation' | 'mutation' | 'spatial' | 'document';
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SurvivalMilestone {
  elapsed_months: number;
  delay_free_probability: number;
  delay_free_percent: string;
}

export interface CoxTimeAnalysis {
  reference_origin: string; // e.g. "sec_3a_11_notification"
  elapsed_notification_age_months: number | null;
  /** Elapsed month (from notification) at which model S(t) first hits 0.50. Absolute-from-origin, NOT months remaining. */
  median_delay_free_months_from_notification: number | null;
  elapsed_past_model_median: boolean | null;
  remaining_time_note: string;
}

export interface SurvivalAnalysisResult {
  partial_hazard_ratio: number;
  hazard_tier: string;
  estimated_median_delay_free_milestone: string;
  key_hazard_drivers: string[];
  delay_free_survival_curve: Record<string, SurvivalMilestone>;
  non_completion_notice: string;
  time_analysis?: CoxTimeAnalysis;
  survival_definition?: string;
}

/**
 * Result of the PRIMARY, project/case-level AI prediction.
 *
 * The LightGBM + Cox models are trained with one row = one whole land-acquisition
 * CASE / PROJECT. This type carries a single prediction produced by aggregating a
 * project's parcels + project-level fields into ONE /predict call (see
 * mlApiService.aggregateProjectCaseInput). It is attached to the project, not a parcel.
 */
/** Which backend path produced a prediction. */
export type PredictionMode = 'live-model' | 'demo-fallback';

export interface ProjectPrediction {
  projectId: string;
  projectName: string;
  generatedAt: string;
  isRealApiPrediction: boolean;
  /** 'live-model' = trained LightGBM+SHAP+Cox; 'demo-fallback' = deterministic backend estimate. */
  predictionMode?: PredictionMode;
  apiError?: string;
  /** Echo of the aggregated model input, for transparency in the UI. */
  modelInput: {
    parcel_count: number;
    litigation_cases: number;
    ownership_disputes: number;
    document_issues: number;
    compensation_pending_pct: number;
    acquisition_stage: string;
    notification_age_months: number;
    parcelsAnalyzed: number;
  };
  /**
   * Sample coverage (PART F): how many parcel records were actually loaded vs
   * how many the project declares. The UI must never imply the loaded subset
   * represents the whole project.
   */
  sampleCoverage?: {
    projectParcelCount: number;
    loadedParcelCount: number;
    sampleCoveragePct: number;
    fullCoverage: boolean;
  };
  /**
   * Soft out-of-distribution diagnostic (PART E) from the backend. Transparency
   * only — the prediction still runs; NOT a confidence score.
   */
  inputDiagnostics?: {
    available: boolean;
    any_out_of_training_range: boolean;
    note?: string;
    features: Record<string, {
      value: number;
      training_min: number | null;
      training_max: number | null;
      training_mean?: number | null;
      training_median?: number | null;
      in_training_range: boolean;
      out_of_training_range: boolean;
      position: 'below_training_min' | 'above_training_max' | 'within';
    }>;
  };
  aggregationNotes: string[];
  delayProbability: number; // 0.0 - 1.0 from LightGBM
  delayRiskScore: number;   // 0 - 100
  riskLevel: RiskLevel;
  /**
   * NULL for a live model prediction: the LightGBM model outputs a delay
   * PROBABILITY, not a duration, and there is no calibrated probability→months
   * model. Time context comes from `survivalAnalysis` instead. A number here only
   * appears for catalogued/scenario data, never from the classifier.
   */
  predictedDelayMonths: number | null;
  predictedDelayRange: string;
  topRiskFactor: string;
  aiExplanation: string;
  shapFactors: ShapFactor[];
  survivalAnalysis?: SurvivalAnalysisResult;
  recommendedAction: string;
}

export interface ECourtRecord {
  caseNumber: string;
  cnrNumber: string;
  courtName: string;
  caseType: string;
  filingDate: string;
  petitioner: string;
  respondent: string;
  caseStatus: 'Active - Stay Order' | 'Pending Hearing' | 'Disposed' | 'None';
  nextHearingDate?: string;
  prayer: string;
  interimInjunction: boolean;
}

export interface BhoomiRevenueRecord {
  khataNumber: string;
  pattaNumber: string;
  landClassification: 'Wetland (Nanjai)' | 'Dryland (Punjai)' | 'Manavari' | 'Commercial' | 'Government Poramboke';
  guidelineValuePerAcre: number;
  encumbranceStatus: 'Clear' | 'Encumbered' | 'Mortgaged to Co-op Bank' | 'Pending Partition';
  lastJamabandiDate: string;
  subRegistrarOffice: string;
}

export interface BhuvanGisRecord {
  elevationMeters: number;
  distanceToCorridorCenterMeters: number;
  intersectionAreaSqM: number;
  environmentalZone: 'None' | 'Buffer Zone' | 'CRZ' | 'Forest Border';
  waterBodyAdjacent: boolean;
  satelliteImageDate: string;
}

export interface Parcel {
  id: string; // e.g. "P-0245"
  surveyNumber: string; // "125/2"
  ulpin: string; // e.g. "TN-SLM-2024-88412"
  projectId: string;
  projectName: string;
  ownerName: string;
  coOwners: string[];
  coOwnerCount: number;
  village: string;
  taluk: string;
  district: string;
  areaAcres: number;
  areaSqMeters: number;
  
  // Land & Ownership Records
  mutationStatus: 'Up-to-date' | 'Pending Verification' | 'Disputed' | 'Stale';
  lastMutationYearsAgo: number;
  documentStatus: 'Verified' | 'Pending Verification' | 'Disputed' | 'Missing Documents';
  recordFreshnessScore: number; // 0-100%
  recordConfidence: DataConfidence;
  
  // Legal / Litigation
  courtCase: boolean;
  courtCaseStatus: 'Active - Stay Order' | 'Pending Hearing' | 'Disposed' | 'None';
  ownershipDispute: 'Yes - Partition Suit' | 'Yes - Joint Heir Conflict' | 'Yes - Boundary Dispute' | 'No';
  courtRecord?: ECourtRecord;
  revenueRecord?: BhoomiRevenueRecord;
  gisRecord?: BhuvanGisRecord;

  // LARR Stage & Acquisition
  acquisitionStatus: 'Pending' | 'Acquired' | 'In-Progress' | 'Contested' | 'Possession Taken';
  stage: LarrStage;
  notificationDate: string;
  compensationStatus: 'Pending' | 'Determined' | 'Disbursed 40%' | 'Under Dispute in LA-RA Authority' | 'Disbursed 100%';
  estimatedCompensationCrores: number;
  possessionStatus: 'Pending' | 'Partial' | 'Complete' | 'Not Started';

  // AI & Risk Predictions
  delayRiskScore: number; // 0 to 100
  riskLevel: RiskLevel;
  predictedDelayMonths: number;
  predictedDelayRange: string; // e.g. "3–5 Months"
  delayConfidence: 'High' | 'Medium' | 'Low';
  topRiskFactor: string;
  aiExplanation: string;
  shapFactors: ShapFactor[];
  riskFactorsList: string[];

  // Real ML API Extensions
  delayProbability?: number; // 0.0 to 1.0 from LightGBM
  isRealApiPrediction?: boolean;
  apiError?: string;
  survivalAnalysis?: SurvivalAnalysisResult;

  // Interventions & Actions
  recommendedAction: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  predictedDelayAfterIntervention: number;
  potentialReductionMonths: number;
  interventionStatus: 'Pending' | 'Assigned' | 'In Progress' | 'Completed' | 'Escalated';
  assignedOfficer?: string;
  assignedDueDate?: string;

  // Field Verification State
  fieldVerified: boolean;
  fieldVerificationNotes?: string;
  gpsCoordinates: { lat: number; lng: number };
  evidencePhotoAttached?: boolean;
  fieldVerifiedAt?: string;

  // GIS Coordinates (polygon bounds relative to project coordinate frame in Salem)
  mapCoordinates: [number, number][]; // Polygon vertices [lat, lng]
  centerCoordinate: [number, number];

  // Government Data Sync State
  lastSyncedAt?: string;
  syncStatus: 'Synced' | 'Pending' | 'Syncing' | 'Error';
}

export interface Project {
  id: string;
  name: string;
  code: string;
  department: string;
  agency: 'NHAI' | 'Railways' | 'State PWD' | 'SIPCOT' | 'TN Metrorail';
  totalLengthKm: number;
  projectValueCrores: number;
  totalParcels: number;
  acquiredParcels: number;
  pendingParcels: number;
  highRiskParcels: number;
  medRiskParcels: number;
  lowRiskParcels: number;
  predictedDelayMonths: number;
  status: 'On Track' | 'At Risk' | 'Delayed';
  currentLarrStage: LarrStage;
  corridorSections: {
    sectionId: string;
    name: string;
    chainageKm: string; // "Km 0 - 15"
    riskScore: number;
    riskLevel: RiskLevel;
    bottleneckCount: number;
    description: string;
  }[];
  corridorPath: [number, number][];
  startPointName?: string;
  endPointName?: string;
  startCoords?: [number, number];
  endCoords?: [number, number];
  isCustomProject?: boolean;
  /**
   * Highway classification chosen by the planner during project creation.
   * Planning metadata only — does NOT feed the ML model.
   */
  projectType?: 'National Highway' | 'Expressway' | 'Freight Corridor' | 'Bypass' | 'Other';
  /**
   * Optional corridor-design priorities captured from the planner at creation.
   * Planner preferences only — no optimization logic is attached to these.
   */
  planningPriorities?: string[];
}

export interface RouteEditState {
  active: boolean;
  isNew: boolean;
  draftProject: Partial<Project>;
  routeCoords: [number, number][];
  selectionStep?: 'select-start' | 'select-end' | 'edit-route';
  startCoords?: [number, number];
  endCoords?: [number, number];
  /**
   * Undo/redo history for the proposed alignment geometry (routeCoords) only.
   * `past` holds prior alignment snapshots (oldest first); `future` holds
   * snapshots that were undone (next-to-redo first). Alignment edits push here;
   * map pan/zoom/layer changes and non-alignment UI never do.
   */
  history?: {
    past: [number, number][][];
    future: [number, number][][];
  };
}

export interface Alert {
  id: string;
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  title: string;
  projectName: string;
  projectId: string;
  parcelId: string;
  surveyNumber: string;
  riskScore: number;
  trigger: string;
  reason: string;
  recommendedAction: string;
  createdAt: string;
  status: 'Active' | 'Assigned' | 'In Progress' | 'Escalated' | 'Resolved';
  resolutionNotes?: string;
  assignedTo?: string;
}

export interface CaseAction {
  id: string;
  parcelId: string;
  surveyNumber: string;
  title: string;
  actionType: 'Legal Verification' | 'Fast-Track Compensation' | 'Lok Adalat Settlement' | 'Joint Mutation Camp' | 'Field Geo-Survey' | 'Collector Hearing';
  assignedOfficer: string;
  assignedOfficerRole: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'Pending' | 'In Progress' | 'Completed' | 'Escalated';
  dueDate: string;
  createdAt: string;
  completedAt?: string;
  notes: string;
  targetDelayReductionMonths: number;
}

export interface AlignmentOption {
  id: string;
  name: string;
  code: string;
  lengthKm: number;
  affectedParcels: number;
  highRiskParcels: number;
  predictedDelayMonths: number;
  estimatedCostCrores: number;
  litigationFrictionScore: number; // 0-100
  isRecommended: boolean;
  recommendationReason: string;
  pros: string[];
  cons: string[];
  pathCoordinates: [number, number][];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  officerId: string;
  officerName: string;
  role: string;
  action: string;
  parcelId?: string;
  surveyNumber?: string;
  details: string;
}

export interface SystemSettings {
  riskThresholdLowMax: number; // default 39
  riskThresholdMedMax: number; // default 69
  notifyHighRiskParcel: boolean;
  notifyRiskIncrease: boolean;
  notifyNewLitigation: boolean;
  notifyFieldVerification: boolean;
  notifyWeeklySummary: boolean;
  autoEscalateDelayDays: number;
  mlModelSensitivity: 'Conservative' | 'Balanced' | 'Aggressive';
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  parcelId?: string;
  type: 'alert' | 'action' | 'sync' | 'prediction';
  isRead: boolean;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}
