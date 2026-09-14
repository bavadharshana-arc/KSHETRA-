import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  RotateCcw, 
  MapPin, 
  AlertTriangle, 
  Cpu, 
  Eye, 
  RefreshCw, 
  ChevronRight, 
  ArrowUpDown, 
  SlidersHorizontal,
  Layers,
  FileCheck,
  Building,
  Gavel
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { RiskLevel } from '../../types';

export const ParcelsView: React.FC = () => {
  const { 
    filteredParcels, 
    parcels,
    searchQuery, 
    setSearchQuery, 
    filters, 
    setFilters, 
    resetFilters,
    openParcelDetail,
    runDelayPrediction,
    syncGovernmentDataForParcel,
    setActiveTab,
    isSyncing
  } = useApp();

  const [predictingParcelId, setPredictingParcelId] = useState<string | null>(null);

  const handlePredictClick = async (e: React.MouseEvent, parcelId: string) => {
    e.stopPropagation();
    setPredictingParcelId(parcelId);
    try {
      await runDelayPrediction(parcelId);
    } finally {
      setPredictingParcelId(null);
    }
  };

  const handleSyncClick = async (e: React.MouseEvent, parcelId: string) => {
    e.stopPropagation();
    await syncGovernmentDataForParcel(parcelId);
  };

  const isFiltered = 
    searchQuery !== '' || 
    filters.riskLevel !== 'all' || 
    filters.acquisitionStatus !== 'all' || 
    filters.courtCase !== 'all' || 
    filters.compensationStatus !== 'all' || 
    filters.documentStatus !== 'all' || 
    filters.taluk !== 'all';

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
              Land Parcel Inventory & Risk Directory
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
              {filteredParcels.length} / {parcels.length} Showing
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Cadastral survey numbers, Bhoomi-style land classification, e-Courts-style litigation tags, and AI delay forecasts — all from synthetic demonstration data.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('map')}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Layers className="w-4 h-4" />
            <span>View on GIS Map</span>
          </button>
          <button
            onClick={() => setActiveTab('govsync')}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-purple-600" />
            <span>Gov Data Hub</span>
          </button>
        </div>
      </div>

      {/* Search & Multi-filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Survey No (125/2), Parcel ID (P-0245), ULPIN, Owner Name, Village..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-sans"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
                className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:border-blue-500"
              >
                <option value="riskScoreDesc">Sort: Highest Risk (🔴)</option>
                <option value="riskScoreAsc">Sort: Lowest Risk (🟢)</option>
                <option value="delayMonthsDesc">Sort: Longest Predicted Delay</option>
                <option value="areaDesc">Sort: Largest Land Area</option>
                <option value="surveyNo">Sort: Survey Number</option>
              </select>
            </div>

            {isFiltered && (
              <button
                onClick={resetFilters}
                className="px-3 py-2 text-xs text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl flex items-center gap-1 font-semibold transition-colors shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills Grid */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* Risk Level Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Delay Risk</label>
            <select
              value={filters.riskLevel}
              onChange={(e) => setFilters(prev => ({ ...prev, riskLevel: e.target.value as any }))}
              className="w-full py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">High Risk (🔴 &gt;70%)</option>
              <option value="medium">Medium Risk (🟡 40–70%)</option>
              <option value="low">Low Risk (🟢 &lt;40%)</option>
            </select>
          </div>

          {/* Acquisition Status Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Acquisition</label>
            <select
              value={filters.acquisitionStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, acquisitionStatus: e.target.value as any }))}
              className="w-full py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Acquisition Status</option>
              <option value="Pending">Pending</option>
              <option value="In-Progress">In-Progress</option>
              <option value="Contested">Contested</option>
              <option value="Acquired">Acquired</option>
            </select>
          </div>

          {/* Court Case Status Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Court Case</label>
            <select
              value={filters.courtCase}
              onChange={(e) => setFilters(prev => ({ ...prev, courtCase: e.target.value as any }))}
              className="w-full py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Legal Status</option>
              <option value="yes">Active Case / Stay Order</option>
              <option value="no">No Court Case</option>
            </select>
          </div>

          {/* Compensation Status Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Compensation</label>
            <select
              value={filters.compensationStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, compensationStatus: e.target.value as any }))}
              className="w-full py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Compensation</option>
              <option value="Pending">Pending</option>
              <option value="Determined">Determined</option>
              <option value="Under Dispute in LA-RA Authority">Disputed (LA-RA)</option>
              <option value="Disbursed 100%">100% Disbursed</option>
            </select>
          </div>

          {/* Document Status Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Documents</label>
            <select
              value={filters.documentStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, documentStatus: e.target.value as any }))}
              className="w-full py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Document Status</option>
              <option value="Verified">Verified</option>
              <option value="Pending Verification">Pending Verification</option>
              <option value="Disputed">Disputed</option>
              <option value="Missing Documents">Missing Documents</option>
            </select>
          </div>

          {/* Taluk Filter */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Taluk / Village</label>
            <select
              value={filters.taluk}
              onChange={(e) => setFilters(prev => ({ ...prev, taluk: e.target.value as any }))}
              className="w-full py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Taluks (Salem)</option>
              <option value="Omalur">Omalur</option>
              <option value="Salem West">Salem West</option>
              <option value="Attur">Attur</option>
            </select>
          </div>
        </div>
      </div>

      {/* Parcels Table / Card Directory */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredParcels.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="font-bold text-sm text-slate-800">No matching land parcels found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search keywords or resetting the active risk and acquisition filters.
            </p>
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Parcel ID & ULPIN</th>
                  <th className="py-3 px-3">Survey & Extent</th>
                  <th className="py-3 px-3">Owner & Village</th>
                  <th className="py-3 px-3">Legal & Dispute</th>
                  <th className="py-3 px-3">Compensation</th>
                  <th className="py-3 px-3 text-center">Parcel Risk (indicative)</th>
                  <th className="py-3 px-3">Predicted Delay</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParcels.map(parcel => {
                  const isHigh = parcel.riskLevel === 'high';
                  const isMed = parcel.riskLevel === 'medium';
                  const isPredicting = predictingParcelId === parcel.id;

                  return (
                    <tr 
                      key={parcel.id}
                      onClick={() => openParcelDetail(parcel.id)}
                      className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${
                        parcel.id === 'P-0245' ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* Parcel ID & ULPIN */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="font-extrabold text-slate-900 group-hover:text-blue-600 text-xs transition-colors">
                            {parcel.id}
                          </div>
                          {parcel.id === 'P-0245' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500 text-slate-950 uppercase tracking-wider">
                              DEMO TARGET
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {parcel.ulpin}
                        </div>
                      </td>

                      {/* Survey & Area */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-800 font-mono text-xs">
                          {parcel.surveyNumber}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {parcel.areaAcres} Acres <span className="text-[10px] text-slate-400">({parcel.areaSqMeters.toLocaleString()} m²)</span>
                        </div>
                      </td>

                      {/* Owner & Village */}
                      <td className="py-3.5 px-3">
                        <div className="font-medium text-slate-800 truncate max-w-[160px]" title={parcel.ownerName}>
                          {parcel.ownerName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {parcel.village}, {parcel.taluk}
                        </div>
                      </td>

                      {/* Legal / Court Case Tag */}
                      <td className="py-3.5 px-3">
                        {parcel.courtCase ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                              <Gavel className="w-3 h-3 text-red-600" />
                              {parcel.courtCaseStatus}
                            </span>
                            {parcel.courtRecord && (
                              <div className="text-[10px] text-slate-500 font-mono truncate max-w-[140px]">
                                {parcel.courtRecord.caseNumber}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                            Clear Title
                          </span>
                        )}
                      </td>

                      {/* Compensation Status */}
                      <td className="py-3.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          parcel.compensationStatus === 'Disbursed 100%' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : parcel.compensationStatus === 'Under Dispute in LA-RA Authority'
                            ? 'bg-red-100 text-red-800'
                            : parcel.compensationStatus === 'Determined'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {parcel.compensationStatus}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          ₹{parcel.estimatedCompensationCrores} Cr Est.
                        </div>
                      </td>

                      {/* Delay Risk Score */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`px-2.5 py-1 rounded-lg font-black text-xs ${
                            isHigh 
                              ? 'bg-red-100 text-red-700 border border-red-200 shadow-xs' 
                              : isMed 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {parcel.delayRiskScore}%
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                            {parcel.riskLevel}
                          </span>
                        </div>
                      </td>

                      {/* Predicted Delay Range */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-900 text-xs">
                          {parcel.predictedDelayRange}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {parcel.delayConfidence} Conf.
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handlePredictClick(e, parcel.id)}
                            disabled={isPredicting}
                            className="p-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg transition-colors text-xs font-semibold"
                            title="Score this parcel (indicative drill-down — the official AI prediction is project-level)"
                          >
                            <Cpu className={`w-3.5 h-3.5 ${isPredicting ? 'animate-spin text-blue-400' : ''}`} />
                          </button>

                          <button
                            onClick={() => openParcelDetail(parcel.id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Deep Dive</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
