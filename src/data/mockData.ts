import { 
  User, 
  Parcel, 
  Project, 
  Alert, 
  CaseAction, 
  AlignmentOption, 
  AuditLog, 
  SystemSettings, 
  NotificationItem 
} from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'user-collector',
    name: 'Dr. Rajeshwari Sundaram, IAS',
    email: 'collector.salem@tn.gov.in',
    role: 'collector',
    roleTitle: 'District Collector & District Magistrate',
    badge: 'IAS Officer',
    organization: 'Revenue & Disaster Management Dept.',
    department: 'District Collectorate, Salem',
    district: 'Salem',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'
  },
  {
    id: 'user-cala',
    name: 'Thiru. M. Senthil Kumar, DRO',
    email: 'cala.highway.salem@tn.gov.in',
    role: 'cala',
    roleTitle: 'Competent Authority Land Acquisition (CALA)',
    badge: 'DRO / Spl. LA Officer',
    organization: 'National Highways LA Wing',
    department: 'Land Acquisition & Resettlement Office',
    district: 'Salem',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
  },
  {
    id: 'user-planner',
    name: 'Er. Ananya Sharma',
    email: 'planner.nhai@gov.in',
    role: 'planner',
    roleTitle: 'Chief Infrastructure Project Planner',
    badge: 'PM-GatiShakti Lead',
    organization: 'National Highways Authority of India (NHAI)',
    department: 'Corridor Infrastructure Planning Division',
    project: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80'
  }
];

export const INITIAL_PROJECT: Project = {
  id: 'proj-nh79x',
  name: 'Salem-Chennai Express Highway Corridor (NH-79X)',
  code: 'NHAI-TN-2024-EXP-08',
  department: 'Ministry of Road Transport & Highways (MoRTH)',
  agency: 'NHAI',
  totalLengthKm: 68.4,
  projectValueCrores: 4620,
  totalParcels: 380,
  acquiredParcels: 242,
  pendingParcels: 138,
  highRiskParcels: 28,
  medRiskParcels: 46,
  lowRiskParcels: 64,
  predictedDelayMonths: 4.2,
  status: 'At Risk',
  currentLarrStage: 'Award Inquiry (Sec 3G/23)',
  corridorSections: [
    {
      sectionId: 'sec-1',
      name: 'Section 1: Kandhampatty Bypass to Omalur Jct',
      chainageKm: 'Km 0.0 - 18.2',
      riskScore: 24,
      riskLevel: 'low',
      bottleneckCount: 2,
      description: '92% land acquisition complete. Clear title distribution across industrial belts.'
    },
    {
      sectionId: 'sec-2',
      name: 'Section 2: Omalur to Kamalapuram & Airport Link',
      chainageKm: 'Km 18.2 - 42.5',
      riskScore: 84,
      riskLevel: 'high',
      bottleneckCount: 19,
      description: 'Critical bottleneck area: Multiple civil stay orders (OS 412/2023) and fragmented co-heir mutation backlogs.'
    },
    {
      sectionId: 'sec-3',
      name: 'Section 3: Kamalapuram to Thoppur Ghats',
      chainageKm: 'Km 42.5 - 68.4',
      riskScore: 52,
      riskLevel: 'medium',
      bottleneckCount: 7,
      description: 'Moderate delay risk. Forest department clearance pending for 3 reserve forest boundary parcels.'
    }
  ],
  corridorPath: [
    [11.6643, 78.1460],
    [11.6850, 78.1250],
    [11.7230, 78.0820],
    [11.7580, 78.0460],
    [11.7920, 78.0120],
    [11.8350, 77.9850]
  ],
  startPointName: 'Salem Bypass (Kandhampatty)',
  endPointName: 'Thoppur Ghats Link',
  startCoords: [11.6643, 78.1460],
  endCoords: [11.8350, 77.9850]
};

