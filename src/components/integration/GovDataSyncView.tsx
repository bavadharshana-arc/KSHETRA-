import React, { useState } from 'react';
import { 
  RefreshCw, 
  Building, 
  Gavel, 
  Map as MapIcon, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  ShieldCheck, 
  Search, 
  Code, 
  Sparkles,
  ExternalLink,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { simulateGovernmentSync, SyncLogStep } from '../../services/apiSimulation';

export const GovDataSyncView: React.FC = () => {
  const { parcels, openParcelDetail } = useApp();

  const [selectedParcelId, setSelectedParcelId] = useState<string>('P-0245');
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [activeSyncLogs, setActiveSyncLogs] = useState<SyncLogStep[]>([]);
  const [activeSourceTab, setActiveSourceTab] = useState<'land' | 'bhoomi' | 'ulpin' | 'ecourts' | 'bhuvan'>('land');
  const [showJsonInspector, setShowJsonInspector] = useState<boolean>(false);

  const selectedParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0];

  const handleSyncSelected = async () => {
    setIsSyncingAll(true);
    setActiveSyncLogs([]);
    try {
      await simulateGovernmentSync(selectedParcel, (step) => {
        setActiveSyncLogs(prev => [...prev, step]);
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
              Government Data Sources Integration Layer
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              Simulated Integration — Demo
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Demo walkthrough of proposed integration with Tamil Nilam, Bhoomi Rashi, ULPIN/Bhu-Naksha, NJDG/e-Courts CIS 3.0, and Bhuvan ISRO GIS. None of these sources are actually connected — all records shown are fabricated sample data.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncSelected}
            disabled={isSyncingAll}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
            <span>{isSyncingAll ? 'Running Demo Sync...' : 'Run Simulated Sync (Demo)'}</span>
          </button>
        </div>
      </div>

      {/* Target Parcel Selector Card */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
            API
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">Select Land Parcel for Simulated API Query (Demo)</div>
            <div className="text-[11px] text-slate-500">Replays a scripted demo response for each of the 5 proposed government data sources</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedParcelId}
            onChange={(e) => setSelectedParcelId(e.target.value)}
            className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:border-purple-500"
          >
            {parcels.map(p => (
              <option key={p.id} value={p.id}>
                {p.id} — Survey {p.surveyNumber} ({p.ownerName})
              </option>
            ))}
          </select>

          <button
            onClick={() => openParcelDetail(selectedParcel.id)}
            className="px-3 py-2 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold rounded-xl"
          >
            Open Dossier
          </button>
        </div>
      </div>

      {/* Simulated sync progress output (demo, when running) */}
      {isSyncingAll && activeSyncLogs.length > 0 && (
        <div className="p-4 bg-navy-900 rounded-2xl border border-navy-800 text-slate-200 shadow-md space-y-2 text-xs">
          <div className="font-bold text-purple-300 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Simulated Integration — Demo: replaying scripted sync for {selectedParcel.id}...</span>
          </div>
          <div className="space-y-1 pt-1 font-mono text-[11px]">
            {activeSyncLogs.map((log, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-slate-500">{log.timestamp}</span>
                <span className="text-purple-300 font-bold">[{log.source}]</span>
                <span className={log.status === 'warning' ? 'text-amber-300 font-bold' : 'text-slate-300'}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5 Government Integration Source Panels */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
        <span>All five sources are <strong className="text-amber-700">Prototype / Simulated</strong> — none is connected to a live government system.</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Source 1: Tamil Nilam */}
        <div 
          onClick={() => setActiveSourceTab('land')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeSourceTab === 'land' 
              ? 'bg-blue-50/80 border-blue-500 shadow-md' 
              : 'bg-white border-slate-200 hover:border-blue-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <Building className="w-5 h-5 text-blue-600" />
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Simulated — not connected"></span>
          </div>
          <div className="font-bold text-xs text-slate-900 mt-2">1. Land Records</div>
          <div className="text-[10px] text-blue-700 font-semibold">Tamil Nilam Portal</div>
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
            Patta/Chitta, Survey Area, Co-owners & mutation status.
          </p>
        </div>

        {/* Source 2: Bhoomi / Rashi */}
        <div 
          onClick={() => setActiveSourceTab('bhoomi')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeSourceTab === 'bhoomi' 
              ? 'bg-blue-50/80 border-blue-500 shadow-md' 
              : 'bg-white border-slate-200 hover:border-blue-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <Database className="w-5 h-5 text-indigo-600" />
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Simulated — not connected"></span>
          </div>
          <div className="font-bold text-xs text-slate-900 mt-2">2. Bhoomi / Rashi</div>
          <div className="text-[10px] text-indigo-700 font-semibold">Revenue Admin</div>
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
            Guideline valuation, Jamabandi, and Sub-Registrar EC.
          </p>
        </div>

        {/* Source 3: ULPIN / Bhu-Naksha */}
        <div 
          onClick={() => setActiveSourceTab('ulpin')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeSourceTab === 'ulpin' 
              ? 'bg-blue-50/80 border-blue-500 shadow-md' 
              : 'bg-white border-slate-200 hover:border-blue-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <MapIcon className="w-5 h-5 text-emerald-600" />
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Simulated — not connected"></span>
          </div>
          <div className="font-bold text-xs text-slate-900 mt-2">3. ULPIN Cadastral</div>
          <div className="text-[10px] text-emerald-700 font-semibold">Bhu-Naksha Engine</div>
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
            14-Digit unique land parcel ID & digital polygon vertices.
          </p>
        </div>

        {/* Source 4: e-Courts CIS 3.0 */}
        <div 
          onClick={() => setActiveSourceTab('ecourts')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeSourceTab === 'ecourts' 
              ? 'bg-red-50/80 border-red-500 shadow-md' 
              : 'bg-white border-slate-200 hover:border-red-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <Gavel className="w-5 h-5 text-red-600" />
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Simulated — not connected"></span>
          </div>
          <div className="font-bold text-xs text-slate-900 mt-2">4. e-Courts CIS 3.0</div>
          <div className="text-[10px] text-red-700 font-semibold">Judicial Case Hub</div>
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
            Civil suits, CNR lookup, interim stay injunctions & hearings.
          </p>
        </div>

        {/* Source 5: Bhuvan GIS */}
        <div 
          onClick={() => setActiveSourceTab('bhuvan')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeSourceTab === 'bhuvan' 
              ? 'bg-blue-50/80 border-blue-500 shadow-md' 
              : 'bg-white border-slate-200 hover:border-blue-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Simulated — not connected"></span>
          </div>
          <div className="font-bold text-xs text-slate-900 mt-2">5. Bhuvan ISRO GIS</div>
          <div className="text-[10px] text-purple-700 font-semibold">Satellite Analytics</div>
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
            Satellite imagery, 60m RoW buffer & spatial conflicts.
          </p>
        </div>
      </div>

      {/* Selected Source Deep Inspection Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Sample Payload Inspector (Simulated): {activeSourceTab.toUpperCase()} Source
            </h3>
            <p className="text-xs text-slate-500">
              Viewing fabricated sample record for Parcel <strong className="text-slate-800">{selectedParcel.id}</strong> (Survey {selectedParcel.surveyNumber}) — not a real government record
            </p>
          </div>

          <button
            onClick={() => setShowJsonInspector(!showJsonInspector)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Code className="w-3.5 h-3.5" />
            <span>{showJsonInspector ? 'Hide Raw JSON' : 'View Raw Sample JSON'}</span>
          </button>
        </div>

        {/* Content depending on selected tab */}
        {activeSourceTab === 'land' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="font-bold text-slate-800">Tamil Nilam Land Records Dossier</div>
              <div className="flex justify-between"><span className="text-slate-500">Survey Number:</span> <span className="font-mono font-bold text-slate-900">{selectedParcel.surveyNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Registered Extent:</span> <span className="font-bold text-slate-900">{selectedParcel.areaAcres} Acres</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Primary Title Holder:</span> <span className="font-bold text-slate-900">{selectedParcel.ownerName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Legal Co-sharers:</span> <span className="font-bold text-blue-600">{selectedParcel.coOwnerCount} registered</span></div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="font-bold text-slate-800">Mutation Registry Status</div>
              <div className="flex justify-between"><span className="text-slate-500">Current Mutation State:</span> <span className="font-bold text-red-600">{selectedParcel.mutationStatus}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Last Mutation Year:</span> <span className="font-bold text-slate-900">{selectedParcel.lastMutationYearsAgo} years ago</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Freshness Confidence:</span> <span className="font-bold text-amber-600">{selectedParcel.recordFreshnessScore}% ({selectedParcel.recordConfidence})</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Sample record date:</span> <span className="font-mono text-slate-600">{selectedParcel.lastSyncedAt || '2026-08-23'}</span></div>
            </div>
          </div>
        )}

        {activeSourceTab === 'bhoomi' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="font-bold text-slate-800">Revenue Land Classification & Patta</div>
              <div className="flex justify-between"><span className="text-slate-500">Patta Number:</span> <span className="font-mono font-bold text-slate-900">{selectedParcel.revenueRecord?.pattaNumber ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Khata Number:</span> <span className="font-mono text-slate-900">{selectedParcel.revenueRecord?.khataNumber ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Classification:</span> <span className="font-bold text-amber-700">{selectedParcel.revenueRecord?.landClassification ?? '—'}</span></div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="font-bold text-slate-800">Sub-Registrar Encumbrance & Valuation</div>
              <div className="flex justify-between"><span className="text-slate-500">Guideline Value / Acre:</span> <span className="font-bold text-emerald-700">{selectedParcel.revenueRecord ? `₹${selectedParcel.revenueRecord.guidelineValuePerAcre.toLocaleString('en-IN')}` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Encumbrance Certificate:</span> <span className="font-bold text-red-600">{selectedParcel.revenueRecord?.encumbranceStatus ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">SRO Registration Office:</span> <span className="text-slate-800">{selectedParcel.revenueRecord?.subRegistrarOffice ?? '—'}</span></div>
            </div>
          </div>
        )}

        {activeSourceTab === 'ulpin' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="font-bold text-slate-800">14-Digit ULPIN Standard Standardizer</div>
              <div className="flex justify-between"><span className="text-slate-500">Standard ULPIN:</span> <span className="font-mono font-bold text-blue-700">{selectedParcel.ulpin}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">State / District Code:</span> <span className="font-mono text-slate-900">33-024 (Tamil Nadu - Salem)</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Cadastral Polygon Vertices:</span> <span className="font-bold text-emerald-700">4 Points Mapped</span></div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="font-bold text-slate-800">Geo-coordinates & Extent</div>
              <div className="flex justify-between"><span className="text-slate-500">Latitude / Longitude:</span> <span className="font-mono text-slate-900">{selectedParcel.gpsCoordinates.lat}°, {selectedParcel.gpsCoordinates.lng}°</span></div>
              <div className="flex justify-between"><span className="text-slate-500">DGPS Survey Status:</span> <span className="font-bold text-emerald-700">DGPS Validated (0.02% error margin)</span></div>
            </div>
          </div>
        )}

        {activeSourceTab === 'ecourts' && (
          <div className="p-4 bg-red-50/70 rounded-xl border border-red-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-red-900 text-sm">e-Courts Judicial Record (CNR Search)</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                {selectedParcel.courtCaseStatus}
              </span>
            </div>

            {selectedParcel.courtRecord ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Case No & Court</div>
                  <div className="font-bold text-slate-900 font-mono">{selectedParcel.courtRecord.caseNumber}</div>
                  <div className="text-[11px] text-slate-600">{selectedParcel.courtRecord.courtName}</div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">CNR Reference</div>
                  <div className="font-bold text-blue-700 font-mono">{selectedParcel.courtRecord.cnrNumber}</div>
                  <div className="text-[11px] text-slate-600">Filing Date: {selectedParcel.courtRecord.filingDate}</div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Injunction Status</div>
                  <div className={`font-bold ${selectedParcel.courtRecord.interimInjunction ? 'text-red-700' : 'text-slate-700'}`}>
                    {selectedParcel.courtRecord.interimInjunction ? 'Interim stay on Section 3E possession' : 'No interim injunction'}
                  </div>
                  <div className="text-[11px] text-slate-600">Next Hearing: {selectedParcel.courtRecord.nextHearingDate}</div>
                </div>
              </div>
            ) : (
              <div className="text-slate-600 font-medium">No active litigation records in e-Courts.</div>
            )}
          </div>
        )}

        {activeSourceTab === 'bhuvan' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="font-bold text-slate-800">ISRO Bhuvan Spatial Buffer Analysis</div>
              <div className="flex justify-between"><span className="text-slate-500">Elevation:</span> <span className="font-bold text-slate-900">{selectedParcel.gisRecord ? `${selectedParcel.gisRecord.elevationMeters} Meters` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Corridor Offset:</span> <span className="font-bold text-red-600">{selectedParcel.gisRecord ? `${selectedParcel.gisRecord.distanceToCorridorCenterMeters} Meters to Centerline` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Overlap Extent:</span> <span className="font-bold text-slate-900">{(selectedParcel.gisRecord?.intersectionAreaSqM ?? selectedParcel.areaSqMeters).toLocaleString()} m²</span></div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="font-bold text-slate-800">Environmental & Land Use Zone</div>
              <div className="flex justify-between"><span className="text-slate-500">Eco-zone:</span> <span className="font-bold text-slate-900">{selectedParcel.gisRecord?.environmentalZone ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Water Body Adjacent:</span> <span className="text-amber-700 font-semibold">{selectedParcel.gisRecord ? (selectedParcel.gisRecord.waterBodyAdjacent ? 'Yes' : 'No') : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Satellite Raster Date:</span> <span className="font-mono text-slate-600">{selectedParcel.gisRecord?.satelliteImageDate ?? '—'}</span></div>
            </div>
          </div>
        )}

        {/* JSON Schema View */}
        {showJsonInspector && (
          <div className="mt-4 pt-3 border-t border-slate-200">
            <div className="text-xs font-bold text-slate-700 mb-2">Raw parcel record (fabricated sample data — not a government API payload):</div>
            <pre className="p-4 bg-navy-900 text-emerald-300 rounded-xl text-[11px] font-mono overflow-x-auto max-h-60">
              {JSON.stringify(selectedParcel, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
