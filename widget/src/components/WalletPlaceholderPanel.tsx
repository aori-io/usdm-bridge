'use client';

import React from 'react';
import { useDisconnect } from 'wagmi';
import { useWalletState } from '../wallet/useWalletState';

export const WalletPlaceholderPanel: React.FC = () => {
  const { disconnect } = useDisconnect();
  const { address } = useWalletState();

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3 text-center">
        <svg
          className="size-8"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: 'var(--widget-muted-foreground)', opacity: 0.5 }}
        >
          <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
          <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--widget-foreground)' }}
        >
          Your custom components live here
        </p>
      </div>
      {address && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => disconnect()}
            className="w-full py-2.5 text-xs font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--widget-secondary)',
              color: 'var(--widget-secondary-foreground)',
              borderRadius: 'var(--widget-radius)',
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};