// Realistic parcels based around Salem / Omalur coordinates
export const INITIAL_PARCELS: Parcel[] = [
  {
    id: 'P-0245',
    surveyNumber: '125/2',
    ulpin: 'TN-SLM-2024-88412',
    projectId: 'proj-nh79x',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    ownerName: 'Thiru. R. Ramasamy & 4 Co-sharers',
    coOwners: ['R. Ramasamy', 'R. Muthuvel', 'Smt. Saraswathi', 'K. Palanisamy', 'R. Loganathan'],
    coOwnerCount: 5,
    village: 'Kamalapuram',
    taluk: 'Omalur',
    district: 'Salem',
    areaAcres: 2.40,
    areaSqMeters: 9712,
    mutationStatus: 'Disputed',
    lastMutationYearsAgo: 14,
    documentStatus: 'Disputed',
    recordFreshnessScore: 38,
    recordConfidence: 'Low',
    courtCase: true,
    courtCaseStatus: 'Active - Stay Order',
    ownershipDispute: 'Yes - Partition Suit',
    courtRecord: {
      caseNumber: 'O.S. 412 / 2023',
      cnrNumber: 'TNSL010045232023',
      courtName: 'Subordinate Court, Omalur',
      caseType: 'Original Civil Suit (Partition & Injunction)',
      filingDate: '14-Aug-2023',
      petitioner: 'Smt. Saraswathi & Another',
      respondent: 'Thiru. R. Ramasamy & CALA / DRO Salem',
      caseStatus: 'Active - Stay Order',
      nextHearingDate: '12-Oct-2026',
      prayer: 'Suit for partition of 1/5th ancestral share and interim stay on CALA possession notice under Sec 3E.',
      interimInjunction: true
    },
    revenueRecord: {
      khataNumber: 'KH-8841',
      pattaNumber: 'PATTA-904',
      landClassification: 'Wetland (Nanjai)',
      guidelineValuePerAcre: 4800000,
      encumbranceStatus: 'Pending Partition',
      lastJamabandiDate: '14-Jul-2018',
      subRegistrarOffice: 'SRO Omalur (Reg. Dist. Salem)'
    },
    gisRecord: {
      elevationMeters: 284.2,
      distanceToCorridorCenterMeters: 14.5,
      intersectionAreaSqM: 9712,
      environmentalZone: 'Buffer Zone',
      waterBodyAdjacent: true,
      satelliteImageDate: '18-Jan-2026'
    },
    acquisitionStatus: 'Pending',
    stage: 'Award Inquiry (Sec 3G/23)',
    notificationDate: '12-Jan-2024',
    compensationStatus: 'Pending',
    estimatedCompensationCrores: 1.85,
    possessionStatus: 'Pending',
    delayRiskScore: 82,
    riskLevel: 'high',
    predictedDelayMonths: 3.8,
    predictedDelayRange: '3–5 Months',
    delayConfidence: 'High',
    topRiskFactor: 'Active Court Stay Order (O.S. 412/2023) + 5-Way Partition Dispute',
    aiExplanation: 'Parcel P-0245 faces an 82% acquisition delay probability primarily triggered by a civil court stay order on possession, exacerbated by unmutated joint heir succession dating back 14 years and pending compensation deposit in the LA-RA Authority.',
    shapFactors: [
      {
        factor: 'Civil Court Stay Order on Possession (O.S. 412/2023)',
        impactPercent: 34,
        category: 'legal',
        description: 'Interim injunction granted by Sub-Court Omalur halting Section 3E eviction.',
        severity: 'HIGH'
      },
      {
        factor: 'Joint Heir Partition Dispute (5 Co-sharers)',
        impactPercent: 22,
        category: 'ownership',
        description: 'Title unmutated since 2012; two legal heirs residing out of state have not executed consent.',
        severity: 'HIGH'
      },
      {
        factor: 'Compensation Determination Disagreement',
        impactPercent: 16,
        category: 'compensation',
        description: 'Claimants demanding 2.5x multiplier on commercial guideline value.',
        severity: 'MEDIUM'
      },
      {
        factor: 'Field Survey Extent Discrepancy',
        impactPercent: 10,
        category: 'spatial',
        description: 'Revenue record shows 2.40 acres while DGPS cadastral drone survey mapped 2.28 acres.',
        severity: 'MEDIUM'
      }
    ],
    riskFactorsList: [
      'Court case pending (O.S. 412/2023 - Sub-Court Omalur)',
      '5-Way unmutated ancestral partition suit',
      'Compensation dispute with CALA valuation',
      'Document verification pending co-heir affidavits'
    ],
    recommendedAction: 'Initiate early legal verification with Government Pleader & refer compensation to LA-RA Authority under Sec 3H(4) to vacate stay.',
    priority: 'CRITICAL',
    predictedDelayAfterIntervention: 1.1,
    potentialReductionMonths: 2.7,
    interventionStatus: 'Pending',
    assignedOfficer: 'Thiru. M. Senthil Kumar, DRO',
    assignedDueDate: '28-Aug-2026',
    fieldVerified: false,
    gpsCoordinates: { lat: 11.7584, lng: 78.0462 },
    mapCoordinates: [
      [11.7578, 78.0452],
      [11.7592, 78.0456],
      [11.7590, 78.0474],
      [11.7576, 78.0468]
    ],
    centerCoordinate: [11.7584, 78.0462],
    syncStatus: 'Synced',
    lastSyncedAt: '2026-08-23 20:45'
  },
  {
    id: 'P-0189',
    surveyNumber: '118/4B',
    ulpin: 'TN-SLM-2024-88350',
    projectId: 'proj-nh79x',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    ownerName: 'Smt. Kannammal & K. Subramani',
    coOwners: ['Smt. Kannammal', 'K. Subramani'],
    coOwnerCount: 2,
    village: 'Kamalapuram',
    taluk: 'Omalur',
    district: 'Salem',
    areaAcres: 1.65,
    areaSqMeters: 6677,
    mutationStatus: 'Pending Verification',
    lastMutationYearsAgo: 8,
    documentStatus: 'Pending Verification',
    recordFreshnessScore: 62,
    recordConfidence: 'Medium',
    courtCase: false,
    courtCaseStatus: 'None',
    ownershipDispute: 'No',
    revenueRecord: {
      khataNumber: 'KH-8120',
      pattaNumber: 'PATTA-755',
      landClassification: 'Dryland (Punjai)',
      guidelineValuePerAcre: 3600000,
      encumbranceStatus: 'Clear',
      lastJamabandiDate: '10-May-2022',
      subRegistrarOffice: 'SRO Omalur'
    },
    gisRecord: {
      elevationMeters: 278.6,
      distanceToCorridorCenterMeters: 21.0,
      intersectionAreaSqM: 5675,
      environmentalZone: 'None',
      waterBodyAdjacent: false,
      satelliteImageDate: '05-Feb-2026'
    },
    acquisitionStatus: 'In-Progress',
    stage: 'Award Inquiry (Sec 3G/23)',
    notificationDate: '15-Feb-2024',
    compensationStatus: 'Determined',
    estimatedCompensationCrores: 0.98,
    possessionStatus: 'Pending',
    delayRiskScore: 48,
    riskLevel: 'medium',
    predictedDelayMonths: 1.8,
    predictedDelayRange: '1–2 Months',
    delayConfidence: 'High',
    topRiskFactor: 'Joint ownership death certificate verification lag',
    aiExplanation: 'Moderate delay risk due to pending legal heir certificate submission following primary owner demise in 2023.',
    shapFactors: [
      {
        factor: 'Legal Heirship Certificate Delay',
        impactPercent: 28,
        category: 'mutation',
        description: 'Tahsildar verification pending for second-generation heirs.',
        severity: 'MEDIUM'
      },
      {
        factor: 'Award Notice Service',
        impactPercent: 20,
        category: 'document',
        description: 'One co-owner relocated to Coimbatore.',
        severity: 'LOW'
      }
    ],
    riskFactorsList: [
      'Legal heir certificate verification pending',
      'Co-owner outstation residence'
    ],
    recommendedAction: 'Deploy Special Tahsildar for on-site death certificate endorsement and direct bank mandate collection.',
    priority: 'MEDIUM',
    predictedDelayAfterIntervention: 0.4,
    potentialReductionMonths: 1.4,
    interventionStatus: 'Assigned',
    assignedOfficer: 'Spl. Tahsildar (LA) Unit-2',
    assignedDueDate: '05-Sep-2026',
    fieldVerified: true,
    gpsCoordinates: { lat: 11.7540, lng: 78.0510 },
    mapCoordinates: [
      [11.7535, 78.0502],
      [11.7548, 78.0505],
      [11.7545, 78.0520],
      [11.7532, 78.0515]
    ],
    centerCoordinate: [11.7540, 78.0510],
    syncStatus: 'Synced',
    lastSyncedAt: '2026-08-23 19:30'
  },
  {
    id: 'P-0084',
    surveyNumber: '44/1A',
    ulpin: 'TN-SLM-2024-88102',
    projectId: 'proj-nh79x',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    ownerName: 'Thiru. N. Dharmalingam',
    coOwners: ['N. Dharmalingam'],
    coOwnerCount: 1,
    village: 'Kandhampatty',
    taluk: 'Salem West',
    district: 'Salem',
    areaAcres: 3.10,
    areaSqMeters: 12545,
    mutationStatus: 'Up-to-date',
    lastMutationYearsAgo: 2,
    documentStatus: 'Verified',
    recordFreshnessScore: 96,
    recordConfidence: 'High',
    courtCase: false,
    courtCaseStatus: 'None',
    ownershipDispute: 'No',
    revenueRecord: {
      khataNumber: 'KH-4410',
      pattaNumber: 'PATTA-312',
      landClassification: 'Dryland (Punjai)',
      guidelineValuePerAcre: 5200000,
      encumbranceStatus: 'Clear',
      lastJamabandiDate: '22-Jun-2025',
      subRegistrarOffice: 'SRO Salem West'
    },
    gisRecord: {
      elevationMeters: 264.8,
      distanceToCorridorCenterMeters: 30.5,
      intersectionAreaSqM: 10663,
      environmentalZone: 'None',
      waterBodyAdjacent: false,
      satelliteImageDate: '05-Feb-2026'
    },
    acquisitionStatus: 'Acquired',
    stage: 'Possession (Sec 3E/38)',
    notificationDate: '02-Dec-2023',
    compensationStatus: 'Disbursed 100%',
    estimatedCompensationCrores: 2.45,
    possessionStatus: 'Complete',
    delayRiskScore: 12,
    riskLevel: 'low',
    predictedDelayMonths: 0.2,
    predictedDelayRange: '0–1 Month',
    delayConfidence: 'High',
    topRiskFactor: 'Clear title & consent agreement signed',
    aiExplanation: 'Low risk. Full award disbursed via RTGS and physical possession handover completed with NHAI contractors.',
    shapFactors: [
      {
        factor: 'Single undisputed owner with e-Patta',
        impactPercent: -35,
        category: 'ownership',
        description: 'Complete title clarity with digitized e-Adangal verification.',
        severity: 'LOW'
      }
    ],
    riskFactorsList: ['No active bottlenecks'],
    recommendedAction: 'Proceed with boundary pillar geo-tagging and right-of-way earthwork.',
    priority: 'LOW',
    predictedDelayAfterIntervention: 0.0,
    potentialReductionMonths: 0.2,
    interventionStatus: 'Completed',
    assignedOfficer: 'Site Engineer, NHAI PIU',
    fieldVerified: true,
    gpsCoordinates: { lat: 11.6720, lng: 78.1380 },
    mapCoordinates: [
      [11.6710, 78.1370],
      [11.6730, 78.1375],
      [11.6728, 78.1395],
      [11.6708, 78.1388]
    ],
    centerCoordinate: [11.6720, 78.1380],
    syncStatus: 'Synced',
    lastSyncedAt: '2026-08-23 18:10'
  },
  {
    id: 'P-0312',
    surveyNumber: '204/1',
    ulpin: 'TN-SLM-2024-88590',
    projectId: 'proj-nh79x',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    ownerName: 'Thiru. Velusamy & Temple Trust',
    coOwners: ['Thiru. Velusamy', 'Sri Mariamman Temple Hereditary Trustee'],
    coOwnerCount: 2,
    village: 'Omalur',
    taluk: 'Omalur',
    district: 'Salem',
    areaAcres: 1.80,
    areaSqMeters: 7284,
    mutationStatus: 'Disputed',
    lastMutationYearsAgo: 19,
    documentStatus: 'Disputed',
    recordFreshnessScore: 42,
    recordConfidence: 'Low',
    courtCase: true,
    courtCaseStatus: 'Pending Hearing',
    ownershipDispute: 'Yes - Joint Heir Conflict',
    courtRecord: {
      caseNumber: 'W.P. 18920 / 2024',
      cnrNumber: 'TNMHC01089202024',
      courtName: 'High Court of Madras',
      caseType: 'Writ Petition (HR&CE Land Claim)',
      filingDate: '10-Feb-2024',
      petitioner: 'HR&CE Department & Temple Trustee',
      respondent: 'CALA / DRO Salem & Thiru. Velusamy',
      caseStatus: 'Pending Hearing',
      nextHearingDate: '18-Sep-2026',
      prayer: 'Challenge against private patta issuance on Inam temple endowment land.',
      interimInjunction: false
    },
    revenueRecord: {
      khataNumber: 'KH-2041',
      pattaNumber: 'PATTA-204 (contested)',
      landClassification: 'Dryland (Punjai)',
      guidelineValuePerAcre: 4100000,
      encumbranceStatus: 'Encumbered',
      lastJamabandiDate: '15-Mar-2007',
      subRegistrarOffice: 'SRO Omalur'
    },
    gisRecord: {
      elevationMeters: 271.4,
      distanceToCorridorCenterMeters: 12.5,
      intersectionAreaSqM: 6191,
      environmentalZone: 'None',
      waterBodyAdjacent: false,
      satelliteImageDate: '05-Feb-2026'
    },
    acquisitionStatus: 'Contested',
    stage: 'SIA & Objection (Sec 3C/15)',
    notificationDate: '10-Jan-2024',
    compensationStatus: 'Under Dispute in LA-RA Authority',
    estimatedCompensationCrores: 1.62,
    possessionStatus: 'Pending',
    delayRiskScore: 78,
    riskLevel: 'high',
    predictedDelayMonths: 4.5,
    predictedDelayRange: '4–6 Months',
    delayConfidence: 'High',
    topRiskFactor: 'HR&CE Religious Endowment Inam Claim',
    aiExplanation: 'High risk of litigation stall due to conflicting historical Inam tenure records between private cultivators and HR&CE Temple Department.',
    shapFactors: [
      {
        factor: 'HR&CE vs Private Inam Dispute',
        impactPercent: 38,
        category: 'legal',
        description: 'Madras HC Writ Petition seeking quashing of Section 3A notification.',
        severity: 'HIGH'
      },
      {
        factor: 'Guideline Value Valuation Conflict',
        impactPercent: 22,
        category: 'compensation',
        description: 'Temple board demanding commercial rate for endowment corpus.',
        severity: 'HIGH'
      }
    ],
    riskFactorsList: [
      'High Court Writ Petition W.P. 18920/2024',
      'HR&CE religious trust endowment conflict',
      'Inam tenure record ambiguity'
    ],
    recommendedAction: 'Convene joint district-level coordination meeting with HR&CE Commissioner and Special Govt Pleader for deposit under Sec 3H.',
    priority: 'HIGH',
    predictedDelayAfterIntervention: 1.8,
    potentialReductionMonths: 2.7,
    interventionStatus: 'Assigned',
    assignedOfficer: 'District Collector (Special Hearing)',
    assignedDueDate: '10-Sep-2026',
    fieldVerified: false,
    gpsCoordinates: { lat: 11.7340, lng: 78.0720 },
    mapCoordinates: [
      [11.7330, 78.0710],
      [11.7350, 78.0715],
      [11.7348, 78.0735],
      [11.7328, 78.0728]
    ],
    centerCoordinate: [11.7340, 78.0720],
    syncStatus: 'Synced',
    lastSyncedAt: '2026-08-23 20:00'
  },
  {
    id: 'P-0421',
    surveyNumber: '89/2B',
    ulpin: 'TN-SLM-2024-88615',
    projectId: 'proj-nh79x',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    ownerName: 'Thiru. M. Soundararajan & Sons',
    coOwners: ['M. Soundararajan', 'S. Vignesh', 'S. Dinesh'],
    coOwnerCount: 3,
    village: 'Tharamangalam',
    taluk: 'Omalur',
    district: 'Salem',
    areaAcres: 4.20,
    areaSqMeters: 16996,
    mutationStatus: 'Up-to-date',
    lastMutationYearsAgo: 3,
    documentStatus: 'Verified',
    recordFreshnessScore: 88,
    recordConfidence: 'High',
    courtCase: false,
    courtCaseStatus: 'None',
    ownershipDispute: 'No',
    revenueRecord: {
      khataNumber: 'KH-0892',
      pattaNumber: 'PATTA-89-2B',
      landClassification: 'Dryland (Punjai)',
      guidelineValuePerAcre: 3900000,
      encumbranceStatus: 'Clear',
      lastJamabandiDate: '10-Jun-2023',
      subRegistrarOffice: 'SRO Omalur'
    },
    gisRecord: {
      elevationMeters: 281.2,
      distanceToCorridorCenterMeters: 26.0,
      intersectionAreaSqM: 14447,
      environmentalZone: 'None',
      waterBodyAdjacent: false,
      satelliteImageDate: '05-Feb-2026'
    },
    acquisitionStatus: 'In-Progress',
    stage: 'Compensation Disbursement',
    notificationDate: '05-Jan-2024',
    compensationStatus: 'Disbursed 40%',
    estimatedCompensationCrores: 3.10,
    possessionStatus: 'Partial',
    delayRiskScore: 28,
    riskLevel: 'low',
    predictedDelayMonths: 0.8,
    predictedDelayRange: '0–1 Month',
    delayConfidence: 'High',
    topRiskFactor: 'Final 60% tranche disbursement scheduled',
    aiExplanation: 'Low risk. Consent agreement signed. Balance 60% compensation awaiting state treasury batch clearance.',
    shapFactors: [
      {
        factor: 'Treasury voucher queueing',
        impactPercent: 18,
        category: 'compensation',
        description: 'Standard treasury IFHRMS batch processing window.',
        severity: 'LOW'
      }
    ],
    riskFactorsList: ['Treasury payment clearance pending'],
    recommendedAction: 'Fast-track IFHRMS treasury token clearance with District Treasury Officer.',
    priority: 'LOW',
    predictedDelayAfterIntervention: 0.2,
    potentialReductionMonths: 0.6,
    interventionStatus: 'In Progress',
    assignedOfficer: 'Accounts Officer, CALA Wing',
    assignedDueDate: '30-Aug-2026',
    fieldVerified: true,
    gpsCoordinates: { lat: 11.7820, lng: 78.0210 },
    mapCoordinates: [
      [11.7810, 78.0200],
      [11.7832, 78.0205],
      [11.7828, 78.0225],
      [11.7805, 78.0218]
    ],
    centerCoordinate: [11.7820, 78.0210],
    syncStatus: 'Synced',
    lastSyncedAt: '2026-08-23 20:30'
  },
  {
    id: 'P-0556',
    surveyNumber: '310/2A',
    ulpin: 'TN-SLM-2024-88740',
    projectId: 'proj-nh79x',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    ownerName: 'Thiru. Chinnasamy Gounder & 6 Heirs',
    coOwners: ['Chinnasamy Gounder', 'C. Perumal', 'C. Murugesan', 'Smt. Pavalakkodi', 'C. Natarajan', 'Smt. Selvi', 'K. Balan'],
    coOwnerCount: 7,
    village: 'Kamalapuram',
    taluk: 'Omalur',
    district: 'Salem',
    areaAcres: 5.60,
    areaSqMeters: 22662,
    mutationStatus: 'Stale',
    lastMutationYearsAgo: 22,
    documentStatus: 'Missing Documents',
    recordFreshnessScore: 28,
    recordConfidence: 'Low',
    courtCase: true,
    courtCaseStatus: 'Pending Hearing',
    ownershipDispute: 'Yes - Partition Suit',
    courtRecord: {
      caseNumber: 'O.S. 88 / 2024',
      cnrNumber: 'TNSL010008822024',
      courtName: 'District Munsif Court, Omalur',
      caseType: 'Civil Suit (Title Declaration & Partition)',
      filingDate: '20-Mar-2024',
      petitioner: 'Smt. Pavalakkodi & Another',
      respondent: 'Thiru. C. Perumal & 5 Others',
      caseStatus: 'Pending Hearing',
      nextHearingDate: '25-Sep-2026',
      prayer: 'Suit for declaration of share under Hindu Succession Amendment Act 2005.',
      interimInjunction: false
    },
    revenueRecord: {
      khataNumber: 'KH-3102',
      pattaNumber: 'PATTA-310-2A',
      landClassification: 'Dryland (Punjai)',
      guidelineValuePerAcre: 4500000,
      encumbranceStatus: 'Pending Partition',
      lastJamabandiDate: '12-Aug-2004',
      subRegistrarOffice: 'SRO Omalur'
    },
    gisRecord: {
      elevationMeters: 276.3,
      distanceToCorridorCenterMeters: 16.0,
      intersectionAreaSqM: 19263,
      environmentalZone: 'None',
      waterBodyAdjacent: false,
      satelliteImageDate: '05-Feb-2026'
    },
    acquisitionStatus: 'Pending',
    stage: 'Declaration (Sec 3D/19)',
    notificationDate: '18-Jan-2024',
    compensationStatus: 'Pending',
    estimatedCompensationCrores: 4.25,
    possessionStatus: 'Not Started',
    delayRiskScore: 89,
    riskLevel: 'high',
    predictedDelayMonths: 5.2,
    predictedDelayRange: '4–6 Months',
    delayConfidence: 'High',
    topRiskFactor: '7-Way Stale Succession Dispute & Missing Registered Partition Deed',
    aiExplanation: 'Severe delay risk. Land records have not been mutated since 2002. Seven competing legal heirs with an active title suit pending at Munsif Court.',
    shapFactors: [
      {
        factor: 'Stale Mutation (>20 years)',
        impactPercent: 36,
        category: 'mutation',
        description: 'Original title holder deceased; revenue records still list pre-partition survey numbers.',
        severity: 'HIGH'
      },
      {
        factor: 'Multi-party Succession Litigation',
        impactPercent: 30,
        category: 'legal',
        description: 'Gender-equal inheritance claim under 2005 Act disputed by sons.',
        severity: 'HIGH'
      },
      {
        factor: 'Missing Link Documents',
        impactPercent: 18,
        category: 'document',
        description: 'Original 1974 settlement deed untraceable in Omalur Sub-Registrar archives.',
        severity: 'MEDIUM'
      }
    ],
    riskFactorsList: [
      'Unmutated revenue records (22 years old)',
      '7 competing legal heirs in active litigation',
      'Missing registered parent settlement documents',
      'No consent agreement on valuation'
    ],
    recommendedAction: 'Organize Special Legal Aid Lok Adalat camp at Omalur Taluk office for consensual compensation division under Section 3H(4).',
    priority: 'CRITICAL',
    predictedDelayAfterIntervention: 1.5,
    potentialReductionMonths: 3.7,
    interventionStatus: 'Pending',
    assignedOfficer: 'Thiru. M. Senthil Kumar, DRO',
    assignedDueDate: '02-Sep-2026',
    fieldVerified: false,
    gpsCoordinates: { lat: 11.7650, lng: 78.0380 },
    mapCoordinates: [
      [11.7638, 78.0370],
      [11.7665, 78.0375],
      [11.7660, 78.0398],
      [11.7635, 78.0390]
    ],
    centerCoordinate: [11.7650, 78.0380],
    syncStatus: 'Pending',
    lastSyncedAt: '2026-08-23 16:00'
  },
  {
    id: 'P-0610',
    surveyNumber: '104/1',
    ulpin: 'TN-SLM-2024-88805',
    projectId: 'proj-nh79x',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    ownerName: 'M/s Salem Granites Pvt Ltd',
    coOwners: ['Managing Director, Salem Granites'],
    coOwnerCount: 1,
    village: 'Thoppur',
    taluk: 'Attur',
    district: 'Salem',
    areaAcres: 6.80,
    areaSqMeters: 27518,
    mutationStatus: 'Up-to-date',
    lastMutationYearsAgo: 4,
    documentStatus: 'Verified',
    recordFreshnessScore: 92,
    recordConfidence: 'High',
    courtCase: false,
    courtCaseStatus: 'None',
    ownershipDispute: 'No',
    revenueRecord: {
      khataNumber: 'KH-1041',
      pattaNumber: 'PATTA-104-1',
      landClassification: 'Commercial',
      guidelineValuePerAcre: 6800000,
      encumbranceStatus: 'Clear',
      lastJamabandiDate: '18-Apr-2022',
      subRegistrarOffice: 'SRO Attur'
    },
    gisRecord: {
      elevationMeters: 338.5,
      distanceToCorridorCenterMeters: 20.0,
      intersectionAreaSqM: 23390,
      environmentalZone: 'None',
      waterBodyAdjacent: false,
      satelliteImageDate: '05-Feb-2026'
    },
    acquisitionStatus: 'In-Progress',
    stage: 'Award Inquiry (Sec 3G/23)',
    notificationDate: '28-Jan-2024',
    compensationStatus: 'Determined',
    estimatedCompensationCrores: 5.80,
    possessionStatus: 'Pending',
    delayRiskScore: 35,
    riskLevel: 'low',
    predictedDelayMonths: 0.9,
    predictedDelayRange: '0–1 Month',
    delayConfidence: 'High',
    topRiskFactor: 'Mining quarry machinery relocation logistics',
    aiExplanation: 'Low legal delay risk. Minor mechanical delay expected for heavy crushing equipment relocation before site handover.',
    shapFactors: [
      {
        factor: 'Commercial structure demolition & shifting',
        impactPercent: 24,
        category: 'spatial',
        description: 'Valuation of industrial shed and transformer dismantling.',
        severity: 'LOW'
      }
    ],
    riskFactorsList: ['Industrial machinery shifting required'],
    recommendedAction: 'Coordinate with PWD Buildings & TANGEDCO for fast-tracked electrical dismantling approval.',
    priority: 'LOW',
    predictedDelayAfterIntervention: 0.3,
    potentialReductionMonths: 0.6,
    interventionStatus: 'Assigned',
    assignedOfficer: 'Assistant Executive Engineer, NHAI',
    assignedDueDate: '15-Sep-2026',
    fieldVerified: true,
    gpsCoordinates: { lat: 11.8250, lng: 77.9920 },
    mapCoordinates: [
      [11.8235, 77.9905],
      [11.8268, 77.9912],
      [11.8260, 77.9940],
      [11.8230, 77.9930]
    ],
    centerCoordinate: [11.8250, 77.9920],
    syncStatus: 'Synced',
    lastSyncedAt: '2026-08-23 17:45'
  },
  {
    id: 'P-0733',
    surveyNumber: '56/3',
    ulpin: 'TN-SLM-2024-88910',
    projectId: 'proj-nh79x',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    ownerName: 'Thiru. A. Krishnan & 2 Co-sharers',
    coOwners: ['A. Krishnan', 'A. Soundar', 'Smt. Lakshmi'],
    coOwnerCount: 3,
    village: 'Kamalapuram',
    taluk: 'Omalur',
    district: 'Salem',
    areaAcres: 2.15,
    areaSqMeters: 8700,
    mutationStatus: 'Pending Verification',
    lastMutationYearsAgo: 6,
    documentStatus: 'Pending Verification',
    recordFreshnessScore: 58,
    recordConfidence: 'Medium',
    courtCase: false,
    courtCaseStatus: 'None',
    ownershipDispute: 'No',
    revenueRecord: {
      khataNumber: 'KH-0563',
      pattaNumber: 'PATTA-56-3',
      landClassification: 'Dryland (Punjai)',
      guidelineValuePerAcre: 3700000,
      encumbranceStatus: 'Clear',
      lastJamabandiDate: '05-Jul-2020',
      subRegistrarOffice: 'SRO Omalur'
    },
    gisRecord: {
      elevationMeters: 279.1,
      distanceToCorridorCenterMeters: 24.0,
      intersectionAreaSqM: 7395,
      environmentalZone: 'None',
      waterBodyAdjacent: false,
      satelliteImageDate: '05-Feb-2026'
    },
    acquisitionStatus: 'Pending',
    stage: 'Declaration (Sec 3D/19)',
    notificationDate: '10-Feb-2024',
    compensationStatus: 'Pending',
    estimatedCompensationCrores: 1.45,
    possessionStatus: 'Not Started',
    delayRiskScore: 54,
    riskLevel: 'medium',
    predictedDelayMonths: 2.2,
    predictedDelayRange: '2–3 Months',
    delayConfidence: 'Medium',
    topRiskFactor: 'Missing co-owner power of attorney documentation',
    aiExplanation: 'Medium delay risk. One co-owner resides abroad in Singapore and power of attorney apostille verification is pending.',
    shapFactors: [
      {
        factor: 'NRI Power of Attorney Attestation',
        impactPercent: 26,
        category: 'document',
        description: 'Embassy consular apostille pending for joint bank account mandate.',
        severity: 'MEDIUM'
      }
    ],
    riskFactorsList: ['Overseas POA attestation in progress'],
    recommendedAction: 'Direct CALA legal desk to facilitate digital video conferencing consent affidavit.',
    priority: 'MEDIUM',
    predictedDelayAfterIntervention: 0.8,
    potentialReductionMonths: 1.4,
    interventionStatus: 'Pending',
    assignedOfficer: 'Legal Assistant, CALA Office',
    assignedDueDate: '20-Sep-2026',
    fieldVerified: false,
    gpsCoordinates: { lat: 11.7500, lng: 78.0560 },
    mapCoordinates: [
      [11.7490, 78.0550],
      [11.7512, 78.0555],
      [11.7508, 78.0572],
      [11.7488, 78.0565]
    ],
    centerCoordinate: [11.7500, 78.0560],
    syncStatus: 'Synced',
    lastSyncedAt: '2026-08-23 18:20'
  }
];

