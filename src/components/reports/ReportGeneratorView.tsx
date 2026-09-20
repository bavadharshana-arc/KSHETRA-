import React, { useState } from 'react';
import { 
  FileText, 
  Printer, 
  Download, 
  Share2, 
  CheckCircle2, 
  AlertTriangle, 
  Building, 
  Gavel, 
  MapPin, 
  Sparkles,
  Calendar,
  FileSpreadsheet
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const csvCell = (v: unknown): string => {
  const str = String(v ?? '');
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const downloadBlob = (content: string, mime: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const ReportGeneratorView: React.FC = () => {
  const { parcels, project, alerts, actions, alignments, currentUser, settings } = useApp();

  const [reportTitle, setReportTitle] = useState<string>('Comprehensive Land Acquisition Risk & Delay Mitigation Report');
  const [includeHighRiskOnly, setIncludeHighRiskOnly] = useState<boolean>(false);
  
  const [reportGeneratedAt] = useState<string>(new Date().toISOString().replace('T', ' ').substring(0, 16));

  const displayParcels = includeHighRiskOnly 
    ? parcels.filter(p => p.riskLevel === 'high') 
    : parcels;

  // Derived report facts (from loaded records + alignment state, never hardcoded)
  const lowMax = settings.riskThresholdLowMax;
  const medMax = settings.riskThresholdMedMax;
  const bandStats = (level: 'high' | 'medium' | 'low') => {
    const list = parcels.filter(p => p.riskLevel === level);
    const avg = list.length ? list.reduce((a, p) => a + p.predictedDelayMonths, 0) / list.length : null;
    return { loaded: list.length, avg };
  };
  const highBand = bandStats('high');
  const medBand = bandStats('medium');
  const lowBand = bandStats('low');
  const projectAlignments = alignments.filter(a => a.projectId === project.id);
  const recommendedAlignment = projectAlignments.find(a => a.isRecommended) || null;
  const activeAlignment =
    projectAlignments.find(a => JSON.stringify(a.pathCoordinates) === JSON.stringify(project.corridorPath)) || null;
  const directives = [...displayParcels]
    .filter(p => p.interventionStatus !== 'Completed' && p.recommendedAction)
    .sort((x, y) => y.delayRiskScore - x.delayRiskScore)
    .slice(0, 5);
  const filterLabel = includeHighRiskOnly ? 'High-risk parcels only' : 'All loaded parcels';

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = [
      'Parcel_ID',
      'ULPIN',
      'Survey_Number',
      'Owner_Name',
      'Village',
      'Taluk',
      'Area_Acres',
      'Acquisition_Status',
      'Court_Case',
      'Court_Case_Status',
      'Compensation_Status',
      'Delay_Risk_Score',
      'Risk_Level',
      'Predicted_Delay_Months',
      'Top_Risk_Factor',
      'Recommended_Action'
    ];

        const rows = displayParcels.map(p => [
      p.id,
      p.ulpin,
      p.surveyNumber,
      p.ownerName,
      p.village,
      p.taluk,
      p.areaAcres,
      p.acquisitionStatus,
      p.courtCase ? 'YES' : 'NO',
      p.courtCaseStatus,
      p.compensationStatus,
      `${p.delayRiskScore}%`,
      p.riskLevel.toUpperCase(),
      p.predictedDelayMonths,
      p.topRiskFactor,
      p.recommendedAction
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');
    downloadBlob(csvContent, 'text/csv;charset=utf-8', `Land_Acquisition_Delay_Risk_Report_${project.code}.csv`);
  };

  const handleExportJson = () => {
    const reportData = {
      dataNotice: 'Demo/synthetic data from the KSHETRA prototype. Not an official government record.',
      filter: filterLabel,
      parcelsIncluded: displayParcels.length,
      reportTitle,
      projectCode: project.code,
      projectName: project.name,
      generatedBy: currentUser.name,
      role: currentUser.roleTitle,
      generatedAt: reportGeneratedAt,
      summary: {
        totalParcels: project.totalParcels,
        acquiredParcels: project.acquiredParcels,
        pendingParcels: project.pendingParcels,
        highRiskParcels: project.highRiskParcels,
        predictedDelayMonths: project.predictedDelayMonths
      },
            activeAlignment: activeAlignment ? { id: activeAlignment.id, name: activeAlignment.name } : null,
      recommendedAlignment: recommendedAlignment ? { id: recommendedAlignment.id, name: recommendedAlignment.name } : null,
      riskBands: { lowMax, medMax },
      parcels: displayParcels,
      criticalParcels: displayParcels.filter(p => p.riskLevel === 'high'),
      activeAlerts: alerts.filter(a => a.status === 'Active'),
      recommendedActions: actions
    };

    downloadBlob(JSON.stringify(reportData, null, 2), 'application/json', `Executive_Brief_${project.code}.json`);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Configuration & Action Bar (Hidden during Print) */}
      <div className="no-print p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-navy-800" />
            <span>Decision Report Generator</span>
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Generate a printable decision dossier and export the same selection as CSV or JSON. Demo data; not an official government record.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>JSON Brief</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-navy-900 hover:bg-navy-800 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

            {/* Report options (hidden during print) — exports follow the same selection */}
      <div className="no-print p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end text-xs">
        <div>
          <label htmlFor="report-title" className="block text-slate-600 font-semibold mb-1">Report title</label>
          <input
            id="report-title"
            type="text"
            value={reportTitle}
            onChange={e => setReportTitle(e.target.value)}
            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
          />
        </div>
        <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
          <input
            type="checkbox"
            checked={includeHighRiskOnly}
            onChange={e => setIncludeHighRiskOnly(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300"
          />
          <span className="font-medium text-slate-800">High-risk parcels only</span>
          <span className="text-slate-500 font-mono">({displayParcels.length} of {parcels.length})</span>
        </label>
        <p className="md:col-span-2 text-[11px] text-slate-500">CSV, JSON and the printed report all use this selection and the active project ({project.code}).</p>
      </div>

      {/* Printable Report Document */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 shadow-xs text-slate-900 space-y-8 print:border-none print:shadow-none print:p-0">
        
                <div role="note" className="px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-[11px] font-semibold text-center">
          DEMO / SYNTHETIC DATA. Generated by the KSHETRA prototype; not an official government document.
        </div>

        {/* Header */}
        <div className="text-center border-b-2 border-slate-900 pb-5 space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                        {project.department}
          </div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            {project.agency} · Land Acquisition Delay Risk Report
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tight pt-2">
                        {reportTitle}
          </h2>
          <div className="text-xs font-medium text-slate-600">
            Project: <strong className="text-slate-900">{project.name}</strong> ({project.code})
          </div>
        </div>

        {/* Metadata & Officer Sign-off Header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold tracking-wider">Generated By</span>
            <strong className="text-slate-900">{currentUser.name}</strong>
            <div className="text-[11px] text-slate-600">{currentUser.roleTitle}</div>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold tracking-wider">Report Timestamp</span>
            <strong className="text-slate-900 font-mono">{reportGeneratedAt}</strong>
            <div className="text-[11px] text-slate-600">KSHETRA prototype</div>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold tracking-wider">Corridor Length</span>
            <strong className="text-slate-900 font-mono">{project.totalLengthKm} Kilometers</strong>
                        <div className="text-[11px] text-slate-600">Project record</div>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold tracking-wider">Estimated Delay Impact</span>
            <strong className="text-amber-800 font-mono font-bold text-sm">+{project.predictedDelayMonths} Months</strong>
                        <div className="text-[11px] text-slate-600">Project record, without intervention</div>
          </div>
        </div>

        {/* Executive Summary Section */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            1. Executive Summary & Project Status
          </h3>
          <p className="text-xs text-slate-700 leading-relaxed">
                        The project record lists <strong>{project.totalParcels} land parcels</strong>.
            Of these, <strong>{project.acquiredParcels} parcels ({project.totalParcels > 0 ? ((project.acquiredParcels / project.totalParcels) * 100).toFixed(0) : '0'}%)</strong> have reached physical possession and <strong>{project.pendingParcels} parcels</strong> remain in the statutory pipeline. Parcel-level tables below cover the <strong>{parcels.length} parcel records loaded in this workspace</strong> ({filterLabel.toLowerCase()}: {displayParcels.length}).
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
                        The project record lists <strong>{project.highRiskParcels} high-risk parcels</strong> and an estimated <strong>{project.predictedDelayMonths}-month</strong> delay without intervention; {highBand.loaded} of the loaded parcels currently band as high risk.
          </p>
        </div>

        {/* Risk Breakdown Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            2. Corridor Risk Distribution Summary
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200">
              <div className="text-[10px] uppercase font-semibold text-amber-800 tracking-wider">High Risk (&gt;{medMax}%)</div>
              <div className="text-xl font-bold font-mono text-amber-800 mt-1">{project.highRiskParcels} Parcels</div>
              <div className="text-[10px] text-amber-700 mt-0.5">{highBand.avg !== null ? `Loaded avg delay: ${highBand.avg.toFixed(1)} mos` : 'Data unavailable'}</div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase font-semibold text-slate-600 tracking-wider">Medium Risk ({lowMax + 1}–{medMax}%)</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">{project.medRiskParcels} Parcels</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{medBand.avg !== null ? `Loaded avg delay: ${medBand.avg.toFixed(1)} mos` : 'Data unavailable'}</div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/40 border border-emerald-200">
              <div className="text-[10px] uppercase font-semibold text-emerald-800 tracking-wider">Low Risk (&le;{lowMax}%)</div>
              <div className="text-xl font-bold font-mono text-emerald-800 mt-1">{project.lowRiskParcels} Parcels</div>
              <div className="text-[10px] text-emerald-700 mt-0.5">{lowBand.avg !== null ? `Loaded avg delay: ${lowBand.avg.toFixed(1)} mos` : 'Data unavailable'}</div>
            </div>
          </div>
        </div>

        {/* Critical High-Risk Parcels Dossier Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            3. Critical Bottleneck Parcels Requiring Early Intervention
          </h3>

          <table className="w-full text-left text-xs border border-slate-200 divide-y divide-slate-200">
            <thead className="bg-slate-50 font-semibold uppercase text-[10px] text-slate-600 tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Parcel / Survey</th>
                <th className="py-2.5 px-3">Owner / Village</th>
                <th className="py-2.5 px-2 text-center">Delay Risk</th>
                <th className="py-2.5 px-3">Litigation / Stay Status</th>
                <th className="py-2.5 px-3">Recommended Intervention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {displayParcels.map(p => (
                <tr key={p.id} className="text-[11px]">
                  <td className="py-2.5 px-3 font-mono font-semibold">
                    {p.id} ({p.surveyNumber})
                    <div className="text-[10px] font-normal text-slate-500">{p.areaAcres} Acres</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <strong className="text-slate-900">{p.ownerName}</strong>
                    <div className="text-[10px] text-slate-500">{p.village}, {p.taluk}</div>
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className={`px-2 py-0.5 rounded font-mono font-semibold text-xs border ${
                      p.riskLevel === 'high' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {p.delayRiskScore}%
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{p.predictedDelayRange}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    {p.courtCase ? (
                      <span className="text-rose-700 font-semibold">
                        {p.courtCaseStatus} ({p.courtRecord?.caseNumber || 'Stay'})
                      </span>
                    ) : (
                      <span className="text-slate-600">{p.ownershipDispute}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-800">
                    {p.recommendedAction}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recommended Action Directives */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            4. Statutory & Legal Intervention Directives
          </h3>
          {directives.length === 0 ? (
            <p className="text-xs text-slate-600">No open interventions among the selected parcels (data unavailable or all completed).</p>
          ) : (
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-800 leading-relaxed">
              {directives.map(p => (
                <li key={p.id}>
                  <strong>{p.id} (Sy. {p.surveyNumber}, {p.riskLevel} risk {p.delayRiskScore}%):</strong> {p.recommendedAction}
                </li>
              ))}
              <li>
                <strong>Alignment status:</strong>{' '}
                {activeAlignment ? `Active route is ${activeAlignment.name}.` : 'The active route is not one of the listed alignment options.'}{' '}
                {recommendedAlignment
                  ? `The model-compared recommended option is ${recommendedAlignment.name}${activeAlignment && activeAlignment.id === recommendedAlignment.id ? ' (already active).' : ' (not yet active).'}`
                  : 'No alignment option is flagged as recommended.'}
              </li>
            </ol>
          )}
        </div>

        {/* Sign-off block: signature lines only, no pre-filled names */}
        <div className="pt-12 grid grid-cols-2 gap-8 text-xs border-t border-slate-200 text-center">
          <div className="space-y-1">
            <div className="border-b border-slate-400 h-8" />
            <div className="text-slate-600">Prepared by: {currentUser.name}, {currentUser.roleTitle}</div>
            <div className="text-[10px] text-slate-500">{project.name}</div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-slate-400 h-8" />
            <div className="text-slate-600">Reviewing authority (signature)</div>
            <div className="text-[10px] text-slate-500">Name / designation / date</div>
          </div>
        </div>

      </div>
    </div>
  );
};
