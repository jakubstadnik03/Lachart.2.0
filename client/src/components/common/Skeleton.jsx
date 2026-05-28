import React from 'react';

export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-gray-200/80 ${className}`} aria-hidden="true" />
);

export const SkeletonLine = ({ className = '' }) => (
  <Skeleton className={`h-3 ${className}`} />
);

export const SkeletonCard = ({ className = '', lines = 3 }) => (
  <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${className}`} aria-busy="true">
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="w-1/3" />
        <SkeletonLine className="w-1/2" />
      </div>
    </div>
    <div className="mt-4 space-y-2">
      {Array.from({ length: lines }).map((_, idx) => (
        <SkeletonLine key={idx} className={idx === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  </div>
);

export const SkeletonGrid = ({ cards = 4, className = '', cardClassName = '' }) => (
  <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
    {Array.from({ length: cards }).map((_, idx) => (
      <SkeletonCard key={idx} className={cardClassName} />
    ))}
  </div>
);

export const SkeletonTable = ({ rows = 5, columns = 5, className = '' }) => (
  <div className={`overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ${className}`} aria-busy="true">
    <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
      <SkeletonLine className="w-48" />
    </div>
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="grid gap-3 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, colIdx) => (
            <SkeletonLine key={colIdx} className={colIdx === 0 ? 'w-4/5' : 'w-2/3'} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const PageSkeleton = ({ titleWidth = 'w-64', cards = 4, children = null }) => (
  <div className="space-y-6" aria-busy="true">
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <SkeletonLine className={`${titleWidth} h-5`} />
      <SkeletonLine className="mt-3 w-96 max-w-full" />
    </div>
    <SkeletonGrid cards={cards} />
    {children || <SkeletonTable rows={6} columns={5} />}
  </div>
);

export default Skeleton;