export const INITIAL_ALERTS: Alert[] = [
  {
    id: 'ALT-1092',
    level: 'CRITICAL',
    title: 'HIGH RISK ACQUISITION DELAY: Parcel P-0245',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    projectId: 'proj-nh79x',
    parcelId: 'P-0245',
    surveyNumber: '125/2',
    riskScore: 82,
    trigger: 'Civil Court Stay Order Detected (O.S. 412/2023) + 5-Way Partition Dispute',
    reason: 'Interim injunction on possession granted by Sub-Court Omalur with compensation dispute. Predicted delay: 3–5 Months.',
    recommendedAction: 'Early legal verification & refer disputed compensation to LA-RA Authority under Sec 3H(4) to vacate stay.',
    createdAt: '2026-08-23 14:30',
    status: 'Active'
  },
  {
    id: 'ALT-1088',
    level: 'CRITICAL',
    title: 'HIGH RISK ALERT: Parcel P-0556',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    projectId: 'proj-nh79x',
    parcelId: 'P-0556',
    surveyNumber: '310/2A',
    riskScore: 89,
    trigger: 'Stale Mutation (22 Yrs) & 7-Way Heirs Lawsuit',
    reason: 'Title unmutated since 2002; active litigation in District Munsif Court regarding Hindu Succession share. Predicted delay: 5.2 Months.',
    recommendedAction: 'Special Lok Adalat camp at Omalur Taluk office for consensual award distribution.',
    createdAt: '2026-08-23 11:15',
    status: 'Active'
  },
  {
    id: 'ALT-1081',
    level: 'HIGH',
    title: 'LITIGATION RISK ALERT: Parcel P-0312',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    projectId: 'proj-nh79x',
    parcelId: 'P-0312',
    surveyNumber: '204/1',
    riskScore: 78,
    trigger: 'Madras High Court Writ Petition (HR&CE Inam Land)',
    reason: 'Temple trustee challenging private patta classification. Hearing scheduled for 18-Sep-2026.',
    recommendedAction: 'Convene joint district-level coordination meeting with HR&CE Commissioner.',
    createdAt: '2026-08-22 16:40',
    status: 'In Progress',
    assignedTo: 'Dr. Rajeshwari Sundaram, IAS'
  },
  {
    id: 'ALT-1074',
    level: 'MEDIUM',
    title: 'MUTATION LAG WARNING: Parcel P-0189',
    projectName: 'Salem-Chennai Express Highway Corridor (NH-79X)',
    projectId: 'proj-nh79x',
    parcelId: 'P-0189',
    surveyNumber: '118/4B',
    riskScore: 48,
    trigger: 'Legal Heirship Certificate Verification Pending',
    reason: 'Primary owner deceased; award notice service delayed for outstation co-owner.',
    recommendedAction: 'Deploy Special Tahsildar for on-site death certificate endorsement.',
    createdAt: '2026-08-21 09:20',
    status: 'Assigned',
    assignedTo: 'Spl. Tahsildar (LA) Unit-2'
  }
];

