import React from 'react';
import { LucideIcon } from 'lucide-react';
import { IconTile } from './IconTile';
import { AccentColor } from './colors';

interface SectionHeadingProps {
  icon: LucideIcon;
  color?: AccentColor;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Standard "colored icon + navy heading + subtitle" row used at the top of
 * every dashboard/section card, per the KSHETRA visual identity rules
 * (each section gets a small colored icon container, not a colored block).
 */
export const SectionHeading: React.FC<SectionHeadingProps> = ({ icon, color = 'blue', title, subtitle, action, className = '' }) => (
  <div className={`flex items-center justify-between gap-3 ${className}`}>
    <div className="flex items-center gap-2.5 min-w-0">
      <IconTile icon={icon} color={color} />
      <div className="min-w-0">
        <h3 className="font-bold text-sm text-slate-900 truncate">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
