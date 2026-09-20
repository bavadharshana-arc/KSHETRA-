import React, { useMemo, useState } from 'react';
import {
  Plus,
  Clock,
  CheckCircle2,
  UserCheck,
  ChevronRight,
  ArrowUpRight,
  Search,
  X,
  SearchX,
  Inbox,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CaseAction } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { EmptyState } from '../feedback/EmptyState';
import { useDebounce } from '../../hooks/useDebounce';
import { ParcelBlockersCard } from '../legal/ParcelBlockersCard';

type Status = CaseAction['status'];
type Priority = CaseAction['priority'];
type SortKey = 'due-asc' | 'due-desc' | 'priority' | 'newest' | 'status';

const STATUSES: Status[] = ['Pending', 'In Progress', 'Escalated', 'Completed'];
const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const ACTION_TYPES: CaseAction['actionType'][] = [
  'Legal Verification',
  'Fast-Track Compensation',
  'Lok Adalat Settlement',
  'Joint Mutation Camp',
  'Field Geo-Survey',
  'Collector Hearing'
];
const PRIORITY_RANK: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STATUS_RANK: Record<Status, number> = { Escalated: 0, Pending: 1, 'In Progress': 2, Completed: 3 };

const priorityClass = (p: Priority) =>
  p === 'CRITICAL'
    ? 'bg-rose-50 text-rose-800 border-rose-200'
    : p === 'HIGH'
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-slate-100 text-slate-700 border-slate-200';

const statusClass = (s: Status) =>
  s === 'Completed'
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : s === 'Escalated'
    ? 'bg-rose-50 text-rose-800 border-rose-200'
    : s === 'In Progress'
    ? 'bg-blue-50 text-blue-800 border-blue-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';

const DAY_MS = 86_400_000;
/** Whole days past due (0 if not due yet / unparsable). Completed actions are never overdue. */
const daysOverdue = (a: CaseAction, now: number): number => {
  if (a.status === 'Completed') return 0;
  const due = Date.parse(a.dueDate);
  if (Number.isNaN(due)) return 0;
  return Math.max(0, Math.floor((now - due) / DAY_MS));
};

const inputCls =
  'w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';
const selectCls =
  'p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';

