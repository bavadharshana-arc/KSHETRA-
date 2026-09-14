import React from 'react';
import { LucideIcon } from 'lucide-react';
import { IconTile } from './IconTile';
import { ACCENT, AccentColor } from './colors';

interface KpiCardProps {
  icon: LucideIcon;
  color?: AccentColor;
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  onClick?: () => void;
  /** Applies a very subtle tinted background wash — reserve for the KPIs that most need visual weight (risk tiers, alerts). Most cards should stay white. */
  tinted?: boolean;
  /** Pulses the icon tile — use sparingly for genuinely live/urgent state. */
  live?: boolean;
}

/**
 * One of the 8 top-of-dashboard KPI tiles. Mostly white/neutral by default;
 * color is carried by the icon tile, the value, the left edge and — only
 * when `tinted` — a faint background wash. This keeps the KPI row readable
 * as one row instead of a rainbow strip.
 */
export const KpiCard: React.FC<KpiCardProps> = ({ icon, color = 'blue', label, value, sublabel, onClick, tinted = false, live = false }) => {
  const a = ACCENT[color];
  return (
    <div
      onClick={onClick}
      className={`relative pl-4 pr-3.5 py-3.5 rounded-xl border border-l-4 border-slate-200 ${a.edge} shadow-sm transition-all ${
        tinted ? a.surface : 'bg-white'
      } ${onClick ? `cursor-pointer hover:shadow-md ${a.hoverBorder}` : ''} group`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider leading-tight">{label}</span>
        <IconTile icon={icon} color={color} size="sm" className={live ? 'animate-subtle-pulse' : ''} />
      </div>
      <div className={`text-xl font-black mt-1.5 ${a.text}`}>{value}</div>
      {sublabel && <div className="text-[10.5px] text-slate-500 mt-1 font-medium">{sublabel}</div>}
    </div>
  );
};
