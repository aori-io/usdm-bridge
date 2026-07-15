import type { VenueId } from 'usdm-bridge-sdk';
import type { WidgetTheme } from '../theme/types';

export interface AoriSwapWidgetConfig {
  apiKey?: string;
  /** Base URL for the Aori API. Use a relative path (e.g. '/api/aori') to proxy
   * through your server and keep the API key off the client. */
  aoriApiBaseUrl?: string;
  walletConnectProjectId?: string;
  rpcOverrides?: Partial<Record<number, string | string[]>>;

  /**
   * Single-venue override. Defaults to `'aori'` (unchanged behavior). Set to a
   * non-Aori venue (e.g. `'relay'`) to route all quotes/execution through that
   * venue only. Ignored when `aggregator.enabled` is true.
   */
  venue?: VenueId;

  /**
   * Aggregator mode — request quotes from multiple venues and let the end user
   * pick the best one. Disabled by default (Aori-only, exactly as before).
   */
  aggregator?: {
    enabled?: boolean;
    /** Venues to aggregate across. Defaults to `['aori', 'relay']` when a Relay config is present. */
    venues?: VenueId[];
  };

  /** Per-venue configuration (additive; omit for Aori-only behavior). */
  venues?: {
    /** Relay venue config. Set `apiBaseUrl` to a server proxy to keep the key off the client. */
    relay?: { apiBaseUrl?: string; apiKey?: string };
  };

  theme: {
    mode: 'light' | 'dark';
    light?: WidgetTheme;
    dark?: WidgetTheme;
  };
  tokens?: {
    defaultBase?: { chainId: number; address: string };
    defaultQuote?: { chainId: number; address: string };
    lockBase?: boolean;
    lockQuote?: boolean;
    enabledChains?: number[];
    disableInverting?: boolean;
    supportedInputTokens?: Array<{ chainId: number; address: string }>;
    supportedOutputTokens?: Array<{ chainId: number; address: string }>;
    /** Tokens to hide from the input/base side asset selection menu. Applied after `supportedInputTokens` whitelist. Flips with `supportedInputTokens` on invert. */
    unsupportedInputTokens?: Array<{ chainId: number; address: string }>;
    /** Tokens to hide from the output/quote side asset selection menu. Applied after `supportedOutputTokens` whitelist. Flips with `supportedOutputTokens` on invert. */
    unsupportedOutputTokens?: Array<{ chainId: number; address: string }>;
    supportedInputChains?: number[];
    supportedOutputChains?: number[];
    inputSelectionSearch?: boolean;
    outputSelectionSearch?: boolean;
    showInputSelectionTokenBalances?: boolean;
    showOutputSelectionTokenBalances?: boolean;
    prioritizedInputTokens?: Array<{ chainId: number; address: string }>;
    prioritizedInputChains?: number[];
  };
  appearance?: {
    widgetType?: 'default' | 'compact' | 'horizontal' | 'split';
    tokenDisplay?: 'default' | 'pill' | 'ghost';
    tokenBadgeOrientation?: 'left' | 'right';
    assetMenuVariant?: 'default' | 'split';
    amountInputVariant?: 'default' | 'normal';
    hideAmountInputSymbol?: boolean;
    swapButtonVariant?: 'default' | 'outline' | 'ghost';
    swapHeaderVariant?: 'default' | 'none';
    quoteLoaderVariant?: 'default' | 'expanded' | 'none';
    fillContainer?: boolean;
    hideBorder?: boolean;
    walletButtonEnabled?: boolean;
  };
  settings?: {
    defaultSlippage?: number;
  };
  integrator?: {
    id?: number;
    feeRecipient?: string;
    feeAmount?: number;
  };
  walletScreening?: {
    /** Master toggle. Default: true (screening enabled). Set false to disable all checks. */
    enabled?: boolean;
    /** Use the free Chainalysis Sanctions Oracle on-chain (OFAC SDN). Default: true. */
    useChainalysisOracle?: boolean;
    /** URL of an integrator-provided screening endpoint. Widget sends GET ?address=0x... and expects { allowed: boolean }. */
    screeningUrl?: string;
    /** Blacklist — static array of addresses or async function. Checked before Layer 1/2. */
    blacklist?: string[] | ((address: string) => boolean | Promise<boolean>);
  };
}
