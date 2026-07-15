'use client';

import { useMemo } from 'react';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useWidgetSwapUIStore } from '../stores/swapUIStore';

/**
 * Returns supported token/chain lists that swap based on whether the widget
 * has been inverted. When `isInverted` is true, the configured input lists
 * become the output lists and vice-versa. This lets integrators define two
 * asymmetric token sets (e.g. stables vs a single token) that follow
 * the invert button rather than staying pinned to a fixed side.
 */
export function useEffectiveTokenConfig() {
  const {
    supportedInputTokens,
    supportedOutputTokens,
    unsupportedInputTokens,
    unsupportedOutputTokens,
    supportedInputChains,
    supportedOutputChains,
    prioritizedInputTokens,
    prioritizedInputChains,
  } = useWidgetConfig();
  const isInverted = useWidgetSwapUIStore((s) => s.isInverted);

  return useMemo(
    () => ({
      effectiveInputTokens: isInverted ? supportedOutputTokens : supportedInputTokens,
      effectiveOutputTokens: isInverted ? supportedInputTokens : supportedOutputTokens,
      effectiveUnsupportedInputTokens: isInverted ? unsupportedOutputTokens : unsupportedInputTokens,
      effectiveUnsupportedOutputTokens: isInverted ? unsupportedInputTokens : unsupportedOutputTokens,
      effectiveInputChains: isInverted ? supportedOutputChains : supportedInputChains,
      effectiveOutputChains: isInverted ? supportedInputChains : supportedOutputChains,
      effectivePrioritizedInputTokens: isInverted ? [] : prioritizedInputTokens,
      effectivePrioritizedInputChains: isInverted ? [] : prioritizedInputChains,
    }),
    [
      isInverted,
      supportedInputTokens,
      supportedOutputTokens,
      unsupportedInputTokens,
      unsupportedOutputTokens,
      supportedInputChains,
      supportedOutputChains,
      prioritizedInputTokens,
      prioritizedInputChains,
    ],
  );
}
