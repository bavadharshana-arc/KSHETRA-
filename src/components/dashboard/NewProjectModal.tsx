import React, { useMemo, useState } from 'react';
import {
  X,
  MapPin,
  Navigation,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Compass,
  CheckCircle2,
  Circle,
  MousePointerClick,
  Route,
  Layers,
  Info,
  AlertTriangle,
  Search
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { generateSyntheticParcelsForProject } from '../../data/mockData';
import { searchDemoLocations, DEMO_PLANNING_LOCATIONS, DemoLocation } from '../../data/demoLocations';
import { LarrStage } from '../../types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROJECT_TYPES = [
  'National Highway',
  'Expressway',
  'Freight Corridor',
  'Bypass',
  'Other'
] as const;

// The project's existing statutory-stage vocabulary (LARR 2013). Reused as-is so
// the value flows straight into aggregateProjectCaseInput -> /predict as
// acquisition_stage, without a duplicate stage field.
const LARR_STAGES: LarrStage[] = [
  'Notification (Sec 3A/11)',
  'SIA & Objection (Sec 3C/15)',
  'Declaration (Sec 3D/19)',
  'Award Inquiry (Sec 3G/23)',
  'Compensation Disbursement',
  'Possession (Sec 3E/38)'
];

// Informational planner preferences only — no optimization logic consumes these.
const PLANNING_PRIORITIES = [
  'Minimize land acquisition complexity',
  'Minimize corridor length',
  'Avoid dense settlement context',
  'Minimize environmental sensitivity'
];

// Same great-circle approximation already used in AppContext.createProject,
// AppContext.updateProjectRoute and GisMapView (draftLengthKm). Not a new model.
const routeLengthKm = (coords: [number, number][]): number => {
  if (!coords || coords.length < 2) return 0;
  let km = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lon1] = coords[i];
    const [lat2, lon2] = coords[i + 1];
    const dLat = (lat2 - lat1) * 111;
    const dLon = (lon2 - lon1) * 111 * Math.cos((lat1 * Math.PI) / 180);
    km += Math.sqrt(dLat * dLat + dLon * dLon);
  }
  return +km.toFixed(1);
};

// Identical curved-waypoint interpolation the modal already used when handing a
// draft to the map (kept so the preview matches what actually gets created and
// so the existing map waypoint editing picks up a sensible starting geometry).
const buildWaypoints = (s: [number, number], e: [number, number]): [number, number][] => [
  s,
  [
    +(s[0] + (e[0] - s[0]) * 0.25 + 0.008).toFixed(6),
    +(s[1] + (e[1] - s[1]) * 0.25 - 0.006).toFixed(6)
  ],
  [
    +(s[0] + (e[0] - s[0]) * 0.5 - 0.005).toFixed(6),
    +(s[1] + (e[1] - s[1]) * 0.5 + 0.008).toFixed(6)
  ],
  [
    +(s[0] + (e[0] - s[0]) * 0.75 + 0.006).toFixed(6),
    +(s[1] + (e[1] - s[1]) * 0.75 - 0.004).toFixed(6)
  ],
  e
];

const parseLat = (v: string): number | null => {
  const n = parseFloat(v);
  if (isNaN(n) || n < -90 || n > 90) return null;
  return n;
};
const parseLng = (v: string): number | null => {
  const n = parseFloat(v);
  if (isNaN(n) || n < -180 || n > 180) return null;
  return n;
};

