import React from 'react';
import { LucideIcon } from 'lucide-react';
import { IconTile } from './IconTile';
import { ACCENT, AccentColor } from './colors';

export interface KpiCardProps {
  icon?: LucideIcon;
  color?: AccentColor;
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  onClick?: () => void;
  /** 'hero' for primary corridor metrics, 'compact' for secondary metric strips, 'standard' for standard grid. */
  variant?: 'hero' | 'compact' | 'standard';
  /** Applies a subtle tinted background wash — reserved for high-attention states. */
  tinted?: boolean;
  /** Pulses the live indicator dot — use sparingly for urgent live state. */
  live?: boolean;
  /** Add left accent border ONLY where earned by true severity (e.g. active litigation stay). */
  showSeverityBorder?: boolean;
  /** Optional badge text next to the label (e.g. "Primary Target", "Corridor Wide") */
  badgeText?: string;
  className?: string;
}

/**
 * Government decision-support KPI tile.
 * Restrained, authoritative styling with clean tabular numerals.
 * Decorative left borders are removed by default unless earned by real severity.
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  icon,
  color = 'blue',
  label,
  value,
  sublabel,
  onClick,
  variant = 'standard',
  tinted = false,
  live = false,
  showSeverityBorder = false,
  badgeText,
  className = ''
}) => {
  const a = ACCENT[color];

  if (variant === 'hero') {
    return (
      <div
        onClick={onClick}
        className={`relative p-5 rounded-2xl border transition-all ${
          showSeverityBorder ? `border-l-4 ${a.edge} border-slate-200` : 'border-slate-200'
        } ${tinted ? a.surface : 'bg-white'} ${
          onClick ? `cursor-pointer hover:border-slate-300 hover:shadow-md` : 'shadow-sm'
        } ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
            {badgeText && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.badge}`}>
                {badgeText}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {live && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
            {icon && <IconTile icon={icon} color={color} size="sm" />}
          </div>
        </div>
        <div className="text-3xl font-bold font-mono tracking-tight text-slate-900 mt-2.5 tabular-nums">
          {value}
        </div>
        {sublabel && (
          <div className="text-xs text-slate-500 mt-1.5 font-medium flex items-center gap-1.5">
            {sublabel}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        onClick={onClick}
        className={`p-3 rounded-xl border border-slate-200 bg-white transition-all ${
          onClick ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-50/70 shadow-xs' : 'shadow-xs'
        } ${tinted ? a.surface : ''} ${className}`}
      >
        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 uppercase tracking-wide">
          <span className="truncate">{label}</span>
          {icon && <IconTile icon={icon} color={color} size="sm" className="scale-75 origin-right" />}
        </div>
        <div className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
          {value}
        </div>
        {sublabel && (
          <div className="text-[10px] text-slate-400 mt-0.5 truncate font-medium">
            {sublabel}
          </div>
        )}
      </div>
    );
  }

  // Standard variant
  return (
    <div
      onClick={onClick}
      className={`relative p-4 rounded-xl border transition-all ${
        showSeverityBorder ? `border-l-4 ${a.edge} border-slate-200` : 'border-slate-200'
      } ${tinted ? a.surface : 'bg-white'} ${
        onClick ? `cursor-pointer hover:shadow-md hover:border-slate-300` : 'shadow-sm'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider leading-tight">{label}</span>
        {icon && <IconTile icon={icon} color={color} size="sm" className={live ? 'animate-subtle-pulse' : ''} />}
      </div>
      <div className="text-xl font-bold font-mono text-slate-900 mt-1.5 tabular-nums">{value}</div>
      {sublabel && <div className="text-[11px] text-slate-500 mt-1 font-medium">{sublabel}</div>}
    </div>
  );
};
