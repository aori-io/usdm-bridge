'use client';

import { ChainIcon, DropdownIcon, TokenImage, type Asset, formatNumber } from '../internal';
import React from 'react';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useSwapFormContext } from '../providers/SwapFormProvider';

interface AssetSelectionProps {
  toggle: () => void;
  side: 'base' | 'quote';
  asset: Asset | null;
  isPlacingOrder: boolean;
  hideDropdown?: boolean;
}

const AssetSelection: React.FC<AssetSelectionProps> = ({
  toggle,
  side,
  asset,
  isPlacingOrder,
  hideDropdown,
}) => {
  const { baseBalance, quoteBalance } = useSwapFormContext();
  const { tokenDisplay, tokenBadgeOrientation, widgetType } = useWidgetConfig();
  const isCompactMode = widgetType === 'compact';
  const cardHeight = isCompactMode ? 'h-10' : 'h-13';
  const iconSize = isCompactMode ? 'h-10 w-10' : 'h-13 w-13';

  const userBalance =
    side === 'base'
      ? baseBalance.formatted
        ? (() => {
            const value = parseFloat(baseBalance.formatted);
            return value >= 10_000 ? formatNumber(value) : value.toFixed(4);
          })()
        : undefined
      : quoteBalance.formatted
        ? (() => {
            const value = parseFloat(quoteBalance.formatted);
            return value >= 10_000 ? formatNumber(value) : value.toFixed(4);
          })()
        : undefined;

  const sharedProps = {
    role: 'button' as const,
    tabIndex: isPlacingOrder ? -1 : 0,
    'aria-disabled': isPlacingOrder,
    'aria-label': `Select ${side === 'base' ? 'input' : 'output'} token${asset ? `: ${asset.symbol}` : ''}`,
    onClick: !isPlacingOrder ? toggle : undefined,
    onKeyDown: !isPlacingOrder
      ? (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }
      : undefined,
  };

  // ── PILL variant ─────────────────────────────────────────────────────────
  if (tokenDisplay === 'pill') {
    const isRight = tokenBadgeOrientation === 'right';
    return (
      <div
        {...sharedProps}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full cursor-pointer transition-colors ${isRight ? 'ml-auto' : ''}`}
        style={{
          border: '1px solid var(--widget-border)',
          backgroundColor: 'var(--widget-secondary)',
          color: 'var(--widget-secondary-foreground)',
        }}
      >
        {asset ? (
          <>
            <ChainIcon chain={asset.chainId} size="xs" />
            <TokenImage
              className="rounded-full"
              asset={asset}
              size="xxs"
              noChain
            />
            <span className="text-xs font-thin uppercase">
              {asset.symbol}
            </span>
            {!hideDropdown && (
              <DropdownIcon
                className="w-1.5 opacity-60"
                style={{ color: 'var(--widget-secondary-foreground)' }}
              />
            )}
          </>
        ) : (
          <>
            <span className="text-xs opacity-70">Select</span>
            {!hideDropdown && (
              <DropdownIcon
                className="w-1.5 opacity-60"
                style={{ color: 'var(--widget-secondary-foreground)' }}
              />
            )}
          </>
        )}
      </div>
    );
  }

  // ── GHOST variant ─────────────────────────────────────────────────────────
  if (tokenDisplay === 'ghost') {
    return (
      <div
        {...sharedProps}
        className="inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-70 py-1"
        style={{ color: 'var(--widget-foreground)' }}
      >
        {asset ? (
          <>
            <ChainIcon chain={asset.chainId} size="xs" />
            <TokenImage
              className="rounded-full"
              asset={asset}
              size="xxs"
              noChain
            />
            <span className="text-sm font-thin uppercase">
              {asset.symbol}
            </span>
          </>
        ) : (
          <span
            className="text-sm"
            style={{ color: 'var(--widget-muted-foreground)' }}
          >
            Select token
          </span>
        )}
        {!hideDropdown && <DropdownIcon className="w-1.5 opacity-50" />}
      </div>
    );
  }

  // ── CARD/default variant ────────────────────────────────────────────────
  return (
    <div
      {...sharedProps}
      className={`relative ${cardHeight} w-full cursor-pointer text-xl duration-100 ease-linear`}
      style={{
        border: '1px solid var(--widget-border)',
        backgroundColor: 'var(--widget-secondary)',
        borderTopLeftRadius: '9999px',
        borderBottomLeftRadius: '9999px',
        borderTopRightRadius: 'var(--widget-radius)',
        borderBottomRightRadius: 'var(--widget-radius)',
      }}
    >
      <div className="relative flex h-full w-full flex-row items-center">
        {asset ? (
          <div className="relative flex h-full w-full flex-row items-center">
            <div
              className={`${iconSize} pl-px flex items-center justify-center`}
            >
              <TokenImage className="rounded-full" asset={asset} size="lg" />
            </div>
            <div className="flex h-full w-full flex-row items-center justify-between pl-2.5 pr-7">
              <div className="flex h-full flex-col justify-center gap-0.5">
                <p
                  className="text-base font-thin uppercase"
                  style={{ color: 'var(--widget-secondary-foreground)' }}
                >
                  {asset.symbol}
                </p>
                <span
                  className="text-xs font-sans"
                  style={{
                    color: 'var(--widget-muted-foreground)',
                  }}
                >
                  {asset.address?.slice(0, 6)}...{asset.address?.slice(-4)}
                </span>
              </div>
              {userBalance !== undefined && (
                <div className="flex flex-col text-right">
                  <p
                    className="text-2xs"
                    style={{
                      color: 'var(--widget-muted-foreground)',
                    }}
                  >
                    Balance
                  </p>
                  <span
                    className="font-sans text-xs tabular-nums"
                    style={{ color: 'var(--widget-foreground)', opacity: 0.5 }}
                  >
                    {userBalance}
                  </span>
                </div>
              )}
            </div>
            {!hideDropdown && (
              <DropdownIcon
                className="absolute right-3 top-1/2 w-1.5 translate-y-[-50%]"
                style={{
                  color: 'var(--widget-secondary-foreground)',
                  opacity: 0.6,
                }}
              />
            )}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span
              className="text-sm"
              style={{
                color: 'var(--widget-secondary-foreground)',
                opacity: 0.7,
              }}
            >
              Select token
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetSelection;
