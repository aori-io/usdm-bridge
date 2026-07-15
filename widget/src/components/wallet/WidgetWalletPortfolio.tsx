'use client';

import type { Asset } from '../../internal/types';
import { getChainNames, isGasToken } from '../../internal/chainsConfig';
import ChainIcon from '../../internal/components/ChainIcon';

const usdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});
import React, { useCallback, useMemo, useState } from 'react';
import { WidgetWalletAssetItem } from './WidgetWalletAssetItem';

const CHAIN_NAMES = getChainNames();

interface WidgetWalletPortfolioProps {
  groupedAssets: Record<string, any[]>;
  chains?: Record<string, { chainId: number; name: string }>;
  tokenRegistry?: Array<{ address: string; chainId: number }>;
  getToken?: (chainId: number, address: string) => Asset | undefined;
  useTokenWithLazyLoad?: any;
  onAssetSelect?: (asset: Asset) => void;
}

export const WidgetWalletPortfolio: React.FC<WidgetWalletPortfolioProps> = ({
  groupedAssets,
  chains,
  tokenRegistry = [],
  getToken,
  useTokenWithLazyLoad,
  onAssetSelect,
}) => {
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());

  const getChainName = useCallback(
    (chainId: number): string => chains?.[chainId]?.name || CHAIN_NAMES[chainId] || `Chain ${chainId}`,
    [chains],
  );

  const registrySet = useMemo(() => {
    const s = new Set<string>();
    for (const t of tokenRegistry) {
      s.add(`${t.chainId}-${t.address.toLowerCase()}`);
    }
    return s;
  }, [tokenRegistry]);

  const calculateDollarizedBalance = useCallback((asset: any): number => {
    if (asset.decimals === undefined || !asset.assetInfo?.price) return 0;
    return (parseFloat(asset.amount) / 10 ** asset.decimals) * asset.assetInfo.price;
  }, []);

  const { filteredGroupedAssets, chainTotals } = useMemo(() => {
    const entries = Object.entries(groupedAssets)
      .map(([chainId, assets]) => {
        const filtered = assets.filter((asset) => {
          if (!asset.assetInfo) return false;
          if (isGasToken(asset.assetInfo)) return true;
          if (registrySet.size > 0) {
            return registrySet.has(
              `${asset.assetInfo.chainId}-${asset.assetInfo.address?.toLowerCase() ?? ''}`,
            );
          }
          return true;
        });
        return [chainId, filtered] as [string, any[]];
      })
      .filter(([, assets]) => assets.length > 0);

    const totals: Record<string, number> = {};
    for (const [chainId, assets] of entries) {
      totals[chainId] = assets.reduce((sum, asset) => sum + calculateDollarizedBalance(asset), 0);
    }

    const sorted = [...entries].sort((a, b) => (totals[b[0]] ?? 0) - (totals[a[0]] ?? 0));
    return { filteredGroupedAssets: sorted, chainTotals: totals };
  }, [groupedAssets, registrySet, calculateDollarizedBalance]);

  const toggleChain = useCallback((chainId: string) => {
    setExpandedChains((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId);
      else next.add(chainId);
      return next;
    });
  }, []);

  const formatUSD = (v: number) => usdFormat.format(v);

  if (filteredGroupedAssets.length === 0) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>
          No token balances found
        </p>
      </div>
    );
  }

  return (
    <div className="pb-2 pt-1">
      {filteredGroupedAssets.map(([chainId, assets]) => {
        const chainIdNum = parseInt(chainId);
        const chainName = getChainName(chainIdNum);
        const totalChainValue = chainTotals[chainId] || 0;
        const isExpanded = expandedChains.has(chainId);

        return (
          <div
            key={chainId}
            className="mx-2 mb-2"
            style={{
              border: '1px var(--widget-border-style) var(--widget-border)',
              borderRadius: 'var(--widget-radius)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => toggleChain(chainId)}
              className="flex w-full flex-row items-center justify-between p-2 cursor-pointer transition-colors hover:bg-(--widget-secondary)"
              style={{ backgroundColor: 'transparent' }}
            >
              <div className="inline-flex flex-row items-center gap-2">
                <ChainIcon chain={chainIdNum} size="sm" />
                <p className="text-sm font-medium capitalize" style={{ color: 'var(--widget-foreground)' }}>
                  {chainName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--widget-foreground)' }}>
                  {formatUSD(totalChainValue)}
                </p>
                <span
                  className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--widget-muted-foreground)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 4.5L6 8L9.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </button>

            <div
              className={`overflow-hidden transition-all duration-200 ease-out ${
                isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div style={{ borderTop: '1px var(--widget-border-style) var(--widget-border)' }}>
                {assets.map((asset) => {
                  if (!asset.assetInfo) return null;
                  return (
                    <WidgetWalletAssetItem
                      key={`${asset.assetInfo.chainId}-${asset.token}`}
                      asset={asset.assetInfo}
                      balanceAmount={asset.amount}
                      balanceDecimals={asset.decimals}
                      price={asset.assetInfo?.price ?? null}
                      onSelect={onAssetSelect}
                      getToken={getToken}
                      useTokenWithLazyLoad={useTokenWithLazyLoad}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
