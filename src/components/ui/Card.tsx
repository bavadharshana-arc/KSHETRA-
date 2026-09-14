import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** Adds a hover border/shadow lift for clickable cards. */
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md';
}

const PADDING = {
  none: '',
  sm: 'p-3.5',
  md: 'p-5'
};

/**
 * Base white card surface: consistent radius, border and shadow so every
 * panel in the app reads as one system instead of each view picking its
 * own rounding/shadow combination.
 */
export const Card: React.FC<CardProps> = ({ children, className = '', onClick, hoverable = false, padding = 'md' }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${PADDING[padding]} ${
      hoverable ? 'cursor-pointer transition-all hover:border-blue-300 hover:shadow-md' : ''
    } ${className}`}
  >
    {children}
  </div>
);
