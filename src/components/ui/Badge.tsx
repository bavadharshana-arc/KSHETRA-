import React from 'react';
import { ACCENT, AccentColor } from './colors';

interface BadgeProps {
  color?: AccentColor;
  children: React.ReactNode;
  className?: string;
  /** Small dot indicator before the label, useful for "live" / active states. */
  dot?: boolean;
}

/**
 * Small status/risk/priority tag. Deliberately uses `rounded-md` rather than
 * a full pill — the design system avoids "excessive rounded pills" in favor
 * of a crisper, denser enterprise look.
 */
export const Badge: React.FC<BadgeProps> = ({ color = 'neutral', children, className = '', dot = false }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${ACCENT[color].badge} ${className}`}
  >
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${ACCENT[color].dot}`} />}
    {children}
  </span>
);