export const INITIAL_ACTIONS: CaseAction[] = [
  {
    id: 'ACT-501',
    parcelId: 'P-0245',
    surveyNumber: '125/2',
    title: 'File Petition to Vacate Civil Stay & Deposit Award in LA-RA Authority',
    actionType: 'Legal Verification',
    assignedOfficer: 'Thiru. M. Senthil Kumar, DRO',
    assignedOfficerRole: 'CALA / Special LA Officer',
    priority: 'CRITICAL',
    status: 'Pending',
    dueDate: '2026-08-28',
    createdAt: '2026-08-23 15:00',
    notes: 'Instruct Government Pleader Omalur to submit counter-affidavit citing Supreme Court NHAI acquisition precedence.',
    targetDelayReductionMonths: 2.7
  },
  {
    id: 'ACT-498',
    parcelId: 'P-0189',
    surveyNumber: '118/4B',
    title: 'Special Field Verification & Heirship Endorsement Camp',
    actionType: 'Joint Mutation Camp',
    assignedOfficer: 'Spl. Tahsildar (LA) Unit-2',
    assignedOfficerRole: 'Field Verification Officer',
    priority: 'MEDIUM',
    status: 'In Progress',
    dueDate: '2026-09-05',
    createdAt: '2026-08-22 10:30',
    notes: 'Contact Coimbatore resident co-sharer to obtain bank mandate and indemnity bond.',
    targetDelayReductionMonths: 1.4
  },
  {
    id: 'ACT-492',
    parcelId: 'P-0312',
    surveyNumber: '204/1',
    title: 'Collector-Level Joint Hearing with HR&CE Board',
    actionType: 'Collector Hearing',
    assignedOfficer: 'Dr. Rajeshwari Sundaram, IAS',
    assignedOfficerRole: 'District Collector',
    priority: 'HIGH',
    status: 'In Progress',
    dueDate: '2026-09-10',
    createdAt: '2026-08-21 14:00',
    notes: 'Evaluate Section 3H deposit structure into Temple Trust escrow account.',
    targetDelayReductionMonths: 2.7
  },
  {
    id: 'ACT-485',
    parcelId: 'P-0084',
    surveyNumber: '44/1A',
    title: 'Boundary Geo-tagging & Handover to Construction Contractor',
    actionType: 'Field Geo-Survey',
    assignedOfficer: 'Site Engineer, NHAI PIU',
    assignedOfficerRole: 'Project Engineer',
    priority: 'LOW',
    status: 'Completed',
    dueDate: '2026-08-20',
    createdAt: '2026-08-15 09:00',
    completedAt: '2026-08-20 17:30',
    notes: 'All 4 boundary corner stones DGPS geo-tagged and right of way fencing erected.',
    targetDelayReductionMonths: 0.2
  }
];

