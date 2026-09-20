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
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { EmptyState } from '../feedback/EmptyState';

export const AlertsView: React.FC = () => {
  const { alerts, openParcelDetail, resolveAlert, assignAlert, createNewAction } = useApp();

  const [severityFilter, setSeverityFilter] = useState<'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'Resolved'>('all');
  const [selectedAlertForAssign, setSelectedAlertForAssign] = useState<Alert | null>(null);
  const [assigneeName, setAssigneeName] = useState<string>('');
  const [assigneeError, setAssigneeError] = useState<string | null>(null);

  const filteredAlerts = alerts.filter(alert => {
    if (severityFilter === 'Resolved') return alert.status === 'Resolved';
    if (severityFilter === 'all') return true;
    return alert.level === severityFilter && alert.status !== 'Resolved';
  });

  const handleQuickAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlertForAssign) return;

    if (!assigneeName.trim()) {
      setAssigneeError('Assignee officer name is required.');
      return;
    }
    setAssigneeError(null);

    assignAlert(selectedAlertForAssign.id, assigneeName.trim());
    
    // Create corresponding case action
    createNewAction({
      parcelId: selectedAlertForAssign.parcelId,
      surveyNumber: selectedAlertForAssign.surveyNumber,
      title: `Early Intervention for ${selectedAlertForAssign.parcelId}: ${selectedAlertForAssign.trigger}`,
      actionType: 'Legal Verification',
      assignedOfficer: assigneeName.trim(),
      assignedOfficerRole: 'CALA / Special LA Officer',
      priority: selectedAlertForAssign.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      status: 'In Progress',
      dueDate: '2026-08-28',
      notes: selectedAlertForAssign.recommendedAction,
      targetDelayReductionMonths: 2.5
    });

    setSelectedAlertForAssign(null);
    setAssigneeError(null);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-semibold text-slate-900 tracking-tight">
              Early Warning & Statutory Delay Alerts
            </h1>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-red-50 text-red-800 border border-red-200 font-mono">
              {alerts.filter(a => a.status === 'Active' && a.level === 'CRITICAL').length} Active Critical Alerts ({alerts.length} Total Logged)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated notifications triggered when land parcels encounter civil court stay orders or severe statutory delay risks.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setSeverityFilter('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            severityFilter === 'all' ? 'bg-navy-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          All Alerts ({alerts.length})
        </button>

        <button
          onClick={() => setSeverityFilter('CRITICAL')}
          className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
            severityFilter === 'CRITICAL' ? 'bg-red-700 text-white' : 'bg-red-50 text-red-800 border border-red-200 hover:bg-red-100'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
          <span>Critical Stays ({alerts.filter(a => a.level === 'CRITICAL' && a.status !== 'Resolved').length})</span>
        </button>

        <button
          onClick={() => setSeverityFilter('HIGH')}
          className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
            severityFilter === 'HIGH' ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Operational Attention ({alerts.filter(a => a.level === 'HIGH' && a.status !== 'Resolved').length})</span>
        </button>

        <button
          onClick={() => setSeverityFilter('Resolved')}
          className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
            severityFilter === 'Resolved' ? 'bg-emerald-700 text-white' : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Resolved ({alerts.filter(a => a.status === 'Resolved').length})</span>
        </button>
      </div>

      {/* Alert Feed Cards */}
      <div className="space-y-3.5">
        {filteredAlerts.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No alerts in this filter category"
            description="All flagged parcels have been assigned or resolved."
            className="bg-white"
          />
        ) : (
          filteredAlerts.map(alert => {
            const isCrit = alert.level === 'CRITICAL';
            const isResolved = alert.status === 'Resolved';

            return (
              <div 
                key={alert.id}
                className={`p-4 sm:p-5 rounded-xl border transition-all ${
                  isResolved 
                    ? 'bg-slate-50 border-slate-200 opacity-80' 
                    : isCrit 
                    ? 'bg-red-50/50 border-red-200 shadow-xs' 
                    : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg mt-0.5 shrink-0 ${
                      isResolved 
                        ? 'bg-slate-100 text-slate-600' 
                        : isCrit 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      <AlertTriangle className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.2 rounded text-[9.5px] font-bold uppercase tracking-wider ${
                          isResolved 
                            ? 'bg-slate-100 text-slate-700 border border-slate-200' 
                            : isCrit 
                            ? 'bg-red-100 text-red-800 border border-red-200' 
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                        }`}>
                          {alert.level} ALERT
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
      <Modal
        isOpen={!!selectedAlertForAssign}
        onClose={() => {
          setSelectedAlertForAssign(null);
          setAssigneeError(null);
        }}
        title={`Assign Officer to Alert ${selectedAlertForAssign?.id}`}
        description="Dispatch fast-track statutory intervention"
        maxWidth="md"
      >
        {selectedAlertForAssign && (
          <form onSubmit={handleQuickAssign} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Target Parcel / Survey</label>
              <div className="p-2.5 bg-slate-100 rounded-lg text-slate-900 font-mono text-xs border border-slate-200">
                {selectedAlertForAssign.parcelId} (Survey {selectedAlertForAssign.surveyNumber})
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Assignee Officer Name & Designation *</label>
              <input
                type="text"
                value={assigneeName}
                onChange={(e) => {
                  setAssigneeName(e.target.value);
                  if (assigneeError) setAssigneeError(null);
                }}
                className={`w-full p-2 bg-white border rounded-lg text-slate-900 outline-none focus:ring-2 ${
                  assigneeError ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:ring-blue-500/20 focus:border-blue-500'
                }`}
                placeholder="Officer name / designation"
              />
              {assigneeError && (
                <p className="text-[11px] text-red-600 mt-1" role="alert">{assigneeError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setSelectedAlertForAssign(null);
                  setAssigneeError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
              >
                Confirm &amp; Dispatch
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
