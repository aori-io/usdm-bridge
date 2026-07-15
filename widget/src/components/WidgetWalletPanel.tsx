'use client';

import type { Asset } from '../internal';
import React, { useCallback, useState } from 'react';
import { useDisconnect } from 'wagmi';
import { useSwapFormContext } from '../providers/SwapFormProvider';
import { useWidgetSwapUIStore } from '../stores/swapUIStore';
import { useWidgetWalletData } from '../hooks/useWidgetWalletData';
import { WidgetWalletCard } from './wallet/WidgetWalletCard';
import { WidgetWalletPortfolio } from './wallet/WidgetWalletPortfolio';
import { WidgetWalletTradeHistory } from './wallet/WidgetWalletTradeHistory';

const WidgetWalletSkeleton: React.FC = () => (
  <div className="flex flex-col w-full h-full overflow-hidden">
    {/* Card placeholder */}
    <div className="p-2 w-full flex justify-center">
      <div
        className="relative w-full h-[140px] animate-pulse"
        style={{
          borderRadius: 'var(--widget-radius)',
          border: '1px var(--widget-border-style) var(--widget-border)',
          backgroundColor: 'var(--widget-secondary)',
        }}
      />
    </div>
    {/* Portfolio rows */}
    <div className="px-2 flex flex-col gap-1.5 mt-1">
      {[80, 60, 72, 55, 65].map((w, i) => (
        <div key={i} className="flex items-center justify-between py-1.5">
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-full animate-pulse shrink-0"
              style={{ backgroundColor: 'var(--widget-secondary)' }}
            />
            <div
              className="h-3.5 animate-pulse"
              style={{ width: `${w}px`, backgroundColor: 'var(--widget-secondary)', borderRadius: '0.25rem' }}
            />
          </div>
          <div
            className="h-3.5 w-14 animate-pulse"
            style={{ backgroundColor: 'var(--widget-secondary)', opacity: 0.5, borderRadius: '0.25rem' }}
          />
        </div>
      ))}
    </div>
    {/* Sign out button placeholder */}
    <div className="mt-auto shrink-0 p-2" style={{ borderTop: '1px var(--widget-border-style) var(--widget-border)' }}>
      <div
        className="w-full animate-pulse"
        style={{
          height: '34px',
          backgroundColor: 'var(--widget-secondary)',
          opacity: 0.35,
          borderRadius: 'var(--widget-radius)',
        }}
      />
    </div>
  </div>
);

export const WidgetWalletPanel: React.FC = () => {
  const walletTab = useWidgetSwapUIStore((state) => state.walletTab);
  const [signOutHovered, setSignOutHovered] = useState(false);
  const { disconnect } = useDisconnect();
  const { setQuoteToken } = useSwapFormContext();

  const handleAssetSelect = useCallback(
    async (asset: Asset) => {
      await setQuoteToken(asset);
      useWidgetSwapUIStore.getState().setView('swap');
    },
    [setQuoteToken],
  );
  const {
    address,
    groupedAssets,
    totalBalance,
    balancesLoading,
    chains,
    getToken,
    useTokenWithLazyLoad,
    tokenRegistry,
  } = useWidgetWalletData(true);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>
          Connect your wallet to view your portfolio
        </p>
      </div>
    );
  }

  if (balancesLoading && walletTab === 'wallet') {
    return <WidgetWalletSkeleton />;
  }

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {walletTab === 'wallet' && (
          <>
            <WidgetWalletCard
              address={address}
              totalBalance={totalBalance}
              isLoading={balancesLoading}
            />
            <WidgetWalletPortfolio
              groupedAssets={groupedAssets}
              chains={chains}
              tokenRegistry={tokenRegistry}
              getToken={getToken}
              useTokenWithLazyLoad={useTokenWithLazyLoad}
              onAssetSelect={handleAssetSelect}
            />
          </>
        )}

        {walletTab === 'activity' && (
          <WidgetWalletTradeHistory isActive={walletTab === 'activity'} />
        )}
      </div>

      {/* Footer — sign out */}
      <div
        className="shrink-0 p-2"
        style={{ borderTop: '1px var(--widget-border-style) var(--widget-border)' }}
      >
        <button
          type="button"
          onClick={() => {
            disconnect();
            useWidgetSwapUIStore.getState().setView('swap');
          }}
          onMouseEnter={() => setSignOutHovered(true)}
          onMouseLeave={() => setSignOutHovered(false)}
          className="w-full py-2 text-xs font-sans uppercase cursor-pointer transition-colors"
          style={{
            backgroundColor: signOutHovered ? 'var(--widget-destructive)' : 'transparent',
            color: signOutHovered ? 'var(--widget-destructive-foreground)' : 'var(--widget-destructive)',
            border: '1px var(--widget-border-style) var(--widget-destructive)',
            borderRadius: 'var(--widget-radius)',
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};