export const INITIAL_ALIGNMENTS: AlignmentOption[] = [
  {
    id: 'align-a',
    name: 'Alignment A (Current Gazette Route)',
    code: 'DPR-REV-04-A',
    lengthKm: 68.4,
    affectedParcels: 380,
    highRiskParcels: 28,
    predictedDelayMonths: 4.2,
    estimatedCostCrores: 4620,
    litigationFrictionScore: 74,
    isRecommended: false,
    recommendationReason: 'Direct path along Kamalapuram town edge intersects 19 active litigation clusters in Section 2.',
    pros: ['Shortest travel distance (68.4 km)', 'Lowest initial earthwork capital estimate'],
    cons: ['Passes through 28 high-risk disputed parcels', '4.2 months predicted acquisition delay', 'Severe civil stay order exposure'],
    pathCoordinates: [
      [11.6643, 78.1460],
      [11.6850, 78.1250],
      [11.7230, 78.0820],
      [11.7580, 78.0460],
      [11.7920, 78.0120],
      [11.8350, 77.9850]
    ]
  },
  {
    id: 'align-b',
    name: 'Alignment B (Kamalapuram Northern Agro Bypass)',
    code: 'DPR-REV-04-B-BYPASS',
    lengthKm: 70.8,
    affectedParcels: 342,
    highRiskParcels: 6,
    predictedDelayMonths: 1.1,
    estimatedCostCrores: 4740,
    litigationFrictionScore: 26,
    isRecommended: true,
    recommendationReason: 'Bypasses 22 disputed residential/commercial parcels, avoiding 14 active civil court cases and saving 3.1 months in acquisition schedule for +2.6% civil cost.',
    pros: [
      'Reduces high-risk parcels by 78% (from 28 to 6)',
      'Saves 3.1 months project completion timeline',
      'Zero stay order exposure in Omalur Sub-Court',
      '84% single-owner agricultural dryland parcels'
    ],
    cons: ['+2.4 km additional corridor length', '+₹120 Crores initial civil construction budget'],
    pathCoordinates: [
      [11.6643, 78.1460],
      [11.6850, 78.1250],
      [11.7300, 78.1050],
      [11.7750, 78.0780],
      [11.8050, 78.0350],
      [11.8350, 77.9850]
    ]
  },
  {
    id: 'align-c',
    name: 'Alignment C (Eastern Industrial Belt Link)',
    code: 'DPR-REV-04-C',
    lengthKm: 74.2,
    affectedParcels: 415,
    highRiskParcels: 14,
    predictedDelayMonths: 2.5,
    estimatedCostCrores: 5120,
    litigationFrictionScore: 48,
    isRecommended: false,
    recommendationReason: 'Intersects commercial industrial estates with high guideline compensation valuations.',
    pros: ['Avoids residential settlements', 'Connects Salem Steel Plant corridor directly'],
    cons: ['Highest total project cost (₹5,120 Cr)', '+5.8 km corridor length', 'Higher compensation valuation burden'],
    pathCoordinates: [
      [11.6643, 78.1460],
      [11.6920, 78.1650],
      [11.7450, 78.1320],
      [11.7850, 78.0920],
      [11.8150, 78.0450],
      [11.8350, 77.9850]
    ]
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'LOG-901',
    timestamp: '2026-08-23 15:10',
    officerId: 'user-cala',
    officerName: 'Thiru. M. Senthil Kumar, DRO',
    role: 'CALA / DRO',
    action: 'Created Case Action ACT-501 (Legal Verification)',
    parcelId: 'P-0245',
    surveyNumber: '125/2',
    details: 'Initiated legal action to vacate interim stay in O.S. 412/2023 at Sub-Court Omalur.'
  },
  {
    id: 'LOG-900',
    timestamp: '2026-08-23 14:45',
    officerId: 'user-cala',
    officerName: 'Thiru. M. Senthil Kumar, DRO',
    role: 'CALA / DRO',
    action: 'Executed AI Delay Prediction Engine on Parcel P-0245',
    parcelId: 'P-0245',
    surveyNumber: '125/2',
    details: 'Model generated 82% Delay Probability (High Risk, 3–5 Months delay).'
  },
  {
    id: 'LOG-899',
    timestamp: '2026-08-23 14:40',
    officerId: 'user-cala',
    officerName: 'Thiru. M. Senthil Kumar, DRO',
    role: 'CALA / DRO',
    action: 'Ran Simulated Government Data Sync (e-Courts & Bhoomi — Demo)',
    parcelId: 'P-0245',
    surveyNumber: '125/2',
    details: 'Replayed simulated court case CNR TNSL010045232023 and Patta 904 sample records. No live government connection.'
  }
];

