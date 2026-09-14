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

export const ReportGeneratorView: React.FC = () => {
  const { parcels, project, alerts, actions, currentUser } = useApp();

  const [reportTitle, setReportTitle] = useState<string>('Comprehensive Land Acquisition Risk & Delay Mitigation Report');
  const [includeHighRiskOnly, setIncludeHighRiskOnly] = useState<boolean>(false);
  const [includeXaiBreakdown, setIncludeXaiBreakdown] = useState<boolean>(true);
  const [reportGeneratedAt] = useState<string>(new Date().toISOString().replace('T', ' ').substring(0, 16));

  const displayParcels = includeHighRiskOnly 
    ? parcels.filter(p => p.riskLevel === 'high') 
    : parcels;

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

    const rows = parcels.map(p => [
      p.id,
      p.ulpin,
      p.surveyNumber,
      `"${p.ownerName.replace(/"/g, '""')}"`,
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
      `"${p.topRiskFactor.replace(/"/g, '""')}"`,
      `"${p.recommendedAction.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Land_Acquisition_Delay_Risk_Report_${project.code}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJson = () => {
    const reportData = {
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
      criticalParcels: parcels.filter(p => p.riskLevel === 'high'),
      activeAlerts: alerts.filter(a => a.status === 'Active'),
      recommendedActions: actions
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `Executive_Brief_${project.code}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Configuration & Action Bar (Hidden during Print) */}
      <div className="no-print p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span>Official Decision Report Generator</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Generate and export signed statutory dossiers for the District Collector and NHAI Project Director.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4 text-purple-600" />
            <span>JSON Brief</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-md shadow-blue-900/20"
          >
            <Printer className="w-4 h-4" />
            <span>Print Official Report (PDF)</span>
          </button>
        </div>
      </div>

      {/* Printable Report Document */}
      <div className="bg-white rounded-2xl border border-slate-300 p-8 sm:p-12 shadow-xl text-slate-900 space-y-8 print:border-none print:shadow-none print:p-0">
        
        {/* Official Header */}
        <div className="text-center border-b-2 border-slate-900 pb-6 space-y-2">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-600">
            GOVERNMENT OF INDIA • MINISTRY OF ROAD TRANSPORT & HIGHWAYS
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
            OFFICE OF THE COMPETENT AUTHORITY FOR LAND ACQUISITION (CALA) / DRO SALEM
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight pt-2">
            PREDICTIVE LAND ACQUISITION DELAY RISK & STATUTORY INTERVENTION REPORT
          </h2>
          <div className="text-xs font-medium text-slate-600">
            Project: <strong className="text-slate-900">{project.name}</strong> ({project.code})
          </div>
        </div>

        {/* Metadata & Officer Sign-off Header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Generated By</span>
            <strong className="text-slate-900">{currentUser.name}</strong>
            <div className="text-[11px] text-slate-600">{currentUser.roleTitle}</div>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Report Timestamp</span>
            <strong className="text-slate-900 font-mono">{reportGeneratedAt}</strong>
            <div className="text-[11px] text-slate-600">PM-GatiShakti AI Engine v2.4</div>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Corridor Length</span>
            <strong className="text-slate-900">{project.totalLengthKm} Kilometers</strong>
            <div className="text-[11px] text-slate-600">60m Right of Way (RoW)</div>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Estimated Delay Impact</span>
            <strong className="text-red-600 font-black text-sm">+{project.predictedDelayMonths} Months</strong>
            <div className="text-[11px] text-slate-600">Without intervention</div>
          </div>
        </div>

        {/* Executive Summary Section */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            1. Executive Summary & Project Status
          </h3>
          <p className="text-xs text-slate-700 leading-relaxed">
            This predictive report analyzes <strong>{project.totalParcels} land parcels</strong> notified under Section 3A of the National Highways Act / RFCTLARR Act 2013. 
            Currently, <strong>{project.acquiredParcels} parcels ({((project.acquiredParcels/project.totalParcels)*100).toFixed(0)}%)</strong> have reached physical possession, while <strong>{project.pendingParcels} parcels</strong> remain in statutory award determination and compensation disbursement stages.
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            The Institutional AI Delay Prediction Engine has identified <strong>{project.highRiskParcels} high-risk land parcels</strong> facing active civil stay orders, unmutated joint heir succession disputes, and compensation valuation grievances, threatening a <strong>{project.predictedDelayMonths}-month critical path delay</strong> to commercial commissioning.
          </p>
        </div>

        {/* Risk Breakdown Table */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            2. Corridor Risk Distribution Summary
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center text-xs">
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <div className="text-[10px] uppercase font-bold text-red-700">High Risk (🔴 &gt;70%)</div>
              <div className="text-xl font-black text-red-700 mt-1">{project.highRiskParcels} Parcels</div>
              <div className="text-[10px] text-red-600 mt-0.5">Average delay: 3.8–5.2 mos</div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-[10px] uppercase font-bold text-amber-700">Medium Risk (🟡 40–70%)</div>
              <div className="text-xl font-black text-amber-700 mt-1">{project.medRiskParcels} Parcels</div>
              <div className="text-[10px] text-amber-600 mt-0.5">Average delay: 1.5–2.5 mos</div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[10px] uppercase font-bold text-emerald-700">Low Risk (🟢 &lt;40%)</div>
              <div className="text-xl font-black text-emerald-700 mt-1">{project.lowRiskParcels} Parcels</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Clear title on track</div>
            </div>
          </div>
        </div>

        {/* Critical High-Risk Parcels Dossier Table */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            3. Critical Bottleneck Parcels Requiring Early Intervention
          </h3>

          <table className="w-full text-left text-xs border border-slate-200 divide-y divide-slate-200">
            <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-700">
              <tr>
                <th className="py-2.5 px-3">Parcel / Survey</th>
                <th className="py-2.5 px-3">Owner / Village</th>
                <th className="py-2.5 px-2 text-center">Delay Risk</th>
                <th className="py-2.5 px-3">Litigation / Stay Status</th>
                <th className="py-2.5 px-3">Recommended Intervention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayParcels.map(p => (
                <tr key={p.id} className="text-[11px]">
                  <td className="py-2.5 px-3 font-mono font-bold">
                    {p.id} ({p.surveyNumber})
                    <div className="text-[10px] font-normal text-slate-500">{p.areaAcres} Acres</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <strong className="text-slate-900">{p.ownerName}</strong>
                    <div className="text-[10px] text-slate-500">{p.village}, {p.taluk}</div>
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className={`px-2 py-0.5 rounded font-black text-xs ${
                      p.riskLevel === 'high' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.delayRiskScore}%
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5">{p.predictedDelayRange}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    {p.courtCase ? (
                      <span className="text-red-700 font-bold">
                        {p.courtCaseStatus} ({p.courtRecord?.caseNumber || 'Stay'})
                      </span>
                    ) : (
                      <span className="text-slate-600 font-medium">{p.ownershipDispute}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-800">
                    {p.recommendedAction}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recommended Action Directives */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            4. Statutory & Legal Intervention Directives
          </h3>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-800 leading-relaxed">
            <li>
              <strong>Vacate Civil Stay Orders under Section 3H(4):</strong> Direct Government Pleader at Sub-Court Omalur to deposit undisputed compensation into court escrow for Parcel P-0245 to vacate possession injunctions.
            </li>
            <li>
              <strong>Special Lok Adalat Partition Settlement:</strong> Convene joint revenue mutation camp at Omalur Taluk office for 5-way co-sharer heirship determinations.
            </li>
            <li>
              <strong>Alternative Alignment B Evaluation:</strong> Project Planner recommends adopting Alignment B (Northern Agro Bypass) to avoid 22 high-risk parcels and recover 3.1 months in construction timeline.
            </li>
          </ol>
        </div>

        {/* Official Sign-off Block */}
        <div className="pt-12 grid grid-cols-2 gap-8 text-xs border-t border-slate-200 text-center">
          <div className="space-y-1">
            <div className="font-bold text-slate-900">Thiru. M. Senthil Kumar, DRO</div>
            <div className="text-slate-600">Competent Authority for Land Acquisition (CALA)</div>
            <div className="text-[10px] text-slate-500">Salem-Chennai Expressway Project</div>
          </div>

          <div className="space-y-1">
            <div className="font-bold text-slate-900">Dr. Rajeshwari Sundaram, IAS</div>
            <div className="text-slate-600">District Collector & District Magistrate</div>
            <div className="text-[10px] text-slate-500">Salem District, Tamil Nadu</div>
          </div>
        </div>

      </div>
    </div>
  );
};
