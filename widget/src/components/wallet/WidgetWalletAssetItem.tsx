'use client';

import { TokenImage, isGasToken, type Asset } from '../../internal';
import React, { useState } from 'react';

interface WidgetWalletAssetItemProps {
  asset: Asset;
  balanceAmount: string;
  balanceDecimals: number;
  price: number | null | undefined;
  onSelect?: (asset: Asset) => void;
  getToken?: (chainId: number, address: string) => Asset | undefined;
  useTokenWithLazyLoad?: (
    chainId: number | undefined,
    address: string | undefined,
  ) => { token: Asset | undefined; isLoading: boolean; isError: boolean };
}

export const WidgetWalletAssetItem: React.FC<WidgetWalletAssetItemProps> = ({
  asset,
  balanceAmount,
  balanceDecimals,
  price,
  onSelect,
  getToken,
  useTokenWithLazyLoad,
}) => {
  const [hovered, setHovered] = useState(false);

  const balance =
    balanceDecimals !== undefined ? parseFloat(balanceAmount) / 10 ** balanceDecimals : 0;

  const lazyLoadResult = useTokenWithLazyLoad?.(asset.chainId, asset.address);
  const lazyToken = lazyLoadResult?.token;

  let finalPrice: number | null = price ?? null;
  if (isGasToken(asset) && finalPrice == null) {
    if (lazyToken?.price != null) {
      finalPrice = lazyToken.price;
    } else if (getToken) {
      finalPrice = getToken(asset.chainId, asset.address)?.price ?? null;
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex h-[52px] w-full flex-row items-center p-3 cursor-pointer transition-colors"
      style={{
        borderBottom: '1px var(--widget-border-style) var(--widget-border)',
        backgroundColor: hovered ? 'var(--widget-secondary)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect?.(asset)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(asset); } }}
    >
      <div className="flex h-full w-full flex-row items-center justify-between">
        <div className="flex h-full flex-row items-center gap-2">
          <TokenImage asset={asset} size="sm" />
          <div className="flex flex-col items-start">
            <p className="text-sm font-medium uppercase" style={{ color: 'var(--widget-foreground)' }}>
              {asset.symbol}
            </p>
            {balance > 0 && (
              <p className="font-sans text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
                {balance.toFixed(4)}
              </p>
            )}
          </div>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--widget-foreground)' }}>
          {finalPrice != null ? `$${(finalPrice * balance).toFixed(2)}` : '—'}
        </p>
      </div>
    </div>
  );
};
