import { RiskLevel } from '../../types';

/**
 * Centralized semantic color system for KSHETRA UI primitives
 * (Badge, IconTile, KpiCard, SectionHeading).
 *
 * This is the single place that decides "what color means what" so that
 * risk levels, priorities and module identities (GIS, AI, Gov Sync, ...)
 * render consistently everywhere instead of each view hand-rolling its own
 * ternary chain of Tailwind classes. Palette values themselves come from
 * src/styles/tokens.css.
 */
export type AccentColor =
  | 'blue'
  | 'navy'
  | 'teal'
  | 'indigo'
  | 'purple'
  | 'emerald'
  | 'amber'
  | 'red'
  | 'neutral'
  | 'ai';

interface AccentClasses {
  /** Tinted icon container background + icon color (IconTile, KPI icon). */
  tile: string;
  /** Badge/pill background, text and border. */
  badge: string;
  /** Solid-ish text-only usage (numbers, links). */
  text: string;
  /** Left accent border for cards that earned a real severity edge. */
  edge: string;
  /** Subtle tinted card background (used sparingly). */
  surface: string;
  /** Solid dot/indicator fill. */
  dot: string;
  /** Hover border used by clickable/tinted cards. */
  hoverBorder: string;
}

export const ACCENT: Record<AccentColor, AccentClasses> = {
  blue: {
    tile: 'bg-blue-50 text-blue-700',
    badge: 'bg-blue-50 text-blue-800 border border-blue-200',
    text: 'text-blue-700',
    edge: 'border-l-blue-600',
    surface: 'bg-blue-50/40',
    dot: 'bg-blue-600',
    hoverBorder: 'hover:border-blue-300'
  },
  navy: {
    tile: 'bg-slate-100 text-slate-800',
    badge: 'bg-slate-100 text-slate-800 border border-slate-300',
    text: 'text-slate-900',
    edge: 'border-l-slate-700',
    surface: 'bg-slate-50',
    dot: 'bg-slate-700',
    hoverBorder: 'hover:border-slate-400'
  },
  teal: {
    tile: 'bg-teal-50 text-teal-700',
    badge: 'bg-teal-50 text-teal-800 border border-teal-200',
    text: 'text-teal-700',
    edge: 'border-l-teal-600',
    surface: 'bg-teal-50/40',
    dot: 'bg-teal-600',
    hoverBorder: 'hover:border-teal-300'
  },
  indigo: {
    tile: 'bg-indigo-50 text-indigo-700',
    badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    text: 'text-indigo-700',
    edge: 'border-l-indigo-600',
    surface: 'bg-indigo-50/40',
    dot: 'bg-indigo-600',
    hoverBorder: 'hover:border-indigo-300'
  },
  ai: {
    tile: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium',
    text: 'text-indigo-700',
    edge: 'border-l-indigo-600',
    surface: 'bg-indigo-50/50',
    dot: 'bg-indigo-600',
    hoverBorder: 'hover:border-indigo-300'
  },
  purple: {
    tile: 'bg-purple-50 text-purple-700',
    badge: 'bg-purple-50 text-purple-800 border border-purple-200',
    text: 'text-purple-700',
    edge: 'border-l-purple-600',
    surface: 'bg-purple-50/40',
    dot: 'bg-purple-600',
    hoverBorder: 'hover:border-purple-300'
  },
  emerald: {
    tile: 'bg-emerald-50 text-emerald-700',
    badge: 'bg-emerald-50 text-emerald-800 border border-emerald-200/80',
    text: 'text-emerald-700',
    edge: 'border-l-emerald-600',
    surface: 'bg-emerald-50/40',
    dot: 'bg-emerald-600',
    hoverBorder: 'hover:border-emerald-300'
  },
  amber: {
    tile: 'bg-amber-50 text-amber-800',
    badge: 'bg-amber-50 text-amber-900 border border-amber-200',
    text: 'text-amber-800',
    edge: 'border-l-amber-500',
    surface: 'bg-amber-50/50',
    dot: 'bg-amber-500',
    hoverBorder: 'hover:border-amber-300'
  },
  red: {
    tile: 'bg-red-50 text-red-700',
    badge: 'bg-red-50 text-red-800 border border-red-200',
    text: 'text-red-700',
    edge: 'border-l-red-600',
    surface: 'bg-red-50/60',
    dot: 'bg-red-600',
    hoverBorder: 'hover:border-red-300'
  },
  neutral: {
    tile: 'bg-slate-100 text-slate-600',
    badge: 'bg-slate-100 text-slate-700 border border-slate-200',
    text: 'text-slate-600',
    edge: 'border-l-slate-300',
    surface: 'bg-slate-50',
    dot: 'bg-slate-400',
    hoverBorder: 'hover:border-slate-300'
  }
};

/**
 * Delay Risk Level → accent color.
 * Red is reserved strictly for true critical states (active litigation, stay orders).
 * Routine delay risk / attention is represented by disciplined amber.
 */
export const riskAccent = (level: RiskLevel): AccentColor =>
  level === 'high' ? 'amber' : level === 'medium' ? 'amber' : 'emerald';

export const riskLabel = (level: RiskLevel): string =>
  level === 'high' ? 'HIGH RISK' : level === 'medium' ? 'NEEDS ATTENTION' : 'LOW RISK';

/**
 * Case/action priority → accent color.
 * CRITICAL = red (vacate stay / legal emergency), HIGH = amber, MEDIUM/LOW = amber/emerald.
 */
export const priorityAccent = (priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'): AccentColor =>
  priority === 'CRITICAL' ? 'red' : priority === 'HIGH' ? 'amber' : priority === 'MEDIUM' ? 'amber' : 'emerald';

/** Generic status word → accent color for data fields. */
export const statusAccent = (status: string): AccentColor => {
  const s = status.toLowerCase();
  if (['acquired', 'completed', 'complete', 'resolved', 'verified', 'synced', 'up-to-date', 'clear', 'disbursed 100%'].some(k => s.includes(k))) {
    return 'emerald';
  }
  if (['pending', 'assigned', 'in progress', 'in-progress', 'syncing', 'partial', 'medium', 'high'].some(k => s.includes(k))) {
    return 'amber';
  }
  if (['stay order', 'interim injunction', 'contested', 'disputed', 'escalated', 'error', 'critical', 'overdue'].some(k => s.includes(k))) {
    return 'red';
  }
  return 'neutral';
};
