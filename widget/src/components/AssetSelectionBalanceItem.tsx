'use client';

import {
  TokenImage,
  useTokenWithLazyLoad,
  type Asset,
  calculateDollarizedBalance,
  isGasToken,
} from '../internal';
import React from 'react';

interface AssetSelectionBalanceItemProps {
  asset: {
    assetInfo?: Asset | null;
    balance: string;
    decimals: number;
    chainId: number;
    address: string;
  };
  otherAsset: Asset;
  handleFormSelection: (asset: Asset, otherAsset: Asset) => void;
  getToken: (chainId: number, address: string) => Asset | undefined;
  showOneToOne?: boolean;
}

export const AssetSelectionBalanceItem = React.memo<AssetSelectionBalanceItemProps>(
  ({ asset, otherAsset, handleFormSelection, getToken, showOneToOne }) => {
    const { token: lazyToken } = useTokenWithLazyLoad(asset.chainId, asset.address);
    const cachedToken = getToken(asset.chainId, asset.address);
    const token = lazyToken || cachedToken || asset.assetInfo;

    if (!token) return null;

    const hasPrice = token.price != null;
    const dollarValue =
      hasPrice && asset.decimals !== undefined
        ? calculateDollarizedBalance(token, asset.balance, asset.decimals)
        : null;

    return (
      <button
        key={`${token.chainId}-${token.address}`}
        type="button"
        className="w-full flex items-center justify-between p-3 cursor-pointer"
        style={{ borderBottom: '1px solid var(--widget-border)' }}
        onClick={() => handleFormSelection(token, otherAsset)}
      >
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <TokenImage asset={token} size="sm" className="flex-shrink-0" />
          <div className="flex flex-col items-start min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-thin" style={{ color: 'var(--widget-secondary-foreground)' }}>
              {token.symbol.length > 20 ? `${token.symbol.substring(0, 20)}...` : token.symbol}
              {showOneToOne && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 text-2xs font-bold uppercase shrink-0"
                  style={{ backgroundColor: 'var(--widget-primary)', color: 'var(--widget-primary-foreground)', borderRadius: '4px', lineHeight: 1 }}
                >
                  1:1
                </span>
              )}
            </span>
            <span className="text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
              {token.name.length > 20 ? `${token.name.substring(0, 20)}...` : token.name}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end text-right flex-shrink-0">
          <span className="text-xs font-sans" style={{ color: 'var(--widget-muted-foreground)'}}>Balance:</span>
          <span className="text-xs font-sans" style={{ color: 'var(--widget-foreground)', opacity: 0.5 }}>
            {dollarValue != null ? `$${dollarValue.toFixed(2)}` : '—'}
          </span>
        </div>
      </button>
    );
  },
  (prevProps, nextProps) =>
    prevProps.asset.address === nextProps.asset.address &&
    prevProps.asset.chainId === nextProps.asset.chainId &&
    prevProps.asset.balance === nextProps.asset.balance &&
    prevProps.asset.assetInfo?.price === nextProps.asset.assetInfo?.price &&
    prevProps.otherAsset.address === nextProps.otherAsset.address &&
    prevProps.showOneToOne === nextProps.showOneToOne,
);

AssetSelectionBalanceItem.displayName = 'AssetSelectionBalanceItem';
