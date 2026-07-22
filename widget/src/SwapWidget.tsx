'use client';

import type { Asset } from './internal';
import React, { type ReactNode, useMemo } from 'react';
import type { AoriSwapWidgetConfig } from './config/types';
import { SwapContainer } from './components/SwapContainer';
import { WidgetConfigContext } from './context/WidgetConfigContext';
import { useWidgetSwapUIStore } from './stores/swapUIStore';

import { WidgetThemeProvider } from './theme/ThemeContext';
import {
  type WidgetTheme,
  defaultDarkTheme,
  defaultLightTheme,
  themeToCSS,
} from './theme/types';
import { AoriClientProvider } from './internal';
import {
  setApiKey,
  setRpcOverrides,
  setAoriApiBaseUrl,
  setVenuesConfig,
  setAggregationConfig,
  setTokenSourcesConfig,
} from './internal/environment';
import { buildSdkVenuesConfig, isAggregatorActive, resolveAggregatorVenues } from './config/aggregator';
import { WalletModalContext } from './wallet/WalletModalContext';
import { WalletScreeningProvider } from './context/WalletScreeningContext';

const EMPTY_CHAINS: number[] = [];
const EMPTY_SUPPORTED_INPUT_TOKENS: Array<{ chainId: number; address: string }> = [];
const EMPTY_SUPPORTED_OUTPUT_TOKENS: Array<{ chainId: number; address: string }> = [];
const EMPTY_UNSUPPORTED_INPUT_TOKENS: Array<{ chainId: number; address: string }> = [];
const EMPTY_UNSUPPORTED_OUTPUT_TOKENS: Array<{ chainId: number; address: string }> = [];
const EMPTY_SUPPORTED_CHAINS: number[] = [];
const EMPTY_PRIORITIZED_INPUT_TOKENS: Array<{ chainId: number; address: string }> = [];
const EMPTY_PRIORITIZED_INPUT_CHAINS: number[] = [];

const WIDGET_CRITICAL_CSS = `
.aori-widget .text-2xs { font-size: 0.75rem; }
.aori-widget .text-3xs { font-size: 0.68rem; }
.aori-widget ::-webkit-scrollbar { width: 0px; height: 0px; display: none; }
.aori-widget * { scrollbar-width: none; }
.aori-widget input:focus, .aori-widget input:focus-visible,
.aori-widget button:focus, .aori-widget button:focus-visible,
.aori-widget select:focus, .aori-widget select:focus-visible { outline: none; }
`;

class WidgetErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--widget-foreground, #888)', fontFamily: 'system-ui, sans-serif' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem' }}>Something went wrong.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{
              padding: '0.375rem 1rem',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              border: '1px solid currentColor',
              borderRadius: '0.25rem',
              background: 'transparent',
              color: 'inherit',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface SwapWidgetProps {
  config: AoriSwapWidgetConfig;
  className?: string;
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapComplete?: (data: import('./lib/parseExplorerHash').SwapCompleteData) => void;
  onBaseTokenChange?: (token: Asset) => void;
  onQuoteTokenChange?: (token: Asset) => void;
  onBlockedWallet?: (data: { address: string; allowed: boolean; source?: 'blacklist' | 'chainalysis-oracle' | 'screening-url' }) => void;
  onRequestConnect?: () => void;
  onRequestAccount?: () => void;
  customWalletUI?: 'builtin' | 'none' | 'provider';
}

function resolveTheme(cfg: AoriSwapWidgetConfig): WidgetTheme {
  const base = cfg.theme.mode === 'light' ? defaultLightTheme : defaultDarkTheme;
  const override = cfg.theme.mode === 'light' ? cfg.theme.light : cfg.theme.dark;
  return override ? { ...base, ...override } : base;
}

