import React, { useState } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  UserCheck, 
  Eye, 
  Gavel, 
  Clock, 
  ArrowRight,
  Filter,
  FileCheck,
  Building
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Alert } from '../../types';

export const AlertsView: React.FC = () => {
  const { alerts, openParcelDetail, resolveAlert, assignAlert, createNewAction } = useApp();

  const [severityFilter, setSeverityFilter] = useState<'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'Resolved'>('all');
  const [selectedAlertForAssign, setSelectedAlertForAssign] = useState<Alert | null>(null);
  const [assigneeName, setAssigneeName] = useState<string>('Thiru. M. Senthil Kumar, DRO');

  const filteredAlerts = alerts.filter(alert => {
    if (severityFilter === 'Resolved') return alert.status === 'Resolved';
    if (severityFilter === 'all') return true;
    return alert.level === severityFilter && alert.status !== 'Resolved';
  });

  const handleQuickAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlertForAssign) return;

    assignAlert(selectedAlertForAssign.id, assigneeName);
    
    // Create corresponding case action
    createNewAction({
      parcelId: selectedAlertForAssign.parcelId,
      surveyNumber: selectedAlertForAssign.surveyNumber,
      title: `Early Intervention for ${selectedAlertForAssign.parcelId}: ${selectedAlertForAssign.trigger}`,
      actionType: 'Legal Verification',
      assignedOfficer: assigneeName,
      assignedOfficerRole: 'CALA / Special LA Officer',
      priority: selectedAlertForAssign.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      status: 'In Progress',
      dueDate: '2026-08-28',
      notes: selectedAlertForAssign.recommendedAction,
      targetDelayReductionMonths: 2.5
    });

    setSelectedAlertForAssign(null);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
              Early Warning & Acquisition Delay Alerts
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
              {alerts.filter(a => a.status === 'Active').length} Active High-Risk Alerts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated alerts triggered when land parcels exceed delay probability thresholds or encounter court stay orders.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setSeverityFilter('all')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
            severityFilter === 'all' ? 'bg-navy-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          All Alerts ({alerts.length})
        </button>

        <button
          onClick={() => setSeverityFilter('CRITICAL')}
          className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-colors ${
            severityFilter === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          <span>Critical Alerts</span>
        </button>

        <button
          onClick={() => setSeverityFilter('HIGH')}
          className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-colors ${
            severityFilter === 'HIGH' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>High Risk</span>
        </button>

        <button
          onClick={() => setSeverityFilter('Resolved')}
          className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-colors ${
            severityFilter === 'Resolved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Resolved Alerts</span>
        </button>
      </div>

      {/* Alert Feed Cards */}
      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="font-bold text-sm text-slate-800">No alerts in this filter category</h3>
            <p className="text-xs text-slate-500 mt-1">All flagged parcels have been assigned or resolved.</p>
          </div>
        ) : (
          filteredAlerts.map(alert => {
            const isCrit = alert.level === 'CRITICAL';
            const isResolved = alert.status === 'Resolved';

            return (
              <div 
                key={alert.id}
                className={`p-5 rounded-2xl border transition-all ${
                  isResolved 
                    ? 'bg-slate-50 border-slate-200 opacity-80' 
                    : isCrit 
                    ? 'bg-red-50/70 border-red-300 shadow-sm' 
                    : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl mt-0.5 ${
                      isResolved 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : isCrit 
                        ? 'bg-red-600 text-white animate-pulse' 
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          isResolved 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : isCrit 
                            ? 'bg-red-100 text-red-800 border border-red-200' 
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {alert.level} RISK ALERT
                        </span>

                        <span className="font-bold text-xs text-slate-900">
                          {alert.title}
                        </span>

                        <span className="text-[11px] font-mono text-slate-500">
                          ({alert.createdAt})
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                        <strong>Trigger Reason:</strong> {alert.reason}
                      </p>

                      <div className="mt-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-amber-800">
                          <span className="font-bold">Recommended Action:</span>
                          <span>{alert.recommendedAction}</span>
                        </div>
                        {alert.assignedTo && (
                          <div className="text-[11px] text-blue-700 shrink-0">
                            Assigned to: <strong>{alert.assignedTo}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons on Alert */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-start">
                    <button
                      onClick={() => openParcelDetail(alert.parcelId)}
                      className="px-3 py-1.5 bg-navy-900 hover:bg-navy-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Review Case</span>
                    </button>

                    {!isResolved && (
                      <>
                        <button
                          onClick={() => setSelectedAlertForAssign(alert)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Assign Officer</span>
                        </button>

                        <button
                          onClick={() => resolveAlert(alert.id, 'Resolved after CALA verification camp.')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Resolved</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Assign Modal */}
      {selectedAlertForAssign && (
        <div className="fixed inset-0 z-60 bg-navy-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-700 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span>Assign Officer to Alert {selectedAlertForAssign.id}</span>
            </h3>

            <form onSubmit={handleQuickAssign} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Target Parcel / Survey</label>
                <div className="p-2 bg-slate-100 rounded-lg text-slate-900 font-mono">
                  {selectedAlertForAssign.parcelId} (Survey {selectedAlertForAssign.surveyNumber})
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Assignee Officer Name & Designation</label>
                <input
                  type="text"
                  value={assigneeName}
                  onChange={(e) => setAssigneeName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedAlertForAssign(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg"
                >
                  Confirm & Dispatch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