export const INITIAL_SETTINGS: SystemSettings = {
  riskThresholdLowMax: 39,
  riskThresholdMedMax: 69,
  notifyHighRiskParcel: true,
  notifyRiskIncrease: true,
  notifyNewLitigation: true,
  notifyFieldVerification: true,
  notifyWeeklySummary: true,
  autoEscalateDelayDays: 14,
  mlModelSensitivity: 'Balanced'
};

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'High Risk Alert: Parcel P-0245 Flagged',
    message: 'Civil court stay order detected in Sub-Court Omalur. Delay risk: 82%.',
    timestamp: '10 mins ago',
    parcelId: 'P-0245',
    type: 'alert',
    isRead: false,
    severity: 'HIGH'
  },
  {
    id: 'notif-2',
    title: 'Action Due: Legal Verification for P-0245',
    message: 'Action ACT-501 due by 28-Aug-2026 for Government Pleader response.',
    timestamp: '45 mins ago',
    parcelId: 'P-0245',
    type: 'action',
    isRead: false,
    severity: 'HIGH'
  },
  {
    id: 'notif-3',
    title: 'Simulated e-Courts CIS 3.0 Sync Completed (Demo)',
    message: 'Replayed simulated case data for 380 sample parcels. The prototype has no live e-Courts connection.',
    timestamp: '2 hours ago',
    type: 'sync',
    isRead: true,
    severity: 'LOW'
  }
];

/**
 * Generate synthetic parcel intelligence along a project's route coordinates.
 * Generates isolated, realistic parcel records including problems like:
 * - Parcel 1024 -> Ownership Dispute -> Risk: 78%
 * - Parcel 1025 -> Documentation Issue -> Risk: 42%
 * Plus additional parcels with diverse risk categories.
 */
