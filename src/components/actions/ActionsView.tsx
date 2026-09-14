import React, { useState } from 'react';
import { 
  CheckSquare, 
  Plus, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  UserCheck, 
  ChevronRight, 
  ArrowRight,
  TrendingDown,
  Building,
  Gavel,
  SlidersHorizontal,
  Eye
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CaseAction } from '../../types';

export const ActionsView: React.FC = () => {
  const { actions, parcels, createNewAction, updateActionStatus, openParcelDetail } = useApp();

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  
  // Create Action Form State
  const [selectedParcelId, setSelectedParcelId] = useState<string>('P-0245');
  const [actionTitle, setActionTitle] = useState<string>('File Petition to Vacate Civil Stay & Deposit Award in LA-RA Authority');
  const [actionType, setActionType] = useState<CaseAction['actionType']>('Legal Verification');
  const [assignedOfficer, setAssignedOfficer] = useState<string>('Thiru. M. Senthil Kumar, DRO');
  const [priority, setPriority] = useState<CaseAction['priority']>('CRITICAL');
  const [dueDate, setDueDate] = useState<string>('2026-08-28');
  const [notes, setNotes] = useState<string>('Instruct Government Pleader Omalur to submit counter-affidavit citing Supreme Court NHAI acquisition precedence.');

  const completedActions = actions.filter(a => a.status === 'Completed');
  const inProgressActions = actions.filter(a => a.status === 'In Progress');
  const pendingActions = actions.filter(a => a.status === 'Pending');

  const totalSavedMonths = completedActions.reduce((acc, a) => acc + (a.targetDelayReductionMonths || 0), 0);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parcel = parcels.find(p => p.id === selectedParcelId) || parcels[0];
    
    createNewAction({
      parcelId: parcel.id,
      surveyNumber: parcel.surveyNumber,
      title: actionTitle,
      actionType,
      assignedOfficer,
      assignedOfficerRole: 'CALA / Special LA Officer',
      priority,
      status: 'In Progress',
      dueDate,
      notes,
      targetDelayReductionMonths: parcel.potentialReductionMonths || 2.5
    });

    setShowCreateModal(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
              Case & Corrective Action Tracking Board
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
              {actions.length} Total Cases
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Dispatch, monitor, and resolve statutory bottlenecks across Land Acquisition units.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kanban Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              List View
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create Action</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Total Cases</div>
          <div className="text-xl font-black text-slate-900 mt-1">{actions.length}</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-amber-700">Pending Review</div>
          <div className="text-xl font-black text-amber-600 mt-1">{pendingActions.length}</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-blue-700">In Progress / Field</div>
          <div className="text-xl font-black text-blue-600 mt-1">{inProgressActions.length}</div>
        </div>

        <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-emerald-800">Timeline Saved</div>
          <div className="text-xl font-black text-emerald-600 mt-1">-{totalSavedMonths.toFixed(1)} Months</div>
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Pending */}
          <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500" />
                Pending ({pendingActions.length})
              </span>
            </div>

            <div className="space-y-3">
              {pendingActions.map(action => (
                <div key={action.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-xs text-slate-900">{action.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 shrink-0">
                      {action.priority}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Target: <strong>{action.parcelId}</strong></span>
                    <span>Due: {action.dueDate}</span>
                  </div>

                  <p className="text-[11px] text-slate-600 line-clamp-2">{action.notes}</p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => openParcelDetail(action.parcelId)}
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5"
                    >
                      <span>Dossier</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => updateActionStatus(action.id, 'In Progress')}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg"
                    >
                      Start Action
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: In Progress */}
          <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-blue-600" />
                In Progress ({inProgressActions.length})
              </span>
            </div>

            <div className="space-y-3">
              {inProgressActions.map(action => (
                <div key={action.id} className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-xs text-slate-900">{action.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 shrink-0">
                      {action.actionType}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Officer: <strong className="text-slate-800">{action.assignedOfficer}</strong></span>
                    <span className="text-amber-600 font-medium">Due: {action.dueDate}</span>
                  </div>

                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg">{action.notes}</p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => openParcelDetail(action.parcelId)}
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                    >
                      View {action.parcelId}
                    </button>

                    <button
                      onClick={() => updateActionStatus(action.id, 'Completed', 'Legal settlement executed.')}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg"
                    >
                      Mark Completed
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Completed */}
          <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Completed ({completedActions.length})
              </span>
            </div>

            <div className="space-y-3">
              {completedActions.map(action => (
                <div key={action.id} className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-xs text-slate-900">{action.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                      RESOLVED
                    </span>
                  </div>

                  <div className="text-[11px] text-emerald-700 font-medium">
                    Saved -{action.targetDelayReductionMonths} Mos Acquisition Delay
                  </div>

                  <p className="text-[11px] text-slate-600">{action.notes}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* List View Mode */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Action ID & Title</th>
                <th className="py-3 px-3">Parcel / Survey</th>
                <th className="py-3 px-3">Assigned Officer</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Due Date</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {actions.map(action => (
                <tr key={action.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{action.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{action.id}</div>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-800">{action.parcelId}</td>
                  <td className="py-3 px-3 text-slate-700 font-medium">{action.assignedOfficer}</td>
                  <td className="py-3 px-3">{action.actionType}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      action.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {action.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-600">{action.dueDate}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => openParcelDetail(action.parcelId)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white rounded font-bold"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Action Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-60 bg-navy-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 shadow-2xl text-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Create New Case Action</span>
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Target Land Parcel</label>
                <select
                  value={selectedParcelId}
                  onChange={(e) => setSelectedParcelId(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold"
                >
                  {parcels.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.id} — Survey {p.surveyNumber} ({p.ownerName}) [{p.riskLevel.toUpperCase()} RISK]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Action Directive / Title</label>
                <input 
                  type="text"
                  value={actionTitle}
                  onChange={(e) => setActionTitle(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Category</label>
                  <select 
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  >
                    <option value="Legal Verification">Legal Verification</option>
                    <option value="Fast-Track Compensation">Fast-Track Compensation</option>
                    <option value="Lok Adalat Settlement">Lok Adalat Settlement</option>
                    <option value="Joint Mutation Camp">Joint Mutation Camp</option>
                    <option value="Field Geo-Survey">Field Geo-Survey</option>
                    <option value="Collector Hearing">Collector Hearing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Assigned Officer</label>
                  <input 
                    type="text"
                    value={assignedOfficer}
                    onChange={(e) => setAssignedOfficer(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Priority</label>
                  <select 
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Due Date</label>
                  <input 
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Detailed Instructions</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg"
                >
                  Create Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
