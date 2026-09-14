import React from 'react';
import { LucideIcon } from 'lucide-react';
import { ACCENT, AccentColor } from './colors';

interface IconTileProps {
  icon: LucideIcon;
  color?: AccentColor;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = {
  sm: { box: 'w-7 h-7 rounded-lg', icon: 'w-3.5 h-3.5' },
  md: { box: 'w-9 h-9 rounded-lg', icon: 'w-4 h-4' },
  lg: { box: 'w-11 h-11 rounded-xl', icon: 'w-5 h-5' }
};

/**
 * Small colored icon container used for sidebar nav items, section headings
 * and KPI cards. Carries color so the surrounding text/background can stay
 * neutral — this is the primary mechanism for "colored icons on neutral
 * surfaces" instead of coloring whole rows/cards.
 */
export const IconTile: React.FC<IconTileProps> = ({ icon: Icon, color = 'blue', size = 'md', className = '' }) => {
  const s = SIZE[size];
  return (
    <div className={`shrink-0 flex items-center justify-center ${s.box} ${ACCENT[color].tile} ${className}`}>
      <Icon className={s.icon} />
    </div>
  );
};