export const generateSyntheticParcelsForProject = (
  projectId: string,
  projectName: string,
  routeCoords: [number, number][]
): Parcel[] => {
  if (!routeCoords || routeCoords.length === 0) {
    routeCoords = [
      [11.6643, 78.1460],
      [11.7580, 78.0460],
      [11.8350, 77.9850]
    ];
  }

  // Template definitions reflecting real-world land acquisition bottlenecks
  const problemTemplates = [
    {
      id: 'P-1001',
      surveyNumber: '101/1A',
      problemName: 'Ownership Dispute',
      category: 'legal' as const,
      riskScore: 82,
      riskLevel: 'high' as const,
      predictedDelayMonths: 5.8,
      predictedDelayRange: '5–7 Months',
      ownerName: 'Thiru. M. Kathiravan & 3 Co-heirs',
      coOwners: ['M. Kathiravan', 'K. Murugesan', 'Smt. Lakshmi Devi', 'K. Selvam'],
      village: 'Kottagoundampatti',
      taluk: 'Omalur',
      district: 'Salem',
      areaAcres: 2.15,
      courtCase: true,
      courtCaseStatus: 'Active - Stay Order' as const,
      ownershipDispute: 'Yes - Partition Suit' as const,
      mutationStatus: 'Disputed' as const,
      documentStatus: 'Disputed' as const,
      aiExplanation: 'Flagged by AI: OS 218/2024 pending in Subordinate Court with ad-interim injunction against acquisition possession notice.',
      topRiskFactor: 'Pending Civil Partition Suit & Stay Order',
      recommendedAction: 'Initiate Lok Adalat mediation & explore micro-realignment',
      priority: 'CRITICAL' as const
    },
    {
      id: 'P-1002',
      surveyNumber: '102/3B',
      problemName: 'Documentation Issue',
      category: 'document' as const,
      riskScore: 64,
      riskLevel: 'medium' as const,
      predictedDelayMonths: 3.4,
      predictedDelayRange: '3–5 Months',
      ownerName: 'Smt. Sarada Ammal & Heirs',
      coOwners: ['Smt. Sarada Ammal', 'P. Natarajan', 'P. Govindasamy'],
      village: 'Karuppur West',
      taluk: 'Salem West',
      district: 'Salem',
      areaAcres: 1.80,
      courtCase: false,
      courtCaseStatus: 'None' as const,
      ownershipDispute: 'No' as const,
      mutationStatus: 'Pending Verification' as const,
      documentStatus: 'Missing Documents' as const,
      aiExplanation: 'Flagged by AI: 30-year parent sale deed missing in Bhoomi archives. Certified copy needed from SRO before award disbursement.',
      topRiskFactor: 'Missing Parent Title Deed & Encumbrance Gap',
      recommendedAction: 'Summon owner for document verification camp at Taluk Office',
      priority: 'MEDIUM' as const
    },
    {
      id: 'P-1003',
      surveyNumber: '103/4',
      problemName: 'Compensation Dispute',
      category: 'compensation' as const,
      riskScore: 47,
      riskLevel: 'medium' as const,
      predictedDelayMonths: 2.9,
      predictedDelayRange: '2–4 Months',
      ownerName: 'M/s Evergreen Agro Warehousing',
      coOwners: ['C. Velumani (Managing Partner)', 'V. Sivakumar'],
      village: 'Vellakkalpatti',
      taluk: 'Omalur',
      district: 'Salem',
      areaAcres: 4.20,
      courtCase: false,
      courtCaseStatus: 'None' as const,
      ownershipDispute: 'No' as const,
      mutationStatus: 'Up-to-date' as const,
      documentStatus: 'Verified' as const,
      aiExplanation: 'Flagged by AI: Commercial facility claiming 3x guideline rate under Section 26(1) market valuation multiplier.',
      topRiskFactor: 'Section 26 Commercial Multiplier Claim',
      recommendedAction: 'Engage District Level Valuation Committee for negotiated settlement',
      priority: 'MEDIUM' as const
    },
    {
      id: 'P-1004',
      surveyNumber: '104/2',
      problemName: 'Joint Heir Conflict',
      category: 'ownership' as const,
      riskScore: 76,
      riskLevel: 'high' as const,
      predictedDelayMonths: 5.2,
      predictedDelayRange: '5–6 Months',
      ownerName: 'Thiru. K. Rajendran & 5 Heirs',
      coOwners: ['K. Rajendran', 'K. Sengodan', 'K. Soundararajan', 'Smt. Revathi', 'Smt. Banumathi', 'K. Thangaraj'],
      village: 'Mallasamudram',
      taluk: 'Tiruchengode',
      district: 'Namakkal',
      areaAcres: 3.40,
      courtCase: true,
      courtCaseStatus: 'Pending Hearing' as const,
      ownershipDispute: 'Yes - Joint Heir Conflict' as const,
      mutationStatus: 'Disputed' as const,
      documentStatus: 'Disputed' as const,
      aiExplanation: 'Flagged by AI: Intestate succession dispute with non-resident legal heirs refusing to sign Form 3D compensation apportionment.',
      topRiskFactor: 'Co-heir Apportionment Impasse & Title Challenge',
      recommendedAction: 'Deposition before CALA / Compensation deposit in LA-RA authority',
      priority: 'HIGH' as const
    },
    {
      id: 'P-1005',
      surveyNumber: '105/1',
      problemName: 'Pending Mutation & Patta Subdivision',
      category: 'mutation' as const,
      riskScore: 34,
      riskLevel: 'low' as const,
      predictedDelayMonths: 1.5,
      predictedDelayRange: '1–2 Months',
      ownerName: 'Thiru. T. Muthusamy',
      coOwners: ['T. Muthusamy', 'M. Venkatesh'],
      village: 'Danishpet',
      taluk: 'Kadaiyampatti',
      district: 'Salem',
      areaAcres: 1.65,
      courtCase: false,
      courtCaseStatus: 'None' as const,
      ownershipDispute: 'No' as const,
      mutationStatus: 'Pending Verification' as const,
      documentStatus: 'Pending Verification' as const,
      aiExplanation: 'Routine spatial subdivision pending with taluk surveyor. No litigation or joint title contestation.',
      topRiskFactor: 'Taluk Surveyor DGPS Subdivision Pending',
      recommendedAction: 'Fast-track Joint DGPS demarcation schedule',
      priority: 'LOW' as const
    },
    {
      id: 'P-1006',
      surveyNumber: '106/5A',
      problemName: 'Clear Title / Ready for Award Enquiry',
      category: 'legal' as const,
      riskScore: 18,
      riskLevel: 'low' as const,
      predictedDelayMonths: 0.6,
      predictedDelayRange: '< 1 Month',
      ownerName: 'Thiru. R. Palanisamy & Son',
      coOwners: ['R. Palanisamy', 'P. Sakthivel'],
      village: 'Periyeri',
      taluk: 'Attur',
      district: 'Salem',
      areaAcres: 2.90,
      courtCase: false,
      courtCaseStatus: 'None' as const,
      ownershipDispute: 'No' as const,
      mutationStatus: 'Up-to-date' as const,
      documentStatus: 'Verified' as const,
      aiExplanation: 'Clear ancestral title verified against Bhoomi and e-Courts records. All consent forms signed under Sec 3G.',
      topRiskFactor: 'Standard Administrative Notice Window',
      recommendedAction: 'Schedule Section 3G Award Hearing for direct disbursement',
      priority: 'LOW' as const
    },
    {
      id: 'P-1007',
      surveyNumber: '107/2B',
      problemName: 'Clear Title / Possession in Progress',
      category: 'legal' as const,
      riskScore: 12,
      riskLevel: 'low' as const,
      predictedDelayMonths: 0.3,
      predictedDelayRange: '0–1 Month',
      ownerName: 'Smt. M. Vasanthi',
      coOwners: ['Smt. M. Vasanthi'],
      village: 'Narasingapuram',
      taluk: 'Attur',
      district: 'Salem',
      areaAcres: 1.45,
      courtCase: false,
      courtCaseStatus: 'None' as const,
      ownershipDispute: 'No' as const,
      mutationStatus: 'Up-to-date' as const,
      documentStatus: 'Verified' as const,
      aiExplanation: 'Compensation disbursed to bank account via DBT. Possession handover formalities under Sec 3E underway.',
      topRiskFactor: 'Final Boundary Marking & Fencing',
      recommendedAction: 'Issue final Section 3E certificate',
      priority: 'LOW' as const
    }
  ];

  const totalPoints = routeCoords.length;

  return problemTemplates.map((tpl, index) => {
    // Interpolate along the route
    const pointRatio = (index + 0.5) / problemTemplates.length;
    const pathIdx = Math.min(
      Math.floor(pointRatio * (totalPoints - 1)),
      totalPoints - 2
    );
    const nextIdx = Math.min(pathIdx + 1, totalPoints - 1);

    const pA = routeCoords[pathIdx];
    const pB = routeCoords[nextIdx];

    const subT = (pointRatio * (totalPoints - 1)) - pathIdx;
    const baseLat = pA[0] + (pB[0] - pA[0]) * Math.max(0, Math.min(1, subT));
    const baseLng = pA[1] + (pB[1] - pA[1]) * Math.max(0, Math.min(1, subT));

    // Perpendicular jitter
    const offsetDirection = (index % 2 === 0 ? 1 : -1);
    const latOffset = offsetDirection * (0.0018 + (index * 0.0004));
    const lngOffset = (index % 3 === 0 ? 1 : -1) * (0.0022 + (index * 0.0003));

    const centerLat = +(baseLat + latOffset).toFixed(6);
    const centerLng = +(baseLng + lngOffset).toFixed(6);

    // Realistic parcel polygon bounds
    const dLat = 0.0012;
    const dLng = 0.0014;
    const mapCoordinates: [number, number][] = [
      [+(centerLat + dLat).toFixed(6), +(centerLng - dLng).toFixed(6)],
      [+(centerLat + dLat * 0.8).toFixed(6), +(centerLng + dLng).toFixed(6)],
      [+(centerLat - dLat).toFixed(6), +(centerLng + dLng * 0.9).toFixed(6)],
      [+(centerLat - dLat * 0.9).toFixed(6), +(centerLng - dLng * 0.8).toFixed(6)]
    ];

    const parcel: Parcel = {
      id: tpl.id,
      surveyNumber: tpl.surveyNumber,
      ulpin: `TN-SLM-2024-${tpl.id.replace('Parcel ', '')}`,
      projectId,
      projectName,
      ownerName: tpl.ownerName,
      coOwners: tpl.coOwners,
      coOwnerCount: tpl.coOwners.length,
      village: tpl.village,
      taluk: tpl.taluk,
      district: tpl.district,
      areaAcres: tpl.areaAcres,
      areaSqMeters: Math.round(tpl.areaAcres * 4046.86),

      mutationStatus: tpl.mutationStatus,
      lastMutationYearsAgo: tpl.riskScore > 70 ? 12 : tpl.riskScore > 40 ? 6 : 2,
      documentStatus: tpl.documentStatus,
      recordFreshnessScore: 100 - tpl.riskScore,
      recordConfidence: tpl.riskScore > 70 ? 'Low' : tpl.riskScore > 40 ? 'Medium' : 'High',

      courtCase: tpl.courtCase,
      courtCaseStatus: tpl.courtCaseStatus,
      ownershipDispute: tpl.ownershipDispute,

      courtRecord: tpl.courtCase ? {
        caseNumber: `O.S. ${tpl.id.replace('Parcel ', '')} / 2024`,
        cnrNumber: `TNSL0100${tpl.id.replace('Parcel ', '')}2024`,
        courtName: `Subordinate Court, ${tpl.taluk}`,
        caseType: 'Original Civil Suit (Partition & Injunction)',
        filingDate: '12-Feb-2024',
        petitioner: tpl.coOwners[tpl.coOwners.length - 1],
        respondent: `${tpl.coOwners[0]} & CALA`,
        caseStatus: tpl.courtCaseStatus,
        nextHearingDate: '18-Nov-2026',
        prayer: `Suit for partition and stay on acquisition of Survey No. ${tpl.surveyNumber}`,
        interimInjunction: tpl.courtCaseStatus === 'Active - Stay Order'
      } : undefined,

      revenueRecord: {
        khataNumber: `KH-${tpl.id.replace('Parcel ', '')}`,
        pattaNumber: `PATTA-${tpl.surveyNumber.replace('/', '-')}`,
        landClassification: index % 2 === 0 ? 'Wetland (Nanjai)' : 'Dryland (Punjai)',
        guidelineValuePerAcre: 3500000 + (index * 250000),
        encumbranceStatus: tpl.riskScore > 70 ? 'Pending Partition' : tpl.riskScore > 40 ? 'Encumbered' : 'Clear',
        lastJamabandiDate: '20-May-2021',
        subRegistrarOffice: `SRO ${tpl.taluk}`
      },

      gisRecord: {
        elevationMeters: 260 + (index * 4),
        distanceToCorridorCenterMeters: 18 + (index * 3),
        intersectionAreaSqM: Math.round(tpl.areaAcres * 4046.86 * 0.85),
        environmentalZone: index === 1 ? 'Buffer Zone' : 'None',
        waterBodyAdjacent: index === 0,
        satelliteImageDate: '15-Feb-2026'
      },

      acquisitionStatus: tpl.riskScore > 70 ? 'Contested' : tpl.riskScore > 40 ? 'Pending' : 'In-Progress',
      stage: tpl.riskScore > 70 ? 'SIA & Objection (Sec 3C/15)' : tpl.riskScore > 40 ? 'Declaration (Sec 3D/19)' : 'Award Inquiry (Sec 3G/23)',
      notificationDate: '10-Jan-2024',
      compensationStatus: tpl.riskScore > 70 ? 'Under Dispute in LA-RA Authority' : tpl.riskScore > 40 ? 'Determined' : 'Pending',
      estimatedCompensationCrores: +(tpl.areaAcres * 1.45).toFixed(2),
      possessionStatus: tpl.riskScore > 70 ? 'Not Started' : tpl.riskScore > 40 ? 'Partial' : 'Complete',

      delayRiskScore: tpl.riskScore,
      riskLevel: tpl.riskLevel,
      predictedDelayMonths: tpl.predictedDelayMonths,
      predictedDelayRange: tpl.predictedDelayRange,
      delayConfidence: tpl.riskScore > 70 ? 'High' : 'Medium',
      topRiskFactor: tpl.topRiskFactor,
      aiExplanation: tpl.aiExplanation,
      shapFactors: [
        {
          factor: tpl.problemName,
          impactPercent: tpl.riskScore > 70 ? 38 : 22,
          category: tpl.category,
          description: tpl.aiExplanation,
          severity: tpl.riskLevel === 'high' ? 'HIGH' : tpl.riskLevel === 'medium' ? 'MEDIUM' : 'LOW'
        },
        {
          factor: 'Co-Sharer Fragmentation',
          impactPercent: tpl.coOwners.length > 2 ? 24 : 10,
          category: 'ownership',
          description: `${tpl.coOwners.length} registered co-owners required to sign acquisition deeds`,
          severity: tpl.coOwners.length > 3 ? 'HIGH' : 'MEDIUM'
        }
      ],
      riskFactorsList: [tpl.problemName, `${tpl.coOwners.length} Co-Owners`, tpl.topRiskFactor],

      recommendedAction: tpl.recommendedAction,
      priority: tpl.priority,
      predictedDelayAfterIntervention: +(tpl.predictedDelayMonths * 0.45).toFixed(1),
      potentialReductionMonths: +(tpl.predictedDelayMonths * 0.55).toFixed(1),
      interventionStatus: 'Pending',

      fieldVerified: false,
      gpsCoordinates: { lat: centerLat, lng: centerLng },
      mapCoordinates,
      centerCoordinate: [centerLat, centerLng],
      syncStatus: 'Synced'
    };

    return parcel;
  });
};
