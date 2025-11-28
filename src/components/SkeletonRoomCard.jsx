import React from 'react';

const SkeletonRoomCard = () => {
  return (
    <div className="bg-surface rounded-lg overflow-hidden shadow-md border border-slate-700 flex flex-col h-full">
      {/* Image skeleton with shimmer */}
      <div className="relative h-48 w-full overflow-hidden">
        <div className="skeleton-shimmer h-full w-full" />
        {/* Badge skeleton */}
        <div className="absolute top-4 right-4">
          <div className="skeleton-shimmer h-6 w-20 rounded-full" />
        </div>
      </div>
      
      <div className="p-4 flex-1 flex flex-col">
        {/* Title skeleton */}
        <div className="flex justify-between items-start mb-2">
          <div className="skeleton-shimmer h-6 rounded w-2/3" />
        </div>

        {/* Features skeleton - matching actual card structure */}
        <div className="flex flex-wrap gap-2 pb-6 border-b border-slate-700/30 mb-6" style={{ paddingBottom: '24px', marginBottom: '24px' }}>
          <div className="skeleton-shimmer h-6 rounded w-20" />
          <div className="skeleton-shimmer h-6 rounded w-24" />
          <div className="skeleton-shimmer h-6 rounded w-16" />
        </div>

        {/* Booking info skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="flex flex-col gap-2 mb-3">
            <div className="skeleton-shimmer h-4 rounded w-3/4" />
            <div className="skeleton-shimmer h-3 rounded w-1/2" />
            <div className="skeleton-shimmer h-3 rounded w-2/3" />
          </div>
          
          {/* Button skeleton */}
          <div className="mt-auto">
            <div className="skeleton-shimmer h-12 rounded-md w-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonRoomCard;