export const ActionsView: React.FC = () => {
  const { actions, parcels, createNewAction, updateActionStatus, openParcelDetail, settings, syncStatus } = useApp();

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // Filter / sort state
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CaseAction['actionType']>('all');
  const [sortKey, setSortKey] = useState<SortKey>('due-asc');

  // Detail / closure state
  const [detailId, setDetailId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // Create Action Form State (no pre-filled demo text — the user supplies the directive)
  const [selectedParcelId, setSelectedParcelId] = useState<string>('');
  const [actionTitle, setActionTitle] = useState<string>('');
  const [actionType, setActionType] = useState<CaseAction['actionType']>('Legal Verification');
  const [assignedOfficer, setAssignedOfficer] = useState<string>('');
  const [priority, setPriority] = useState<CaseAction['priority']>('HIGH');
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [formErrors, setFormErrors] = useState<{ parcel?: string; title?: string; officer?: string; dueDate?: string }>({});

  const [now] = useState<number>(() => Date.now());

  const owners = useMemo(
    () => Array.from(new Set(actions.map(a => a.assignedOfficer).filter(Boolean))).sort(),
    [actions]
  );

  const hasFilters =
    query.trim() !== '' || statusFilter !== 'all' || priorityFilter !== 'all' || ownerFilter !== 'all' || typeFilter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setOwnerFilter('all');
    setTypeFilter('all');
  };

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const list = actions.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
      if (ownerFilter !== 'all' && a.assignedOfficer !== ownerFilter) return false;
      if (typeFilter !== 'all' && a.actionType !== typeFilter) return false;
      if (!q) return true;
      return [a.id, a.title, a.parcelId, a.surveyNumber, a.assignedOfficer, a.actionType, a.notes]
        .some(v => (v || '').toLowerCase().includes(q));
    });
    const byDue = (x: CaseAction, y: CaseAction) => (Date.parse(x.dueDate) || Infinity) - (Date.parse(y.dueDate) || Infinity);
    return [...list].sort((x, y) => {
      switch (sortKey) {
        case 'due-desc': return -byDue(x, y);
        case 'priority': return PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority] || byDue(x, y);
        case 'status': return STATUS_RANK[x.status] - STATUS_RANK[y.status] || byDue(x, y);
        case 'newest': return (y.createdAt || '').localeCompare(x.createdAt || '');
        default: return byDue(x, y);
      }
    });
  }, [actions, debouncedQuery, statusFilter, priorityFilter, ownerFilter, typeFilter, sortKey]);

  const byStatus = (s: Status) => visible.filter(a => a.status === s);
  const completedAll = actions.filter(a => a.status === 'Completed');
  const totalSavedMonths = completedAll.reduce((acc, a) => acc + (a.targetDelayReductionMonths || 0), 0);
  const overdueOpen = actions.filter(a => daysOverdue(a, now) > 0).length;
  const detailAction = actions.find(a => a.id === detailId) || null;
  const closingAction = actions.find(a => a.id === closingId) || null;

  const openCreate = () => {
    setSelectedParcelId(parcels[0]?.id ?? '');
    setFormErrors({});
    setShowCreateModal(true);
  };

  const validateForm = () => {
    const errors: typeof formErrors = {};
    if (!parcels.some(p => p.id === selectedParcelId)) errors.parcel = 'Select a parcel from the active project.';
    if (actionTitle.trim().length < 5) errors.title = 'Directive title must be at least 5 characters.';
    if (!assignedOfficer.trim()) errors.officer = 'Assigned officer is required.';
    if (!dueDate) errors.dueDate = 'Due date is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    const parcel = parcels.find(p => p.id === selectedParcelId);
    if (!parcel) return;

    createNewAction({
      parcelId: parcel.id,
      surveyNumber: parcel.surveyNumber,
      title: actionTitle.trim(),
      actionType,
      assignedOfficer: assignedOfficer.trim(),
      assignedOfficerRole: 'CALA / Special LA Officer',
      priority,
      status: 'In Progress',
      dueDate,
      notes: notes.trim(),
      targetDelayReductionMonths: parcel.potentialReductionMonths || 0
    });

    setShowCreateModal(false);
    setActionTitle('');
    setNotes('');
    setAssignedOfficer('');
    setDueDate('');
    setFormErrors({});
  };

  const submitClosure = (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingAction) return;
    if (resolutionNote.trim().length < 5) {
      setResolutionError('Record how this was resolved (at least 5 characters).');
      return;
    }
    updateActionStatus(closingAction.id, 'Completed', resolutionNote.trim());
    setClosingId(null);
    setResolutionNote('');
    setResolutionError(null);
  };

  const beginClose = (id: string) => {
    setResolutionNote('');
    setResolutionError(null);
    setClosingId(id);
  };

  const renderOverdueBadge = (a: CaseAction) => {
    const d = daysOverdue(a, now);
    if (d <= 0) return null;
    const escalate = d >= settings.autoEscalateDelayDays && a.status !== 'Escalated';
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border inline-flex items-center gap-1 ${
          escalate ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}
        title={`Due ${a.dueDate}. Escalation window: ${settings.autoEscalateDelayDays} days (Settings).`}
      >
        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
        {escalate ? `Escalation due · ${d}d overdue` : `${d}d overdue`}
      </span>
    );
  };

  const renderActionButtons = (a: CaseAction) => (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {a.status === 'Pending' && (
        <button
          type="button"
          onClick={() => updateActionStatus(a.id, 'In Progress')}
          className="px-2.5 py-1 bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-medium rounded transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 outline-none"
        >
          Start
        </button>
      )}
      {(a.status === 'In Progress' || a.status === 'Pending') && (
        <button
          type="button"
          onClick={() => updateActionStatus(a.id, 'Escalated', 'Escalated for senior review.')}
          className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-medium rounded transition-colors focus-visible:ring-2 focus-visible:ring-rose-300 outline-none"
        >
          Escalate
        </button>
      )}
      {a.status === 'Escalated' && (
        <button
          type="button"
          onClick={() => updateActionStatus(a.id, 'In Progress', 'Escalation cleared; back in progress.')}
          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-[10px] font-medium rounded transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 outline-none"
        >
          Resume
        </button>
      )}
      {a.status !== 'Completed' && a.status !== 'Pending' && (
        <button
          type="button"
          onClick={() => beginClose(a.id)}
          className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-medium rounded transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 outline-none"
        >
          Resolve
        </button>
      )}
    </div>
  );

  const renderActionCard = (a: CaseAction) => (
    <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setDetailId(a.id)}
          className="font-semibold text-xs text-slate-900 leading-snug text-left hover:text-navy-800 hover:underline focus-visible:ring-2 focus-visible:ring-slate-400 outline-none rounded"
        >
          {a.title}
        </button>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 border ${priorityClass(a.priority)}`}>
          {a.priority}
        </span>
      </div>

      <div className="text-[11px] text-slate-600 flex items-center justify-between gap-2 font-mono">
        <span>Parcel: <strong className="text-slate-900">{a.parcelId}</strong></span>
        <span className="text-slate-500">Due: {a.dueDate}</span>
      </div>
      <div className="text-[11px] text-slate-600">
        Owner: <strong className="text-slate-900">{a.assignedOfficer || 'Unassigned'}</strong>
        <span className="text-slate-400"> · {a.actionType}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {renderOverdueBadge(a)}
      </div>

      {a.notes && <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{a.notes}</p>}

      {a.status === 'Completed' && (
        <div className="text-[11px] text-emerald-800 font-mono font-medium">
          {a.targetDelayReductionMonths > 0
            ? `Est. delay reduction: -${a.targetDelayReductionMonths} mos`
            : 'Closed'}
          {a.completedAt ? ` · ${a.completedAt}` : ''}
        </div>
      )}

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => openParcelDetail(a.parcelId)}
          className="text-[11px] text-navy-800 hover:text-navy-950 font-medium flex items-center gap-0.5 focus-visible:ring-2 focus-visible:ring-slate-400 outline-none rounded"
        >
          <span>Dossier</span>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
        </button>
        {renderActionButtons(a)}
      </div>
    </div>
  );

  const columns: { status: Status; label: string; icon: React.ReactNode; tone: string }[] = [
    { status: 'Pending', label: 'Pending', icon: <Clock className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />, tone: 'text-slate-700' },
    { status: 'In Progress', label: 'In Progress', icon: <UserCheck className="w-3.5 h-3.5 text-navy-700" aria-hidden="true" />, tone: 'text-navy-900' },
    { status: 'Escalated', label: 'Escalated', icon: <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />, tone: 'text-rose-800' },
    { status: 'Completed', label: 'Completed', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />, tone: 'text-emerald-800' }
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Case & Corrective Action Tracking Board
            </h1>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold font-mono bg-slate-100 text-slate-700 border border-slate-200">
              {actions.length} Total Cases
            </span>
            {syncStatus === 'syncing' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500" role="status">
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Saving…
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Dispatch, monitor, and resolve statutory bottlenecks across Land Acquisition units.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-lg border border-slate-200 flex items-center gap-1 text-xs" role="group" aria-label="View mode">
            {(['kanban', 'list'] as const).map(m => (
              <button
                key={m}
                type="button"
                aria-pressed={viewMode === m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1 rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 outline-none ${
                  viewMode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m === 'kanban' ? 'Kanban Board' : 'List View'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openCreate}
            disabled={parcels.length === 0}
            title={parcels.length === 0 ? 'The active project has no parcels to assign an action to' : undefined}
            className="px-3.5 py-2 bg-navy-900 hover:bg-navy-800 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-slate-400 outline-none"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Create Action</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics — always computed over ALL actions (not the filtered view) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Total Cases</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{actions.length}</div>
        </div>
        <div className="p-3.5 bg-white rounded-lg border border-amber-200/80 shadow-xs">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-800">Pending Review</div>
          <div className="text-2xl font-bold font-mono text-amber-700 mt-1">{actions.filter(a => a.status === 'Pending').length}</div>
        </div>
        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-navy-800">In Progress / Escalated</div>
          <div className="text-2xl font-bold font-mono text-navy-900 mt-1">
            {actions.filter(a => a.status === 'In Progress' || a.status === 'Escalated').length}
          </div>
        </div>
        <div className="p-3.5 bg-white rounded-lg border border-rose-200/80 shadow-xs">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-rose-800">Overdue Open</div>
          <div className="text-2xl font-bold font-mono text-rose-700 mt-1">{overdueOpen}</div>
        </div>
        <div className="p-3.5 bg-emerald-50/40 rounded-lg border border-emerald-200 shadow-xs">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-emerald-800" title="Sum of each completed action's estimated delay reduction">Est. Delay Saved</div>
          <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">-{totalSavedMonths.toFixed(1)} Mos</div>
        </div>
      </div>

      {/* Search / filter / sort toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 space-y-2.5" role="search" aria-label="Filter actions">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search actions"
              placeholder="Search title, parcel, survey no., officer, notes, action ID…"
              className={`${inputCls} pl-8 text-xs`}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex gap-2">
            <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | Status)} className={selectCls}>
              <option value="all">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select aria-label="Filter by priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as 'all' | Priority)} className={selectCls}>
              <option value="all">All priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select aria-label="Filter by owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className={selectCls}>
              <option value="all">All owners</option>
              {owners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <select aria-label="Filter by category" value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | CaseAction['actionType'])} className={selectCls}>
              <option value="all">All categories</option>
              {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select aria-label="Sort actions" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className={selectCls}>
              <option value="due-asc">Sort: Due date (soonest)</option>
              <option value="due-desc">Sort: Due date (latest)</option>
              <option value="priority">Sort: Priority</option>
              <option value="status">Sort: Status</option>
              <option value="newest">Sort: Newest first</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500" aria-live="polite">
          <span>
            Showing <strong className="text-slate-800">{visible.length}</strong> of {actions.length} actions
          </span>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 font-semibold text-navy-800 hover:text-navy-950 focus-visible:ring-2 focus-visible:ring-slate-400 outline-none rounded">
              <X className="w-3 h-3" aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Empty states */}
      {actions.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No actions yet"
          description="No corrective actions have been created for this project. Create one from here, or from a parcel dossier."
          action={parcels.length > 0 ? { label: 'Create Action', onClick: openCreate, icon: Plus } : undefined}
        />
      )}
      {actions.length > 0 && visible.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="No actions match these filters"
          description="Try a different search term or clear the filters to see all actions."
          action={{ label: 'Clear filters', onClick: clearFilters, icon: X }}
        />
      )}

      {/* Kanban Board View */}
      {viewMode === 'kanban' && visible.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map(col => {
            const items = byStatus(col.status);
            return (
              <div key={col.status} className="bg-slate-100/70 rounded-xl p-3 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
                  <span className={`font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 ${col.tone}`}>
                    {col.icon}
                    {col.label} ({items.length})
                  </span>
                </div>
                <div className="space-y-2.5">
                  {items.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-3">None</p>
                  ) : (
                    items.map(a => <React.Fragment key={a.id}>{renderActionCard(a)}</React.Fragment>)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View Mode */}
      {viewMode === 'list' && visible.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th scope="col" className="py-2.5 px-4 sticky left-0 bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Action ID & Title</th>
                  <th scope="col" className="py-2.5 px-3">Parcel / Survey</th>
                  <th scope="col" className="py-2.5 px-3">Owner</th>
                  <th scope="col" className="py-2.5 px-3">Category</th>
                  <th scope="col" className="py-2.5 px-3">Priority</th>
                  <th scope="col" className="py-2.5 px-3">Status</th>
                  <th scope="col" className="py-2.5 px-3">Due Date</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/75 transition-colors group">
                    <td className="py-2.5 px-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      <button type="button" onClick={() => setDetailId(a.id)} className="font-semibold text-slate-900 text-left hover:text-navy-800 hover:underline focus-visible:ring-2 focus-visible:ring-slate-400 outline-none rounded">
                        {a.title}
                      </button>
                      <div className="text-[10px] text-slate-500 font-mono">{a.id}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800">
                      <span className="font-semibold">{a.parcelId}</span>
                      <div className="text-[10px] text-slate-500">Sy. {a.surveyNumber}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{a.assignedOfficer || 'Unassigned'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{a.actionType}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${priorityClass(a.priority)}`}>{a.priority}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusClass(a.status)}`}>{a.status}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">
                      {a.dueDate}
                      <div className="mt-0.5">{renderOverdueBadge(a)}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openParcelDetail(a.parcelId)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-navy-900 hover:text-white rounded text-[11px] font-medium transition-colors border border-slate-200 focus-visible:ring-2 focus-visible:ring-slate-400 outline-none"
                        >
                          Inspect
                        </button>
                        {renderActionButtons(a)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action detail */}
      <Modal
        isOpen={!!detailAction}
        onClose={() => setDetailId(null)}
        title={detailAction?.title ?? 'Action'}
        description={detailAction ? `${detailAction.id} · ${detailAction.actionType}` : undefined}
        maxWidth="2xl"
      >
        {detailAction && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap gap-1.5">
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusClass(detailAction.status)}`}>{detailAction.status}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${priorityClass(detailAction.priority)}`}>{detailAction.priority}</span>
              {renderOverdueBadge(detailAction)}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <div><dt className="text-slate-500">Parcel</dt><dd className="font-mono font-semibold text-slate-900">{detailAction.parcelId} · Sy. {detailAction.surveyNumber}</dd></div>
              <div><dt className="text-slate-500">Responsible owner</dt><dd className="font-semibold text-slate-900">{detailAction.assignedOfficer || 'Unassigned'}<span className="block font-normal text-slate-500">{detailAction.assignedOfficerRole}</span></dd></div>
              <div><dt className="text-slate-500">Due date</dt><dd className="font-mono text-slate-900">{detailAction.dueDate}</dd></div>
              <div><dt className="text-slate-500">Created</dt><dd className="font-mono text-slate-900">{detailAction.createdAt || '—'}</dd></div>
              {detailAction.completedAt && (
                <div><dt className="text-slate-500">Resolved</dt><dd className="font-mono text-emerald-800">{detailAction.completedAt}</dd></div>
              )}
              <div><dt className="text-slate-500">Est. delay reduction (target)</dt><dd className="font-mono text-slate-900">{detailAction.targetDelayReductionMonths > 0 ? `${detailAction.targetDelayReductionMonths} months` : 'Not estimated'}</dd></div>
            </dl>

            <div>
              <div className="text-slate-500 mb-1">Directive notes & resolution log</div>
              <p className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 leading-relaxed whitespace-pre-wrap">
                {detailAction.notes || 'No notes recorded.'}
              </p>
            </div>

            <div>
              <div className="text-slate-500 mb-1.5">Blocker evidence for this parcel</div>
              <ParcelBlockersCard parcelId={detailAction.parcelId} compact />
            </div>

            <div className="flex flex-wrap justify-between gap-2 pt-3 border-t border-slate-100">
              <Button variant="outline" size="md" onClick={() => { openParcelDetail(detailAction.parcelId); setDetailId(null); }}>
                Open parcel dossier
              </Button>
              {renderActionButtons(detailAction)}
            </div>
          </div>
        )}
      </Modal>

      {/* Resolution / closure */}
      <Modal
        isOpen={!!closingAction}
        onClose={() => setClosingId(null)}
        title="Resolve action"
        description={closingAction ? `${closingAction.id} · ${closingAction.title}` : undefined}
        maxWidth="md"
      >
        <form onSubmit={submitClosure} className="space-y-3 text-xs">
          <div>
            <label htmlFor="resolution-note" className="block text-slate-700 font-semibold mb-1">Resolution note *</label>
            <textarea
              id="resolution-note"
              value={resolutionNote}
              onChange={e => { setResolutionNote(e.target.value); if (resolutionError) setResolutionError(null); }}
              rows={4}
              placeholder="What was done, and what evidence (order, mutation entry, award deposit receipt) closes this?"
              className={`${inputCls} ${resolutionError ? 'border-red-500' : ''}`}
            />
            {resolutionError && <p className="text-[11px] text-red-600 mt-1" role="alert">{resolutionError}</p>}
          </div>
          <p className="text-[11px] text-slate-500">
            Resolving marks the action Completed, updates the parcel's intervention status, and resolves alerts linked to this parcel. The note is appended to the action log.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="md" onClick={() => setClosingId(null)}>Cancel</Button>
            <Button type="submit" variant="primary" size="md">Mark Completed</Button>
          </div>
        </form>
      </Modal>

      {/* Create Action Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Case Action"
        description="Dispatch statutory directive to resolve bottlenecks"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
          <div>
            <label htmlFor="new-action-parcel" className="block text-slate-700 font-semibold mb-1">Target Land Parcel *</label>
            <select
              id="new-action-parcel"
              value={selectedParcelId}
              onChange={(e) => setSelectedParcelId(e.target.value)}
              className={`${inputCls} font-semibold ${formErrors.parcel ? 'border-red-500' : ''}`}
            >
              {parcels.map(p => (
                <option key={p.id} value={p.id}>
                  {p.id} — Survey {p.surveyNumber} ({p.ownerName}) [{p.riskLevel.toUpperCase()} RISK]
                </option>
              ))}
            </select>
            {formErrors.parcel && <p className="text-[11px] text-red-600 mt-1" role="alert">{formErrors.parcel}</p>}
          </div>

          <div>
            <label htmlFor="new-action-title" className="block text-slate-700 font-semibold mb-1">Action Directive / Title *</label>
            <input
              id="new-action-title"
              type="text"
              value={actionTitle}
              onChange={(e) => {
                setActionTitle(e.target.value);
                if (formErrors.title) setFormErrors(prev => ({ ...prev, title: undefined }));
              }}
              className={`${inputCls} ${formErrors.title ? 'border-red-500 focus:ring-red-200' : ''}`}
              placeholder="e.g. File petition to vacate stay"
            />
            {formErrors.title && <p className="text-[11px] text-red-600 mt-1" role="alert">{formErrors.title}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-action-type" className="block text-slate-700 font-semibold mb-1">Category</label>
              <select
                id="new-action-type"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as CaseAction['actionType'])}
                className={inputCls}
              >
                {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="new-action-officer" className="block text-slate-700 font-semibold mb-1">Assigned Officer *</label>
              <input
                id="new-action-officer"
                type="text"
                list="known-officers"
                value={assignedOfficer}
                onChange={(e) => {
                  setAssignedOfficer(e.target.value);
                  if (formErrors.officer) setFormErrors(prev => ({ ...prev, officer: undefined }));
                }}
                className={`${inputCls} ${formErrors.officer ? 'border-red-500 focus:ring-red-200' : ''}`}
                placeholder="Officer name / designation"
              />
              <datalist id="known-officers">
                {owners.map(o => <option key={o} value={o} />)}
              </datalist>
              {formErrors.officer && <p className="text-[11px] text-red-600 mt-1" role="alert">{formErrors.officer}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-action-priority" className="block text-slate-700 font-semibold mb-1">Priority</label>
              <select
                id="new-action-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={inputCls}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="new-action-due" className="block text-slate-700 font-semibold mb-1">Due Date *</label>
              <input
                id="new-action-due"
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  if (formErrors.dueDate) setFormErrors(prev => ({ ...prev, dueDate: undefined }));
                }}
                className={`${inputCls} ${formErrors.dueDate ? 'border-red-500 focus:ring-red-200' : ''}`}
              />
              {formErrors.dueDate && <p className="text-[11px] text-red-600 mt-1" role="alert">{formErrors.dueDate}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="new-action-notes" className="block text-slate-700 font-semibold mb-1">Detailed Instructions</label>
            <textarea
              id="new-action-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="md" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md">
              Create Action
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
