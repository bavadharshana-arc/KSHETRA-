import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rectangular',
  width,
  height,
  className = '',
  style,
  ...props
}) => {
  const variantClass = {
    text: 'h-4 rounded',
    rectangular: 'rounded-xl',
    circular: 'rounded-full'
  }[variant];

  return (
    <div
      role="status"
      aria-label="Loading..."
      className={`animate-pulse bg-slate-200/80 ${variantClass} ${className}`}
      style={{
        width,
        height,
        ...style
      }}
      {...props}
    >
      <span className="sr-only">Loading content...</span>
    </div>
  );
};

export const KpiGridSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5" role="status" aria-label="Loading metrics">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton variant="text" className="w-24 h-3" />
          <Skeleton variant="circular" className="w-7 h-7" />
        </div>
        <Skeleton variant="rectangular" className="w-20 h-7" />
        <Skeleton variant="text" className="w-32 h-3" />
      </div>
    ))}
    <span className="sr-only">Loading metrics...</span>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 6 }) => (
  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs" role="status" aria-label="Loading table data">
    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex gap-4">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} variant="text" className="h-3.5 flex-1" />
      ))}
    </div>
    <div className="divide-y divide-slate-100 p-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-3 py-3.5 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} variant="text" className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
    <span className="sr-only">Loading table rows...</span>
  </div>
);

export const CardSkeleton: React.FC<{ className?: string }> = ({ className = 'h-64' }) => (
  <div className={`p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4 ${className}`} role="status">
    <div className="flex justify-between items-center">
      <Skeleton variant="text" className="w-36 h-4" />
      <Skeleton variant="rectangular" className="w-16 h-6" />
    </div>
    <Skeleton variant="rectangular" className="w-full h-40" />
    <span className="sr-only">Loading card...</span>
  </div>
);

export const MapSkeleton: React.FC<{ className?: string }> = ({ className = 'h-[calc(100vh-140px)] min-h-[500px]' }) => (
  <div
    className={`w-full relative rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden flex flex-col items-center justify-center ${className}`}
    role="status"
    aria-label="Loading GIS Map"
  >
    <div className="absolute inset-0 bg-gradient-to-br from-slate-200/40 via-slate-100 to-slate-200/40 animate-pulse" />
    <div className="relative z-10 flex flex-col items-center gap-3 p-6 text-center">
      <div className="w-10 h-10 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
      <div className="space-y-1">
        <p className="text-xs font-semibold text-slate-700">Initialising GIS Vector Layers & Survey Parcels...</p>
        <p className="text-[11px] text-slate-400">Loading Leaflet canvas and high-resolution satellite imagery</p>
      </div>
    </div>
  </div>
);
