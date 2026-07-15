'use client';

import type { VenueId } from 'usdm-bridge-sdk';
import { createContext, useContext, useMemo } from 'react';

export interface WidgetConfig {
  apiKey?: string;
  walletConnectProjectId?: string;
  web3ConnectionType: 'standalone' | 'custom';
  /** True when the multi-venue aggregator UI/flow should be used. */
  aggregatorEnabled: boolean;
  /** Ordered venues to quote across (used by the aggregator provider). */
  aggregatorVenues: VenueId[];
  enabledChains: number[];
  supportedInputTokens: Array<{ chainId: number; address: string }>;
  supportedOutputTokens: Array<{ chainId: number; address: string }>;
  unsupportedInputTokens: Array<{ chainId: number; address: string }>;
  unsupportedOutputTokens: Array<{ chainId: number; address: string }>;
  supportedInputChains: number[];
  supportedOutputChains: number[];
  prioritizedInputTokens: Array<{ chainId: number; address: string }>;
  prioritizedInputChains: number[];
  inputSelectionSearch: boolean;
  outputSelectionSearch: boolean;
  showInputSelectionTokenBalances: boolean;
  showOutputSelectionTokenBalances: boolean;
  lockBase: boolean;
  lockQuote: boolean;
  disableInverting: boolean;
  defaultSlippage: number;
  widgetType: 'default' | 'compact' | 'horizontal' | 'split';
  tokenDisplay: 'default' | 'pill' | 'ghost';
  tokenBadgeOrientation: 'left' | 'right';
  assetMenuVariant: 'default' | 'split';
  amountInputVariant: 'default' | 'normal';
  hideAmountInputSymbol: boolean;
  swapButtonVariant: 'default' | 'outline' | 'ghost';
  swapHeaderVariant: 'default' | 'none';
  quoteLoaderVariant: 'default' | 'expanded' | 'none';
  walletButtonEnabled: boolean;
  hasConnectHandler: boolean;
  customWalletUI: 'builtin' | 'none' | 'provider';
}

export const WidgetConfigContext = createContext<WidgetConfig>({
  apiKey: undefined,
  web3ConnectionType: 'custom',
  aggregatorEnabled: false,
  aggregatorVenues: ['aori'],
  enabledChains: [],
  supportedInputTokens: [],
  supportedOutputTokens: [],
  unsupportedInputTokens: [],
  unsupportedOutputTokens: [],
  supportedInputChains: [],
  supportedOutputChains: [],
  prioritizedInputTokens: [],
  prioritizedInputChains: [],
  inputSelectionSearch: true,
  outputSelectionSearch: true,
  showInputSelectionTokenBalances: true,
  showOutputSelectionTokenBalances: true,
  lockBase: false,
  lockQuote: false,
  disableInverting: false,
  defaultSlippage: 0.01,
  widgetType: 'default',
  tokenDisplay: 'default',
  tokenBadgeOrientation: 'left',
  assetMenuVariant: 'default',
  amountInputVariant: 'default',
  hideAmountInputSymbol: false,
  swapButtonVariant: 'default',
  swapHeaderVariant: 'default',
  quoteLoaderVariant: 'default',
  walletButtonEnabled: true,
  hasConnectHandler: false,
  customWalletUI: 'builtin',
});

export function useWidgetConfig(): WidgetConfig {
  const config = useContext(WidgetConfigContext);
  return useMemo(() => {
    if (config.widgetType === 'compact') {
      return { ...config, amountInputVariant: 'normal' as const };
    }
    return config;
  }, [config]);
}
