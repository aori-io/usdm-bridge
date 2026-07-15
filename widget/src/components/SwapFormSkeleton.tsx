'use client';

import React from 'react';

export const SwapFormSkeleton: React.FC = () => (
  <div className="flex flex-col w-full">
    {/* Base section */}
    <div
      className="relative px-4 pt-4 pb-2"
      style={{ borderBottom: '1px solid var(--widget-border)' }}
    >
      {/* Token selector row */}
      <div
        className="h-12 w-full animate-pulse"
        style={{ backgroundColor: 'var(--widget-secondary)', borderRadius: '0.25rem' }}
      />
      {/* Amount input area */}
      <div
        className="mt-2 h-20 w-2/3 animate-pulse"
        style={{ backgroundColor: 'var(--widget-secondary)', opacity: 0.5, borderRadius: '0.25rem' }}
      />
      {/* USD value row */}
      <div className="mt-1 mb-1 flex w-full items-center justify-between">
        <div
          className="h-4 w-12 animate-pulse"
          style={{ backgroundColor: 'var(--widget-secondary)', opacity: 0.4, borderRadius: '0.25rem' }}
        />
      </div>
    </div>

    {/* Invert button (centered on border) */}
    <div className="flex justify-center -my-4 relative z-10">
      <div
        className="h-8 w-8"
        style={{
          border: '1px solid var(--widget-border)',
          backgroundColor: 'var(--widget-card)',
          borderRadius: '9999px',
        }}
      />
    </div>

    {/* Quote section */}
    <div className="relative px-4 pt-6 pb-2">
      {/* Token selector row */}
      <div
        className="h-12 w-full animate-pulse"
        style={{ backgroundColor: 'var(--widget-secondary)', borderRadius: '0.25rem' }}
      />
      {/* Amount input area */}
      <div
        className="mt-2 h-20 w-2/3 animate-pulse"
        style={{ backgroundColor: 'var(--widget-secondary)', opacity: 0.5, borderRadius: '0.25rem' }}
      />
      {/* USD value row */}
      <div className="mt-1 mb-1 flex w-full items-center justify-between">
        <div
          className="h-4 w-12 animate-pulse"
          style={{ backgroundColor: 'var(--widget-secondary)', opacity: 0.4, borderRadius: '0.25rem' }}
        />
      </div>
    </div>

    {/* Quote loader bar */}
    <div
      className="px-4"
      style={{
        height: '28px',
        borderTop: '1px solid var(--widget-border)',
        borderBottom: '1px solid var(--widget-border)',
      }}
    />

    {/* Swap button */}
    <div className="relative px-4 py-4">
      <div
        className="w-full animate-pulse"
        style={{
          height: '44px',
          backgroundColor: 'var(--widget-secondary)',
          borderRadius: 'var(--widget-radius)',
          opacity: 0.6,
        }}
      />
    </div>
  </div>
);
