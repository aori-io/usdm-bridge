'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useWalletState } from '../../wallet/useWalletState';
import { useWidgetOrderHistory } from '../../hooks/useWidgetOrderHistory';
import { WidgetWalletTradeItem } from './WidgetWalletTradeItem';

const TradeSkeleton: React.FC = () => (
  <div
    className="mt-2 flex flex-col"
    style={{
      height: '4rem',
      border: '1px var(--widget-border-style) var(--widget-border)',
      backgroundColor: 'var(--widget-secondary)',
    }}
  >
    <div className="flex items-center space-x-2 p-2">
      <div className="h-4 w-4 rounded" style={{ backgroundColor: 'var(--widget-muted)' }} />
      <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--widget-muted)' }} />
    </div>
    <div className="flex h-8 w-full items-center justify-between px-4">
      <div className="flex items-center space-x-1">
        {[4, 16, 10, 4, 16, 10].map((w, i) => (
          <div key={i} className="h-3 rounded" style={{ width: `${w * 4}px`, backgroundColor: 'var(--widget-muted)' }} />
        ))}
      </div>
      <div className="h-3 w-10 rounded" style={{ backgroundColor: 'var(--widget-muted)' }} />
    </div>
  </div>
);

interface WidgetWalletTradeHistoryProps {
  isActive: boolean;
}

export const WidgetWalletTradeHistory: React.FC<WidgetWalletTradeHistoryProps> = ({ isActive }) => {
  const { address: userAddress } = useWalletState();
  const { orders, isLoading, error, hasMore, loadMore } = useWidgetOrderHistory(userAddress, isActive);

  const [isFetching, setIsFetching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(
    async (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const isNearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 100;
      if (isNearBottom && !isLoading && !isFetching && hasMore) {
        setIsFetching(true);
        try {
          await loadMore();
        } finally {
          setIsFetching(false);
        }
      }
    },
    [isLoading, isFetching, hasMore, loadMore],
  );

  if (!userAddress) {
    return (
      <div className="flex items-center justify-center p-4">
        <p className="text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>
          Connect your wallet to view activity
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-4">
        <p className="text-sm" style={{ color: 'var(--widget-destructive)' }}>
          Error loading activity
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex flex-col flex-1 min-h-0 overflow-y-auto p-2"
      onScroll={handleScroll}
      style={{ backgroundColor: 'transparent' }}
    >
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => <TradeSkeleton key={i} />)
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full p-6">
          <p className="text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>
            No Activity
          </p>
        </div>
      ) : (
        <>
          {orders.map((order) => (
            <WidgetWalletTradeItem
              key={order.orderHash}
              order={order}
              baseToken={order.enrichedTokens?.base ?? null}
              quoteToken={order.enrichedTokens?.quote ?? null}
            />
          ))}
          {isFetching && <TradeSkeleton />}
        </>
      )}
    </div>
  );
};