type Stage = 1 | 2 | 3;

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose }) => {
  const { startRouteDraft, createProject, setActiveTab } = useApp();

  const [stage, setStage] = useState<Stage>(1);

  // Stage 01 — Project
  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState<(typeof PROJECT_TYPES)[number]>('National Highway');
  const [currentStage, setCurrentStage] = useState<LarrStage>('Notification (Sec 3A/11)');

  // Stage 02 — Alignment
  const [startPointName, setStartPointName] = useState('');
  const [endPointName, setEndPointName] = useState('');
  const [startLat, setStartLat] = useState('');
  const [startLng, setStartLng] = useState('');
  const [endLat, setEndLat] = useState('');
  const [endLng, setEndLng] = useState('');
  const [startSearch, setStartSearch] = useState('');
  const [endSearch, setEndSearch] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  // How each endpoint's coordinates were resolved (drives the display distinction
  // between a picked demo location, a map-picked point, and raw coordinates).
  const [startSource, setStartSource] = useState<'demo' | 'map' | 'custom' | null>(null);
  const [endSource, setEndSource] = useState<'demo' | 'map' | 'custom' | null>(null);
  const [startDistrict, setStartDistrict] = useState('');
  const [endDistrict, setEndDistrict] = useState('');
  const [alignmentGenerated, setAlignmentGenerated] = useState(false);

  // Stage 03 — priorities
  const [priorities, setPriorities] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);

  const resetAll = () => {
    setStage(1);
    setProjectName('');
    setProjectType('National Highway');
    setCurrentStage('Notification (Sec 3A/11)');
    setStartPointName('');
    setEndPointName('');
    setStartLat('');
    setStartLng('');
    setEndLat('');
    setEndLng('');
    setStartSearch('');
    setEndSearch('');
    setStartOpen(false);
    setEndOpen(false);
    setStartSource(null);
    setEndSource(null);
    setStartDistrict('');
    setEndDistrict('');
    setAlignmentGenerated(false);
    setPriorities([]);
    setError(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // --- Coordinate state (validated) ---
  const sLat = parseLat(startLat);
  const sLng = parseLng(startLng);
  const eLat = parseLat(endLat);
  const eLng = parseLng(endLng);
  const startFilled = startLat.trim() !== '' || startLng.trim() !== '';
  const endFilled = endLat.trim() !== '' || endLng.trim() !== '';
  const startInvalid = startFilled && (sLat === null || sLng === null);
  const endInvalid = endFilled && (eLat === null || eLng === null);
  const validStart = sLat !== null && sLng !== null;
  const validEnd = eLat !== null && eLng !== null;
  const startCoord: [number, number] | undefined = validStart ? [sLat as number, sLng as number] : undefined;
  const endCoord: [number, number] | undefined = validEnd ? [eLat as number, eLng as number] : undefined;
  const samePoint =
    validStart &&
    validEnd &&
    Math.abs((sLat as number) - (eLat as number)) < 1e-4 &&
    Math.abs((sLng as number) - (eLng as number)) < 1e-4;

  const alignmentReady = validStart && validEnd && !samePoint;

  const startKey = validStart ? `${sLat},${sLng}` : '';
  const endKey = validEnd ? `${eLat},${eLng}` : '';

  const previewRoute = useMemo<[number, number][]>(() => {
    if (startCoord && endCoord && !samePoint) return buildWaypoints(startCoord, endCoord);
    if (startCoord) return [startCoord];
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, endKey, samePoint]);

  const corridorLengthKm = useMemo(() => routeLengthKm(previewRoute), [previewRoute]);

  // Corridor land context — computed from the SAME synthetic parcel generator the
  // app uses on project creation, so the preview equals what will be created.
  // Purely synthetic demonstration data.
  const context = useMemo(() => {
    if (!alignmentReady || previewRoute.length < 2) return null;
    const parcels = generateSyntheticParcelsForProject(
      'preview',
      projectName.trim() || 'Proposed Corridor',
      previewRoute
    );
    const high = parcels.filter(p => p.riskLevel === 'high').length;
    const medium = parcels.filter(p => p.riskLevel === 'medium').length;
    const low = parcels.filter(p => p.riskLevel === 'low').length;

    const agricultural = parcels.filter(p => {
      const c = p.revenueRecord?.landClassification;
      return c === 'Wetland (Nanjai)' || c === 'Dryland (Punjai)' || c === 'Manavari';
    }).length;
    const commercial = parcels.filter(p => p.revenueRecord?.landClassification === 'Commercial').length;
    const govtLand = parcels.filter(p => p.revenueRecord?.landClassification === 'Government Poramboke').length;
    const envSensitive = parcels.filter(
      p => p.gisRecord && p.gisRecord.environmentalZone !== 'None'
    ).length;
    const waterAdjacent = parcels.filter(p => p.gisRecord?.waterBodyAdjacent).length;

    // Mirrors aggregateProjectCaseInput() problem-count logic.
    const litigation = parcels.filter(
      p => p.courtCase || p.courtCaseStatus !== 'None' || p.courtRecord?.interimInjunction
    ).length;
    const ownershipDisputes = parcels.filter(p => p.ownershipDispute && p.ownershipDispute !== 'No').length;
    const compensationPending = parcels.filter(p => p.compensationStatus !== 'Disbursed 100%').length;

    return {
      dossiers: parcels.length,
      high,
      medium,
      low,
      agricultural,
      commercial,
      govtLand,
      envSensitive,
      waterAdjacent,
      litigation,
      ownershipDisputes,
      compensationPending,
      compensationPendingPct: Math.round((compensationPending / parcels.length) * 100),
      // createProject widens the modelled dossiers with a fixed +120 RoW estimate.
      corridorEstimate: parcels.length + 120
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, endKey, samePoint, previewRoute, projectName, alignmentReady]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: {
    name: string;
    startPoint: string;
    endPoint: string;
    sLat: number;
    sLng: number;
    eLat: number;
    eLng: number;
  }) => {
    setProjectName(preset.name);
    setStartPointName(preset.startPoint);
    setEndPointName(preset.endPoint);
    setStartLat(preset.sLat.toFixed(6));
    setStartLng(preset.sLng.toFixed(6));
    setEndLat(preset.eLat.toFixed(6));
    setEndLng(preset.eLng.toFixed(6));
    setStartSearch(preset.startPoint);
    setEndSearch(preset.endPoint);
    setStartSource('demo');
    setEndSource('demo');
    setStartDistrict(DEMO_PLANNING_LOCATIONS.find(l => l.name === preset.startPoint)?.district || '');
    setEndDistrict(DEMO_PLANNING_LOCATIONS.find(l => l.name === preset.endPoint)?.district || '');
    setAlignmentGenerated(false);
    setError(null);
  };

  const pickLocation = (which: 'start' | 'end', loc: DemoLocation) => {
    if (which === 'start') {
      setStartPointName(loc.name);
      setStartDistrict(loc.district);
      setStartSource('demo');
      setStartLat(loc.lat.toFixed(5));
      setStartLng(loc.lng.toFixed(5));
      setStartSearch(loc.name);
      setStartOpen(false);
    } else {
      setEndPointName(loc.name);
      setEndDistrict(loc.district);
      setEndSource('demo');
      setEndLat(loc.lat.toFixed(5));
      setEndLng(loc.lng.toFixed(5));
      setEndSearch(loc.name);
      setEndOpen(false);
    }
    setAlignmentGenerated(false);
    setError(null);
  };

  const togglePriority = (p: string) => {
    setPriorities(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));
  };

  const draftPayload = () => ({
    name: projectName.trim(),
    projectType,
    currentLarrStage: currentStage,
    planningPriorities: priorities.length > 0 ? priorities : undefined,
    startPointName: startPointName.trim() || undefined,
    endPointName: endPointName.trim() || undefined,
    startCoords: startCoord,
    endCoords: endCoord
  });

  // Hand off to the existing GIS map for point selection / waypoint editing.
  const handleSelectOnMap = (target: 'start' | 'end' | 'both') => {
    if (!projectName.trim()) {
      setError('Enter a Project Name in Stage 01 before selecting points on the map.');
      setStage(1);
      return;
    }
    if (target === 'both' && samePoint) {
      setError('Start and End cannot be the same location.');
      return;
    }

    let step: 'select-start' | 'select-end' | 'edit-route' = 'select-start';
    if (target === 'start') step = 'select-start';
    else if (target === 'end') step = 'select-end';
    else if (!validStart) step = 'select-start';
    else if (!validEnd) step = 'select-end';
    else step = 'edit-route';

    let initialRoute: [number, number][] = [];
    if (startCoord && endCoord && !samePoint) initialRoute = buildWaypoints(startCoord, endCoord);
    else if (startCoord) initialRoute = [startCoord];

    startRouteDraft(draftPayload(), initialRoute, true, step, startCoord, endCoord);
    handleClose();
  };

  const handleGenerateAlignment = () => {
    if (!validStart || !validEnd) {
      setError('Provide a valid Start and End (search, map, or manual coordinates) first.');
      return;
    }
    if (samePoint) {
      setError('Start and End cannot be the same location.');
      return;
    }
    setError(null);
    setAlignmentGenerated(true);
  };

  const handleResetAlignment = () => {
    setAlignmentGenerated(false);
  };

  // Create the project directly (curved alignment auto-built from the two points).
  // Uses the existing createProject orchestration, which also sets the new project
  // as the active project and generates its synthetic parcels.
  const handleCreateProject = () => {
    if (!projectName.trim()) {
      setError('Project Name is required.');
      setStage(1);
      return;
    }
    if (!startCoord || !endCoord) {
      setError('A valid Start and End are required to define the alignment.');
      setStage(2);
      return;
    }
    if (samePoint) {
      setError('Start and End cannot be the same location.');
      setStage(2);
      return;
    }

    const waypoints = buildWaypoints(startCoord, endCoord);

    createProject({
      name: projectName.trim(),
      code: '',
      department: 'Ministry of Road Transport & Highways (MoRTH)',
      agency: 'NHAI',
      totalLengthKm: 0, // createProject derives this from corridorPath
      projectValueCrores: 1500,
      totalParcels: 150,
      acquiredParcels: 30,
      pendingParcels: 120,
      highRiskParcels: 0,
      medRiskParcels: 0,
      lowRiskParcels: 0,
      predictedDelayMonths: 3.5,
      status: 'On Track',
      currentLarrStage: currentStage,
      corridorSections: [],
      corridorPath: waypoints,
      startPointName: startPointName.trim() || `Point (${startCoord[0].toFixed(4)}, ${startCoord[1].toFixed(4)})`,
      endPointName: endPointName.trim() || `Point (${endCoord[0].toFixed(4)}, ${endCoord[1].toFixed(4)})`,
      startCoords: startCoord,
      endCoords: endCoord,
      projectType,
      planningPriorities: priorities.length > 0 ? priorities : undefined
    });

    handleClose();
    setActiveTab('map');
  };

  const goNext = () => {
    if (stage === 1) {
      if (!projectName.trim()) {
        setError('Project Name is required to continue.');
        return;
      }
      setError(null);
      setStage(2);
    } else if (stage === 2) {
      if (validStart && validEnd && samePoint) {
        setError('Start and End cannot be the same location.');
        return;
      }
      if ((startInvalid || endInvalid)) {
        setError('Fix the invalid coordinates before continuing.');
        return;
      }
      setError(null);
      setStage(3);
    }
  };

  const goBack = () => {
    setError(null);
    setStage(prev => (prev > 1 ? ((prev - 1) as Stage) : prev));
  };

  const canJumpTo = (n: Stage) => n < stage || (!!projectName.trim() && (n === 2 || n === 3));

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-6">
        {/* Modal Header */}
        <div className="bg-navy-900 px-6 py-4 text-white flex items-center justify-between border-b border-navy-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Create New Highway Project</h2>
              <p className="text-xs text-slate-300">
                Highway Corridor Planning &bull; Project &rarr; Alignment &rarr; Land Context
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stage Tabs */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2">
          <StageTab n={1} label="PROJECT" stage={stage} onJump={setStage} canJump={canJumpTo} clearErr={() => setError(null)} />
          <div className="h-px flex-1 bg-slate-200" />
          <StageTab n={2} label="ALIGNMENT" stage={stage} onJump={setStage} canJump={canJumpTo} clearErr={() => setError(null)} />
          <div className="h-px flex-1 bg-slate-200" />
          <StageTab n={3} label="LAND CONTEXT" stage={stage} onJump={setStage} canJump={canJumpTo} clearErr={() => setError(null)} />
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[64vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ============================ STAGE 01 — PROJECT ============================ */}
          {stage === 1 && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    Optional Demonstration Presets
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleApplyPreset({
                        name: 'Salem–Namakkal Expressway Extension (NH-44X)',
                        startPoint: 'Salem Junction (Kandhampatti Bypass)',
                        endPoint: 'Namakkal Central Corridor',
                        sLat: 11.6643,
                        sLng: 78.146,
                        eLat: 11.2189,
                        eLng: 78.1674
                      })
                    }
                    className="px-2.5 py-2 text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all text-xs"
                  >
                    <div className="font-semibold text-slate-800 truncate">Salem &rarr; Namakkal</div>
                    <div className="text-[10px] text-slate-500">NH-44X</div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleApplyPreset({
                        name: 'Omalur–Mettur Industrial Freight Link',
                        startPoint: 'Omalur Railway Flyover',
                        endPoint: 'Mettur Dam Industrial Park',
                        sLat: 11.742,
                        sLng: 78.041,
                        eLat: 11.795,
                        eLng: 77.801
                      })
                    }
                    className="px-2.5 py-2 text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all text-xs"
                  >
                    <div className="font-semibold text-slate-800 truncate">Omalur &rarr; Mettur</div>
                    <div className="text-[10px] text-slate-500">Freight Link</div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleApplyPreset({
                        name: 'Attur–Rasipuram Agro Bypass Corridor',
                        startPoint: 'Attur Town Bypass',
                        endPoint: 'Rasipuram Ring Road',
                        sLat: 11.598,
                        sLng: 78.599,
                        eLat: 11.464,
                        eLng: 78.178
                      })
                    }
                    className="px-2.5 py-2 text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all text-xs"
                  >
                    <div className="font-semibold text-slate-800 truncate">Attur &rarr; Rasipuram</div>
                    <div className="text-[10px] text-slate-500">Agro Bypass</div>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Prototype presets fill Start/End demo points. Alternative-alignment comparison is available for
                  demonstration on the Corridor Analysis screen.
                </p>
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Salem–Namakkal Highway"
                  value={projectName}
                  onChange={e => {
                    setProjectName(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Project Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Project Type</label>
                  <select
                    value={projectType}
                    onChange={e => setProjectType(e.target.value as (typeof PROJECT_TYPES)[number])}
                    className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                  >
                    {PROJECT_TYPES.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Current Acquisition Stage */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Current Acquisition Stage</label>
                  <select
                    value={currentStage}
                    onChange={e => setCurrentStage(e.target.value as LarrStage)}
                    className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                  >
                    {LARR_STAGES.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 -mt-2">
                The selected stage is used as the project's <span className="font-mono">acquisition_stage</span> input
                for the existing project-level prediction workflow (LARR 2013 vocabulary).
              </p>
            </>
          )}

          {/* ============================ STAGE 02 — ALIGNMENT ============================ */}
          {stage === 2 && (
            <>
              <div className="text-[11px] text-slate-500 bg-blue-50/60 border border-blue-100 rounded-xl px-3 py-2 flex items-start gap-2">
                <Route className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Define the <strong className="text-slate-700">proposed corridor</strong> by choosing a Start and End.
                  You can pick a demonstration location, select on the GIS map, or enter coordinates directly — all
                  three update the same point.
                </span>
              </div>

              <LocationField
                kind="start"
                label="Start Location"
                icon={<MapPin className="w-4 h-4 text-emerald-600" />}
                tone="emerald"
                pointName={startPointName}
                lat={startLat}
                lng={startLng}
                invalid={startInvalid}
                valid={validStart}
                search={startSearch}
                open={startOpen}
                onSearch={v => {
                  setStartSearch(v);
                  setStartOpen(true);
                }}
                onFocus={() => setStartOpen(true)}
                onBlur={() => setTimeout(() => setStartOpen(false), 150)}
                source={startSource}
                district={startDistrict}
                onPick={loc => pickLocation('start', loc)}
                onLat={v => {
                  setStartLat(v);
                  setStartSource('custom');
                  setStartPointName('Custom coordinates');
                  setStartDistrict('');
                  setStartSearch('');
                  setAlignmentGenerated(false);
                  if (error) setError(null);
                }}
                onLng={v => {
                  setStartLng(v);
                  setStartSource('custom');
                  setStartPointName('Custom coordinates');
                  setStartDistrict('');
                  setStartSearch('');
                  setAlignmentGenerated(false);
                  if (error) setError(null);
                }}
                onSelectMap={() => handleSelectOnMap('start')}
              />

              <LocationField
                kind="end"
                label="End Location"
                icon={<Navigation className="w-4 h-4 text-red-600" />}
                tone="red"
                pointName={endPointName}
                lat={endLat}
                lng={endLng}
                invalid={endInvalid}
                valid={validEnd}
                search={endSearch}
                open={endOpen}
                onSearch={v => {
                  setEndSearch(v);
                  setEndOpen(true);
                }}
                onFocus={() => setEndOpen(true)}
                onBlur={() => setTimeout(() => setEndOpen(false), 150)}
                source={endSource}
                district={endDistrict}
                onPick={loc => pickLocation('end', loc)}
                onLat={v => {
                  setEndLat(v);
                  setEndSource('custom');
                  setEndPointName('Custom coordinates');
                  setEndDistrict('');
                  setEndSearch('');
                  setAlignmentGenerated(false);
                  if (error) setError(null);
                }}
                onLng={v => {
                  setEndLng(v);
                  setEndSource('custom');
                  setEndPointName('Custom coordinates');
                  setEndDistrict('');
                  setEndSearch('');
                  setAlignmentGenerated(false);
                  if (error) setError(null);
                }}
                onSelectMap={() => handleSelectOnMap('end')}
              />

              {samePoint && (
                <div className="text-[11px] text-red-600 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Start and End are the same location. Choose two different points.
                </div>
              )}

              {/* Generate proposed alignment */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateAlignment}
                  disabled={!alignmentReady}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <Route className="w-3.5 h-3.5" />
                  <span>Generate Proposed Alignment</span>
                </button>
                {alignmentGenerated && (
                  <button
                    type="button"
                    onClick={handleResetAlignment}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition-colors"
                  >
                    Reset Alignment
                  </button>
                )}
              </div>

              {alignmentGenerated && alignmentReady && (
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Proposed Planning Alignment
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600">
                      {(startPointName.trim() || 'Start')} &rarr; {(endPointName.trim() || 'End')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    <AlignNode color="emerald" label={startPointName.trim() || 'Start'} />
                    {previewRoute.slice(1, -1).map((_, i) => (
                      <React.Fragment key={i}>
                        <span className="text-slate-300 font-bold shrink-0">━━</span>
                        <AlignNode color="blue" label={`WP${i + 1}`} />
                      </React.Fragment>
                    ))}
                    <span className="text-slate-300 font-bold shrink-0">━━</span>
                    <AlignNode color="red" label={endPointName.trim() || 'End'} />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Route className="w-3.5 h-3.5 text-blue-600" />
                      <span>Proposed corridor length</span>
                    </div>
                    <span className="text-lg font-black text-slate-900">{corridorLengthKm} km</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Preliminary planning alignment — subject to engineering and statutory review. Length is calculated
                    from the alignment geometry; it recalculates if you drag waypoints on the GIS map.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSelectOnMap('both')}
                    className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Open alignment on the GIS map (drag waypoints, add / reset)</span>
                  </button>
                </div>
              )}

              {!alignmentGenerated && (
                <button
                  type="button"
                  onClick={() => handleSelectOnMap('both')}
                  className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>
                    {validStart && validEnd ? 'Set / refine both points on the GIS map' : 'Pick points directly on the GIS map'}
                  </span>
                </button>
              )}
            </>
          )}

          {/* ============================ STAGE 03 — LAND CONTEXT ============================ */}
          {stage === 3 && (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  <strong>Demonstration data — not live government land records.</strong> The prototype uses synthetic
                  parcels to demonstrate the GIS workflow. In production the same spatial-analysis pipeline would
                  consume authorised cadastral and land-record data.
                </p>
              </div>

              {context ? (
                <>
                  {/* Corridor land context */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-navy-900 text-white flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider">Corridor Land Context</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                        Synthetic
                      </span>
                    </div>
                    <div className="p-4 space-y-3 bg-white">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <Metric label="Modeled parcels" value={context.dossiers} />
                        <Metric label="Agricultural" value={context.agricultural} />
                        <Metric label="Commercial / Ind." value={context.commercial} tone={context.commercial ? 'slate' : 'muted'} />
                        <Metric
                          label="Env. sensitive"
                          value={context.envSensitive}
                          tone={context.envSensitive ? 'amber' : 'muted'}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Modeled corridor context along the proposed alignment ({corridorLengthKm} km). On creation the
                        corridor widens to an estimated <strong className="text-slate-500">~{context.corridorEstimate} parcels</strong>{' '}
                        across the right-of-way. Synthetic demonstration parcels — not actual affected land.
                      </p>
                    </div>
                  </div>

                  {/* Potential acquisition exposure */}
                  <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Potential Acquisition Exposure <span className="normal-case font-medium text-slate-400">(modeled)</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <Metric label="Litigation exposure" value={context.litigation} tone={context.litigation ? 'red' : 'emerald'} />
                      <Metric label="Ownership disputes" value={context.ownershipDisputes} tone={context.ownershipDisputes ? 'red' : 'emerald'} />
                      <Metric label="Compensation pending" value={`${context.compensationPendingPct}%`} tone="amber" />
                      <Metric label="High delay concern" value={context.high} tone={context.high ? 'red' : 'emerald'} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-500">
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                        <span>Acquisition stage</span>
                        <span className="font-semibold text-slate-700 truncate max-w-[150px]">{currentStage}</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                        <span>Settlement density</span>
                        <span className="font-semibold text-slate-400">Not available in prototype</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Counts are derived from the synthetic parcels only (same logic the project-level model aggregates).
                      They are indicative of acquisition complexity, not a legal determination of affected land.
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center gap-2">
                  <Info className="w-4 h-4 text-slate-400 shrink-0" />
                  Define a valid Start and End in the ALIGNMENT stage to see the modeled corridor land context.
                </div>
              )}

              {/* Planning priorities (informational only) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Planning Priorities <span className="text-slate-400 font-medium normal-case">(optional)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PLANNING_PRIORITIES.map(p => (
                    <label
                      key={p}
                      className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer px-2.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={priorities.includes(p)}
                        onChange={() => togglePriority(p)}
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">
                  Informational only — recorded on the project. KSHETRA does not automatically select or optimize the
                  route.
                </p>
              </div>

              {/* Acquisition readiness */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Acquisition Readiness</div>
                <div className="space-y-1.5 text-xs">
                  <ReadyRow
                    state={projectName.trim() && projectType ? 'ok' : 'todo'}
                    label={`Project information${projectName.trim() ? ` — ${projectType}` : ''}`}
                  />
                  <ReadyRow state={alignmentReady ? 'ok' : 'todo'} label="Proposed alignment (Start + End + corridor)" />
                  <ReadyRow state={context ? 'ok' : 'todo'} label="Corridor context available" />
                  <ReadyRow state="warn" label="Acquisition data: demonstration only" />
                  <ReadyRow state="none" label="Live government verification: not connected" />
                </div>
              </div>

              {/* Create summary */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white text-[11px] text-slate-600 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Review</div>
                <SummaryRow k="Project" v={`${projectName.trim() || '—'} · ${projectType} · ${currentStage}`} />
                <SummaryRow
                  k="Alignment"
                  v={
                    alignmentReady
                      ? `${startPointName.trim() || 'Start'} → ${endPointName.trim() || 'End'} · ${corridorLengthKm} km`
                      : 'Start / End not fully defined'
                  }
                />
                <SummaryRow
                  k="Coordinates"
                  v={
                    validStart && validEnd
                      ? `${(sLat as number).toFixed(4)}, ${(sLng as number).toFixed(4)} → ${(eLat as number).toFixed(4)}, ${(eLng as number).toFixed(4)}`
                      : '—'
                  }
                />
                <SummaryRow k="Land context" v={context ? `${context.dossiers} modeled parcels (synthetic demo)` : 'Not available'} />
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={stage === 1 ? handleClose : goBack}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5"
          >
            {stage === 1 ? (
              'Cancel'
            ) : (
              <>
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </>
            )}
          </button>

          {stage < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition-all hover:shadow-lg"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              id="btn-confirm-create-project"
              onClick={handleCreateProject}
              disabled={!projectName.trim() || !validStart || !validEnd || samePoint}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition-all hover:shadow-lg"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Create Project</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const StageTab: React.FC<{
  n: Stage;
  label: string;
  stage: Stage;
  onJump: (n: Stage) => void;
  canJump: (n: Stage) => boolean;
  clearErr: () => void;
}> = ({ n, label, stage, onJump, canJump, clearErr }) => {
  const active = stage === n;
  const done = stage > n;
  return (
    <button
      type="button"
      onClick={() => {
        if (canJump(n)) {
          clearErr();
          onJump(n);
        }
      }}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : done
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-slate-100 text-slate-500'
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
          active ? 'bg-white/20' : done ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-500'
        }`}
      >
        {done ? <CheckCircle2 className="w-3 h-3" /> : `0${n}`}
      </span>
      {label}
    </button>
  );
};

const LocationField: React.FC<{
  kind: 'start' | 'end';
  label: string;
  icon: React.ReactNode;
  tone: 'emerald' | 'red';
  pointName: string;
  district: string;
  source: 'demo' | 'map' | 'custom' | null;
  lat: string;
  lng: string;
  invalid: boolean;
  valid: boolean;
  search: string;
  open: boolean;
  onSearch: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onPick: (loc: DemoLocation) => void;
  onLat: (v: string) => void;
  onLng: (v: string) => void;
  onSelectMap: () => void;
}> = ({
  kind,
  label,
  icon,
  tone,
  pointName,
  district,
  source,
  lat,
  lng,
  invalid,
  valid,
  search,
  open,
  onSearch,
  onFocus,
  onBlur,
  onPick,
  onLat,
  onLng,
  onSelectMap
}) => {
  const results = open ? searchDemoLocations(search) : [];
  const toneChip =
    tone === 'emerald'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : 'bg-red-100 text-red-800 border-red-300';
  const coordText = valid ? `Lat ${parseFloat(lat).toFixed(5)}   Lng ${parseFloat(lng).toFixed(5)}` : null;
  // Search text the user has typed but not yet turned into a selection.
  const unconfirmedSearch = search.trim() !== '' && (source === null || search.trim() !== pointName);

  return (
    <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          {icon}
          <span>{label}</span>
        </div>
        {valid ? (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${toneChip}`}>
            <CheckCircle2 className="w-3 h-3" />
            {parseFloat(lat).toFixed(5)}, {parseFloat(lng).toFixed(5)}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-slate-400">Not selected yet</span>
        )}
      </div>

      {/* Search demo location directory */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search demonstration town, junction, village or landmark"
          value={search}
          onChange={e => onSearch(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-slate-900"
        />
        {open && results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {results.map(loc => (
              <button
                key={`${kind}-${loc.name}`}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onPick(loc)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-100 last:border-0"
              >
                <div className="font-semibold text-slate-800">{loc.name}</div>
                <div className="text-[10px] text-slate-500">
                  {loc.kind} · {loc.district} · {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resolved-point status — distinct for demo location / map point / raw coordinates */}
      {source === 'demo' && valid && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Selected location</div>
          <div className="text-xs font-semibold text-slate-800">{pointName}</div>
          {district && <div className="text-[10px] text-slate-500">{district} District, Tamil Nadu</div>}
          {coordText && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{coordText}</div>}
        </div>
      )}
      {source === 'map' && valid && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
          <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Custom map location</div>
          {coordText && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{coordText}</div>}
        </div>
      )}
      {source === 'custom' && valid && (
        <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2">
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Custom coordinates</div>
          {coordText && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{coordText}</div>}
        </div>
      )}
      {unconfirmedSearch && (
        <div className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          {source
            ? `Unconfirmed search — currently using "${pointName}". Pick a result to change it.`
            : 'Type and pick a location from the list, or enter coordinates below.'}
        </div>
      )}

      {/* Manual coordinates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Latitude</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="-90 to 90"
            value={lat}
            onChange={e => onLat(e.target.value)}
            className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded-lg focus:outline-none text-slate-900 font-mono ${
              invalid ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
            }`}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Longitude</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="-180 to 180"
            value={lng}
            onChange={e => onLng(e.target.value)}
            className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded-lg focus:outline-none text-slate-900 font-mono ${
              invalid ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
            }`}
          />
        </div>
      </div>
      {invalid && (
        <div className="text-[10px] text-red-600 font-semibold">
          Enter a valid latitude (-90 to 90) and longitude (-180 to 180).
        </div>
      )}

      <button
        type="button"
        id={kind === 'start' ? 'btn-select-start-on-map' : 'btn-select-end-on-map'}
        onClick={onSelectMap}
        className="w-full px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
      >
        <MousePointerClick className="w-3.5 h-3.5 text-blue-600" />
        <span>Select {label} on Map</span>
      </button>
    </div>
  );
};

const AlignNode: React.FC<{ color: 'emerald' | 'blue' | 'red'; label: string }> = ({ color, label }) => {
  const dot = color === 'emerald' ? 'text-emerald-500' : color === 'red' ? 'text-red-500' : 'text-blue-500';
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <Circle className={`w-3 h-3 fill-current ${dot}`} />
      <span className="text-[9px] font-semibold text-slate-500 max-w-[64px] truncate">{label}</span>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: React.ReactNode; tone?: 'slate' | 'red' | 'amber' | 'emerald' | 'muted' }> = ({
  label,
  value,
  tone = 'slate'
}) => {
  const map = {
    slate: 'bg-slate-50 border-slate-200 text-slate-900',
    red: 'bg-red-50 border-red-200 text-red-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    muted: 'bg-slate-50 border-slate-200 text-slate-400'
  } as const;
  return (
    <div className={`p-2.5 rounded-lg border ${map[tone]}`}>
      <div className="text-[9px] uppercase font-bold opacity-70">{label}</div>
      <div className="text-lg font-black">{value}</div>
    </div>
  );
};

const ReadyRow: React.FC<{ state: 'ok' | 'todo' | 'warn' | 'none'; label: string }> = ({ state, label }) => {
  const icon =
    state === 'ok' ? (
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
    ) : state === 'warn' ? (
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
    ) : state === 'none' ? (
      <Circle className="w-3.5 h-3.5 text-slate-300" />
    ) : (
      <Circle className="w-3.5 h-3.5 text-slate-300" />
    );
  const cls =
    state === 'ok' ? 'text-slate-700' : state === 'warn' ? 'text-amber-700' : 'text-slate-400';
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className={cls}>{label}</span>
    </div>
  );
};

const SummaryRow: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-slate-400 font-semibold shrink-0">{k}</span>
    <span className="text-slate-700 text-right">{v}</span>
  </div>
);
