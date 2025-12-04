import React from 'react';

const SkeletonScheduleCard = () => {
  return (
    <div className="bg-surface-hover rounded-lg border border-slate-700 flex flex-col" style={{ padding: "2.5rem" }}>
      {/* Header with row number and buttons - matches actual structure */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Row label skeleton - text-sm font-medium text-muted */}
          <div className="skeleton-shimmer rounded" style={{ width: "5rem", height: "1.25rem" }} />
        </div>
        <div className="flex gap-2">
          {/* Edit button skeleton - w-10 h-10 */}
          <div className="skeleton-shimmer rounded-lg" style={{ width: "2.5rem", height: "2.5rem" }} />
          {/* Delete button skeleton - w-10 h-10 */}
          <div className="skeleton-shimmer rounded-lg" style={{ width: "2.5rem", height: "2.5rem" }} />
        </div>
      </div>
      
      {/* Content section - matches flex-1 with gap: "1rem" */}
      <div className="flex-1" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Staff name skeleton - text-white font-medium */}
        <div className="skeleton-shimmer rounded" style={{ width: "75%", height: "1.5rem" }} />
        
        {/* Room name skeleton - text-sm text-muted */}
        <div className="skeleton-shimmer rounded" style={{ width: "66%", height: "1.25rem" }} />
        
        {/* Time range skeleton - flex items-center gap-2 text-sm text-muted with Clock icon (size={14}) */}
        <div className="flex items-center gap-2">
          {/* Clock icon skeleton - size 14 = 14px = 0.875rem */}
          <div className="skeleton-shimmer rounded" style={{ width: "0.875rem", height: "0.875rem" }} />
          {/* Time text skeleton */}
          <div className="skeleton-shimmer rounded" style={{ width: "8rem", height: "1.25rem" }} />
        </div>
        
        {/* Applies to days skeleton - text-xs text-muted */}
        <div className="skeleton-shimmer rounded w-full" style={{ height: "1rem" }} />
      </div>
    </div>
  );
};

export default SkeletonScheduleCard;

