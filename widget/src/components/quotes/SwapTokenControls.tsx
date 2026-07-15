'use client';

import React from 'react';
import type { Asset } from '../../internal';
import AssetAmountInput from '../AssetAmountInput';
import AssetSelection from '../AssetSelection';

interface SwapTokenControlsProps {
  side: 'base' | 'quote';
  asset: Asset | null | undefined;
  otherAsset: Asset | null | undefined;
  toggle: () => void;
  isPlacingOrder: boolean;
  /** Disables selection (config lock or single-token list). */
  locked: boolean;
  /** Hides the dropdown chevron (single-token list). */
  hideDropdown: boolean;
  isOverlayToken: boolean;
  isCompactMode: boolean;
  tokenBadgeOrientation: 'left' | 'right';
  isWrappingPair: boolean;
  isUnwrappingPair: boolean;
}

/**
 * Presentational token control block (asset selector + amount input) with the
 * exact `tokenDisplay` (`pill`/`ghost` overlay vs default), compact, and badge
 * orientation variants used by the classic swap forms. Extracted so the
 * aggregator forms render identical token UI without duplicating the markup.
 */
export const SwapTokenControls: React.FC<SwapTokenControlsProps> = ({
  side,
  asset,
  otherAsset,
  toggle,
  isPlacingOrder,
  locked,
  hideDropdown,
  isOverlayToken,
  isCompactMode,
  tokenBadgeOrientation,
  isWrappingPair,
  isUnwrappingPair,
}) => {
  const selection = (
    <AssetSelection
      toggle={toggle}
      side={side}
      asset={asset}
      isPlacingOrder={isPlacingOrder || locked}
      hideDropdown={hideDropdown}
    />
  );
  const amount = (
    <AssetAmountInput
      side={side}
      asset={asset ?? null}
      otherAsset={otherAsset ?? null}
      isPlacingOrder={isPlacingOrder}
      isWrappingPair={isWrappingPair}
      isUnwrappingPair={isUnwrappingPair}
    />
  );

  if (isOverlayToken) {
    if (isCompactMode) {
      return (
        <div className={`flex items-center gap-2 ${tokenBadgeOrientation === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
          {selection}
          <div className="flex-1 min-w-0">{amount}</div>
        </div>
      );
    }
    return (
      <div className={`flex flex-col ${tokenBadgeOrientation === 'right' ? 'items-end' : 'items-start'}`}>
        {selection}
        {amount}
      </div>
    );
  }

  return (
    <>
      {selection}
      {amount}
    </>
  );
};

export default SwapTokenControls;
