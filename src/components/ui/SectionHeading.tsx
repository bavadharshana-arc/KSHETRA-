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
export const SectionHeading: React.FC<SectionHeadingProps> = ({ 
  icon: Icon, 
  color = 'neutral', 
  title, 
  subtitle, 
  action, 
  className = '' 
}) => {
  const isAi = color === 'ai';

  return (
    <div className={`flex items-start justify-between gap-3 pb-2.5 mb-3.5 border-b border-slate-150 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className={`w-4 h-4 shrink-0 ${isAi ? 'text-ai-600' : 'text-slate-500'}`} />
          )}
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 truncate">
            {title}
          </h3>
          {isAi && (
            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-ai-50 text-ai-700 border border-ai-200 uppercase tracking-wider">
              AI Forecast
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5 pl-6 truncate">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
