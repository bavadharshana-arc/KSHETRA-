import React, { useState } from 'react';
import { Plus, Undo2, Redo2, Trash2, ChevronDown, ChevronUp, Route } from 'lucide-react';

interface AlignmentPointsPanelProps {
  /** The single source of truth — routeEditState.routeCoords. */
  coords: [number, number][];
  /** Corridor length from the existing geometry-based calculation (draftLengthKm). */
  lengthKm: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Commit one point's new coordinate into the shared alignment state (records 1 history entry). */
  onCommitPoint: (index: number, coord: [number, number]) => void;
  /** Remove an intermediate waypoint (never Start / End). Records 1 history entry. */
  onRemovePoint: (index: number) => void;
  /** Existing "Add Waypoint" behaviour. */
  onAddWaypoint: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

type Axis = 'lat' | 'lng';
const fieldKey = (i: number, axis: Axis) => `${i}:${axis}`;
const fmt = (n: number) => n.toFixed(6);

const validate = (axis: Axis, raw: string): number | null => {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (axis === 'lat' && (n < -90 || n > 90)) return null;
  if (axis === 'lng' && (n < -180 || n > 180)) return null;
  return n;
};

export const AlignmentPointsPanel: React.FC<AlignmentPointsPanelProps> = ({
  coords,
  lengthKm,
  canUndo,
  canRedo,
  onCommitPoint,
  onRemovePoint,
  onAddWaypoint,
  onUndo,
  onRedo
}) => {
  const [collapsed, setCollapsed] = useState(false);
  // Uncommitted edit buffers, keyed "<index>:<axis>". A field with no buffer entry
  // renders live from `coords` (so map drags / undo / redo appear immediately).
  // The parent remounts this component (via a key on point count) whenever a
  // waypoint is added/removed, so buffers never outlive an index shift.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const shown = (i: number, axis: Axis): string => {
    const k = fieldKey(i, axis);
    if (k in draft) return draft[k];
    return fmt(coords[i][axis === 'lat' ? 0 : 1]);
  };

  const setField = (i: number, axis: Axis, value: string) => {
    const k = fieldKey(i, axis);
    setDraft(d => ({ ...d, [k]: value }));
    setErrors(e => {
      const next = { ...e };
      if (value.trim() === '' || validate(axis, value) === null) {
        next[k] = axis === 'lat' ? 'Latitude must be between -90 and 90' : 'Longitude must be between -180 and 180';
      } else {
        delete next[k];
      }
      return next;
    });
  };

  const clearField = (i: number, axis: Axis) => {
    const k = fieldKey(i, axis);
    setDraft(d => {
      const next = { ...d };
      delete next[k];
      return next;
    });
    setErrors(e => {
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  // Commit whichever axes of point `i` have pending edits, as ONE alignment change.
  const commitPoint = (i: number) => {
    const kLat = fieldKey(i, 'lat');
    const kLng = fieldKey(i, 'lng');
    const touchedLat = kLat in draft;
    const touchedLng = kLng in draft;
    if (!touchedLat && !touchedLng) return;

    const cur = coords[i];
    if (!cur) return;

    const latN = touchedLat ? validate('lat', draft[kLat]) : cur[0];
    const lngN = touchedLng ? validate('lng', draft[kLng]) : cur[1];

    // Invalid — keep the buffer + inline error, do not touch the alignment.
    if ((touchedLat && latN === null) || (touchedLng && lngN === null)) {
      setErrors(e => ({
        ...e,
        ...(touchedLat && latN === null ? { [kLat]: 'Latitude must be between -90 and 90' } : {}),
        ...(touchedLng && lngN === null ? { [kLng]: 'Longitude must be between -180 and 180' } : {})
      }));
      return;
    }

    const next: [number, number] = [+(latN as number).toFixed(6), +(lngN as number).toFixed(6)];
    const changed = next[0] !== cur[0] || next[1] !== cur[1];

    setDraft(d => {
      const n = { ...d };
      delete n[kLat];
      delete n[kLng];
      return n;
    });
    setErrors(e => {
      const n = { ...e };
      delete n[kLat];
      delete n[kLng];
      return n;
    });

    if (changed) onCommitPoint(i, next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number, axis: Axis) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitPoint(i);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearField(i, axis);
      e.currentTarget.blur();
    }
  };

  const lastIndex = coords.length - 1;
  const rowLabel = (i: number) => (i === 0 ? 'START' : i === lastIndex ? 'END' : `WAYPOINT ${i}`);
  const rowTone = (i: number) =>
    i === 0 ? 'text-emerald-700' : i === lastIndex ? 'text-red-700' : 'text-blue-700';

  return (
    <div className="absolute top-4 right-4 z-20 w-[264px] max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] flex flex-col bg-white/97 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
        <div>
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5 text-blue-600" />
            Alignment Points
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {coords.length} points &bull; {lengthKm} km corridor
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Point list */}
          <div className="overflow-y-auto px-3.5 py-3 space-y-3">
            {coords.map((c, i) => {
              const kLat = fieldKey(i, 'lat');
              const kLng = fieldKey(i, 'lng');
              const removable = i > 0 && i < lastIndex && coords.length > 2;
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${rowTone(i)}`}>
                      {rowLabel(i)}
                    </span>
                    {removable && (
                      <button
                        type="button"
                        onClick={() => onRemovePoint(i)}
                        className="p-0.5 text-slate-300 hover:text-red-600 rounded"
                        title={`Remove waypoint ${i}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-400 mb-0.5">Latitude</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={shown(i, 'lat')}
                        onChange={e => setField(i, 'lat', e.target.value)}
                        onBlur={() => commitPoint(i)}
                        onKeyDown={e => onKeyDown(e, i, 'lat')}
                        className={`w-full px-2 py-1 text-[11px] font-mono bg-white border rounded-lg focus:outline-none ${
                          errors[kLat] ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-400 mb-0.5">Longitude</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={shown(i, 'lng')}
                        onChange={e => setField(i, 'lng', e.target.value)}
                        onBlur={() => commitPoint(i)}
                        onKeyDown={e => onKeyDown(e, i, 'lng')}
                        className={`w-full px-2 py-1 text-[11px] font-mono bg-white border rounded-lg focus:outline-none ${
                          errors[kLng] ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
                        }`}
                      />
                    </div>
                  </div>

                  {(errors[kLat] || errors[kLng]) && (
                    <div className="text-[9px] text-red-600 font-medium leading-tight">
                      {errors[kLat] || errors[kLng]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="px-3.5 py-2.5 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={onAddWaypoint}
              className="w-full px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Waypoint
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <Redo2 className="w-3.5 h-3.5" />
                Redo
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
