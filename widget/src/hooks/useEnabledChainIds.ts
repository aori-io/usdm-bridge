'use client';

import { useChainData } from '../internal';
import { useMemo } from 'react';
import { useWidgetConfig } from '../context/WidgetConfigContext';

/**
 * Returns the intersection of:
 * - The chains the widget integrator has enabled (via `enabledChains` prop)
 * - The chains the Aori backend actually supports (`useChainData().availableChainIds`)
 * - When BOTH `supportedInputTokens` AND `supportedOutputTokens` are set, only chains that have whitelisted tokens
 *
 * When only one side has supported tokens, falls through to `enabledChains` so the
 * unconstrained side isn't starved of chains. Per-side filtering in AssetSelectionMenu
 * handles constraining each side independently.
 */
export function useEnabledChainIds(): number[] {
  const { availableChainIds } = useChainData();
  const { enabledChains, supportedInputTokens, supportedOutputTokens } = useWidgetConfig();

  return useMemo(() => {
    let chains = availableChainIds;

    const hasInputTokens = supportedInputTokens.length > 0;
    const hasOutputTokens = supportedOutputTokens.length > 0;

    if (hasInputTokens && hasOutputTokens) {
      const tokenChainIds = new Set([
        ...supportedInputTokens.map((t) => t.chainId),
        ...supportedOutputTokens.map((t) => t.chainId),
      ]);
      chains = chains.filter((id) => tokenChainIds.has(id));
    } else if (enabledChains.length > 0) {
      chains = chains.filter((id) => enabledChains.includes(id));
    }

    return chains;
  }, [availableChainIds, enabledChains, supportedInputTokens, supportedOutputTokens]);
}
