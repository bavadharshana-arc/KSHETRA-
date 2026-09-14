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
  | 'neutral';

interface AccentClasses {
  /** Tinted icon container background + icon color (IconTile, KPI icon). */
  tile: string;
  /** Badge/pill background, text and border. */
  badge: string;
  /** Solid-ish text-only usage (numbers, links). */
  text: string;
  /** Left accent border for cards that want a colored edge. */
  edge: string;
  /** Subtle tinted card background (used sparingly, e.g. high-risk KPI). */
  surface: string;
  /** Solid dot/indicator fill. */
  dot: string;
  /** Hover border used by clickable/tinted cards (must be a literal class for Tailwind's scanner). */
  hoverBorder: string;
}

export const ACCENT: Record<AccentColor, AccentClasses> = {
  blue: {
    tile: 'bg-blue-50 text-blue-600',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    text: 'text-blue-600',
    edge: 'border-l-blue-500',
    surface: 'bg-blue-50/60',
    dot: 'bg-blue-500',
    hoverBorder: 'hover:border-blue-300'
  },
  navy: {
    tile: 'bg-navy-50 text-navy-800',
    badge: 'bg-navy-50 text-navy-800 border border-navy-200',
    text: 'text-navy-800',
    edge: 'border-l-navy-700',
    surface: 'bg-navy-50/60',
    dot: 'bg-navy-700',
    hoverBorder: 'hover:border-navy-300'
  },
  teal: {
    tile: 'bg-teal-50 text-teal-600',
    badge: 'bg-teal-50 text-teal-700 border border-teal-200',
    text: 'text-teal-600',
    edge: 'border-l-teal-500',
    surface: 'bg-teal-50/60',
    dot: 'bg-teal-500',
    hoverBorder: 'hover:border-teal-300'
  },
  indigo: {
    tile: 'bg-indigo-50 text-indigo-600',
    badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    text: 'text-indigo-600',
    edge: 'border-l-indigo-500',
    surface: 'bg-indigo-50/60',
    dot: 'bg-indigo-500',
    hoverBorder: 'hover:border-indigo-300'
  },
  purple: {
    tile: 'bg-purple-50 text-purple-600',
    badge: 'bg-purple-50 text-purple-700 border border-purple-200',
    text: 'text-purple-600',
    edge: 'border-l-purple-500',
    surface: 'bg-purple-50/60',
    dot: 'bg-purple-500',
    hoverBorder: 'hover:border-purple-300'
  },
  emerald: {
    tile: 'bg-emerald-50 text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    text: 'text-emerald-600',
    edge: 'border-l-emerald-500',
    surface: 'bg-emerald-50/60',
    dot: 'bg-emerald-500',
    hoverBorder: 'hover:border-emerald-300'
  },
  amber: {
    tile: 'bg-amber-50 text-amber-700',
    badge: 'bg-amber-50 text-amber-800 border border-amber-200',
    text: 'text-amber-700',
    edge: 'border-l-amber-500',
    surface: 'bg-amber-50/60',
    dot: 'bg-amber-500',
    hoverBorder: 'hover:border-amber-300'
  },
  red: {
    tile: 'bg-red-50 text-red-600',
    badge: 'bg-red-50 text-red-700 border border-red-200',
    text: 'text-red-600',
    edge: 'border-l-red-500',
    surface: 'bg-red-50/60',
    dot: 'bg-red-500',
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

/** Risk level → accent color. High=red, Medium=amber, Low=emerald(green). */
export const riskAccent = (level: RiskLevel): AccentColor =>
  level === 'high' ? 'red' : level === 'medium' ? 'amber' : 'emerald';

export const riskLabel = (level: RiskLevel): string =>
  level === 'high' ? 'HIGH' : level === 'medium' ? 'MEDIUM' : 'LOW';

/** Case/action priority → accent color. P1=red, P2=amber, P3/P4=emerald. */
export const priorityAccent = (priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'): AccentColor =>
  priority === 'CRITICAL' || priority === 'HIGH' ? 'red' : priority === 'MEDIUM' ? 'amber' : 'emerald';

/** Generic status word → accent color for the many free-text status fields in mock data. */
export const statusAccent = (status: string): AccentColor => {
  const s = status.toLowerCase();
  if (['acquired', 'completed', 'complete', 'resolved', 'verified', 'synced', 'up-to-date', 'clear', 'disbursed 100%'].some(k => s.includes(k))) {
    return 'emerald';
  }
  if (['pending', 'assigned', 'in progress', 'in-progress', 'syncing', 'partial', 'medium'].some(k => s.includes(k))) {
    return 'amber';
  }
  if (['contested', 'disputed', 'escalated', 'error', 'active', 'missing', 'stale', 'overdue', 'critical', 'high'].some(k => s.includes(k))) {
    return 'red';
  }
  return 'neutral';
};