export function SwapWidget({
  config,
  className,
  onSwapSubmitted,
  onSwapComplete,
  onBaseTokenChange,
  onQuoteTokenChange,
  onBlockedWallet,
  onRequestConnect,
  onRequestAccount,
  customWalletUI = 'builtin',
}: SwapWidgetProps) {
  // Synchronous so every fetch (including initial token/chain queries) picks up
  // the overrides before any React Query hooks fire.
  setApiKey(config.apiKey);
  setRpcOverrides(config.rpcOverrides);
  setAoriApiBaseUrl(config.aoriApiBaseUrl);
  setVenuesConfig(buildSdkVenuesConfig(config));
  setAggregationConfig(undefined);
  setTokenSourcesConfig(
    config.tokens?.sources ||
      config.tokens?.sourcePriority ||
      config.tokens?.replaceVenueTokens != null
      ? {
          ...(config.tokens?.sources ? { sources: config.tokens.sources } : {}),
          ...(config.tokens?.sourcePriority ? { sourcePriority: config.tokens.sourcePriority } : {}),
          ...(config.tokens?.replaceVenueTokens != null
            ? { replaceVenueTokens: config.tokens.replaceVenueTokens }
            : {}),
        }
      : undefined,
  );

  const aggregatorEnabled = isAggregatorActive(config);
  const aggregatorVenuesKey = resolveAggregatorVenues(config).join(',');

  const theme = resolveTheme(config);
  const widgetType = config.appearance?.widgetType ?? 'default';
  const tokenDisplay = config.appearance?.tokenDisplay ?? 'default';
  const tokenBadgeOrientation = config.appearance?.tokenBadgeOrientation ?? 'left';
  const assetMenuVariant = config.appearance?.assetMenuVariant ?? 'default';
  const amountInputVariant = config.appearance?.amountInputVariant ?? 'default';
  const hideAmountInputSymbol = config.appearance?.hideAmountInputSymbol ?? false;
  const swapButtonVariant = config.appearance?.swapButtonVariant ?? 'default';
  const swapHeaderVariant = config.appearance?.swapHeaderVariant ?? 'default';
  const quoteLoaderVariant = config.appearance?.quoteLoaderVariant ?? 'default';
  const walletButtonEnabled = config.appearance?.walletButtonEnabled ?? true;
  const fillContainer = config.appearance?.fillContainer ?? false;
  const hideBorder = config.appearance?.hideBorder ?? false;
  const cssVars = themeToCSS(theme);

  // For default/compact with split menu, the outer div becomes a transparent flex-row
  // wrapper (no card styling) and expands to hold both the form card and selection card.
  // The card styling is applied to each individual card inside SwapContainer.
  const isSplitSideBySide =
    assetMenuVariant === 'split' &&
    (widgetType === 'default' || widgetType === 'compact');

  const isSelectionOpen = useWidgetSwapUIStore(
    (s) =>
      s.view === 'baseSelection' ||
      s.view === 'quoteSelection' ||
      s.view === 'baseChainSelection' ||
      s.view === 'quoteChainSelection',
  );

  const cardWidth = widgetType === 'compact' ? '22rem' : '24rem';
  const expandedMaxWidth = widgetType === 'compact' ? '46rem' : '49rem';

  const widgetDimensions: React.CSSProperties = isSplitSideBySide
    ? {
        maxWidth: isSelectionOpen ? expandedMaxWidth : cardWidth,
        transition: 'max-width 0.3s ease',
        height: 'auto',
        overflow: 'visible',
        display: 'flex',
        gap: '1rem',
        alignItems: 'stretch',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: 0,
        boxShadow: 'none',
        padding: 0,
      }
    : {
        width: '100%',
        ...(fillContainer
          ? {}
          : {
              maxWidth:
                widgetType === 'split'
                  ? '48rem'
                  : widgetType === 'horizontal'
                    ? '48rem'
                    : widgetType === 'compact'
                      ? '22rem'
                      : '24rem',
            }),
        height: 'auto',
        overflow: 'hidden',
      };

  const cardStyles: React.CSSProperties = {
    boxSizing: 'border-box',
    backgroundColor: 'var(--widget-background)',
    color: 'var(--widget-foreground)',
    borderRadius: 'var(--widget-radius)',
    ...(hideBorder
      ? { border: 'none' }
      : {
          borderWidth: '1px',
          borderStyle: 'var(--widget-border-style)' as React.CSSProperties['borderStyle'],
          borderColor: 'var(--widget-border)',
        }),
    boxShadow:
      'var(--widget-shadow-offset-x) var(--widget-shadow-offset-y) var(--widget-shadow-blur) var(--widget-shadow-spread) color-mix(in srgb, var(--widget-shadow-color) calc(var(--widget-shadow-opacity) * 100%), transparent)',
    padding: '0.25rem 0.5rem',
    paddingTop: '0.25rem',
  };

  const enabledChains = config.tokens?.enabledChains ?? EMPTY_CHAINS;
  const supportedInputTokens = config.tokens?.supportedInputTokens ?? EMPTY_SUPPORTED_INPUT_TOKENS;
  const supportedOutputTokens = config.tokens?.supportedOutputTokens ?? EMPTY_SUPPORTED_OUTPUT_TOKENS;
  const unsupportedInputTokens = config.tokens?.unsupportedInputTokens ?? EMPTY_UNSUPPORTED_INPUT_TOKENS;
  const unsupportedOutputTokens = config.tokens?.unsupportedOutputTokens ?? EMPTY_UNSUPPORTED_OUTPUT_TOKENS;
  const supportedInputChains = config.tokens?.supportedInputChains ?? EMPTY_SUPPORTED_CHAINS;
  const supportedOutputChains = config.tokens?.supportedOutputChains ?? EMPTY_SUPPORTED_CHAINS;
  const prioritizedInputTokens = config.tokens?.prioritizedInputTokens ?? EMPTY_PRIORITIZED_INPUT_TOKENS;
  const prioritizedInputChains = config.tokens?.prioritizedInputChains ?? EMPTY_PRIORITIZED_INPUT_CHAINS;
  const inputSelectionSearch = config.tokens?.inputSelectionSearch ?? true;
  const outputSelectionSearch = config.tokens?.outputSelectionSearch ?? true;
  const showInputSelectionTokenBalances = config.tokens?.showInputSelectionTokenBalances ?? true;
  const showOutputSelectionTokenBalances = config.tokens?.showOutputSelectionTokenBalances ?? true;
  const lockBase = config.tokens?.lockBase ?? false;
  const lockQuote = config.tokens?.lockQuote ?? false;
  const disableInverting = config.tokens?.disableInverting ?? false;
  const defaultSlippage = config.settings?.defaultSlippage ?? 0.01;
  const hasConnectHandler = !!onRequestConnect;
  const aggregatorVenues = useMemo(
    () => aggregatorVenuesKey.split(',').filter(Boolean) as import('usdm-bridge-sdk').VenueId[],
    [aggregatorVenuesKey],
  );

  const widgetConfigValue = useMemo(
    () => ({
      apiKey: config.apiKey,
      web3ConnectionType: 'custom' as const,
      aggregatorEnabled,
      aggregatorVenues,
      enabledChains,
      supportedInputTokens,
      supportedOutputTokens,
      unsupportedInputTokens,
      unsupportedOutputTokens,
      supportedInputChains,
      supportedOutputChains,
      prioritizedInputTokens,
      prioritizedInputChains,
      inputSelectionSearch,
      outputSelectionSearch,
      showInputSelectionTokenBalances,
      showOutputSelectionTokenBalances,
      lockBase,
      lockQuote,
      disableInverting,
      defaultSlippage,
      widgetType,
      tokenDisplay,
      tokenBadgeOrientation,
      assetMenuVariant,
      amountInputVariant,
      hideAmountInputSymbol,
      swapButtonVariant,
      swapHeaderVariant,
      quoteLoaderVariant,
      walletButtonEnabled,
      hasConnectHandler,
      customWalletUI,
    }),
    [
      config.apiKey,
      aggregatorEnabled,
      aggregatorVenues,
      enabledChains,
      supportedInputTokens,
      supportedOutputTokens,
      unsupportedInputTokens,
      unsupportedOutputTokens,
      supportedInputChains,
      supportedOutputChains,
      prioritizedInputTokens,
      prioritizedInputChains,
      inputSelectionSearch,
      outputSelectionSearch,
      showInputSelectionTokenBalances,
      showOutputSelectionTokenBalances,
      lockBase,
      lockQuote,
      disableInverting,
      defaultSlippage,
      widgetType,
      tokenDisplay,
      tokenBadgeOrientation,
      assetMenuVariant,
      amountInputVariant,
      hideAmountInputSymbol,
      swapButtonVariant,
      swapHeaderVariant,
      quoteLoaderVariant,
      walletButtonEnabled,
      hasConnectHandler,
      customWalletUI,
    ],
  );

  const walletModalValue = useMemo(
    () =>
      onRequestConnect
        ? { openConnectModal: onRequestConnect, openAccountModal: onRequestAccount }
        : null,
    [onRequestConnect, onRequestAccount],
  );

  const inner = (
    <AoriClientProvider>
      <WalletScreeningProvider config={config.walletScreening} onBlockedWallet={onBlockedWallet}>
      <WidgetConfigContext.Provider value={widgetConfigValue}>
        <WidgetThemeProvider theme={theme}>
          <div
            className={`aori-widget${className ? ` ${className}` : ''}`}
            style={
              {
                ...cssVars,
                '--font-sans': 'var(--widget-font-sans)',
                '--font-mono': 'var(--widget-font-mono)',
                fontFamily: 'var(--widget-font-sans)',
                letterSpacing: 'var(--widget-letter-spacing)',
                width: '100%',
                ...widgetDimensions,
                position: 'relative',
                ...(isSplitSideBySide ? {} : cardStyles),
              } as React.CSSProperties
            }
          >
            <style dangerouslySetInnerHTML={{ __html: WIDGET_CRITICAL_CSS }} />
            <WidgetErrorBoundary>
              <SwapContainer
                onSwapSubmitted={onSwapSubmitted}
                onSwapComplete={onSwapComplete}
                defaultBaseToken={config.tokens?.defaultBase}
                defaultQuoteToken={config.tokens?.defaultQuote}
                onBaseTokenChange={onBaseTokenChange}
                onQuoteTokenChange={onQuoteTokenChange}
                cardStyles={isSplitSideBySide ? cardStyles : undefined}
                cardWidth={isSplitSideBySide ? cardWidth : undefined}
              />
            </WidgetErrorBoundary>
          </div>
        </WidgetThemeProvider>
      </WidgetConfigContext.Provider>
    </WalletScreeningProvider>
    </AoriClientProvider>
  );

  if (walletModalValue) {
    return (
      <WalletModalContext.Provider value={walletModalValue}>
        {inner}
      </WalletModalContext.Provider>
    );
  }

  return inner;
}
