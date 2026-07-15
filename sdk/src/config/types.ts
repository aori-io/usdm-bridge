import type { WalletScreeningConfig } from '../screening/walletScreening';
import type { NormalizedQuote } from '../venues/types';

export interface TokenRef {
  chainId: number;
  address: string;
}

/**
 * Per-venue configuration. Additive: omit `venues` entirely and the SDK behaves
 * exactly as before (Aori-only).
 */
export interface VenuesConfig {
  /** Aori venue. Enabled by default. */
  aori?: { enabled?: boolean };
  /** Relay venue. Disabled unless present with `enabled !== false`. */
  relay?: {
    enabled?: boolean;
    /** Override the Relay API base URL (e.g. a relative proxy path like `/api/relay`). */
    apiBaseUrl?: string;
    /** Direct Relay API key. Omit and set `apiBaseUrl` to a proxy in production. */
    apiKey?: string;
  };
}

/** Aggregation tuning for `getQuotes` / `getBestQuote`. */
export interface AggregationConfig {
  /** Per-venue timeout (ms). Default ~7000. */
  perVenueTimeoutMs?: number;
  /** Overall soft deadline (ms). Default ~9000. */
  overallDeadlineMs?: number;
  /** Custom comparator for ranking quotes best-first. Default: gross output desc. */
  compareQuotes?: (a: NormalizedQuote, b: NormalizedQuote) => number;
}

export interface UsdmBridgeConfig {
  /** Direct Aori API key. Omit and set `aoriApiBaseUrl` to a server-side proxy in production. */
  apiKey?: string;
  /** Override the Aori API base URL (e.g. a relative proxy path like `/api/aori`). */
  aoriApiBaseUrl?: string;
  /** Per-chain RPC URL overrides used by SDK-side public clients (allowance reads, receipt waits, screening). */
  rpcOverrides?: Partial<Record<number, string | string[]>>;

  tokens?: {
    /** Optional default input (sell) token, surfaced via `sdk.config.tokens.defaultBase`. */
    defaultBase?: TokenRef;
    /** Optional default output (buy) token, surfaced via `sdk.config.tokens.defaultQuote`. */
    defaultQuote?: TokenRef;
    /** When set, `getQuote` rejects pairs whose input token is not in this list. */
    supportedInputTokens?: TokenRef[];
    /** When set, `getQuote` rejects pairs whose output token is not in this list. */
    supportedOutputTokens?: TokenRef[];
    /** When set, `getQuote` rejects pairs whose input chain is not in this list. */
    supportedInputChains?: number[];
    /** When set, `getQuote` rejects pairs whose output chain is not in this list. */
    supportedOutputChains?: number[];
  };

  walletScreening?: WalletScreeningConfig;

  settings?: {
    /** Reserved for future fee-tolerance support. */
    defaultSlippage?: number;
    /** Polling interval (ms) for `pollStatus`. Default 4000. */
    pollingIntervalMs?: number;
    /** Single-quote request timeout (ms) for `getQuote`. Default 15000. */
    quoteTimeoutMs?: number;
    /** Total timeout (ms) for `pollStatus` before giving up. Default 300000. */
    statusTimeoutMs?: number;
  };

  integrator?: {
    id?: number;
    feeRecipient?: string;
    feeAmount?: number;
  };

  /**
   * Per-venue config for multi-venue aggregation. When omitted, only Aori is
   * used (fully backward compatible). Add `relay` to enable the Relay venue.
   */
  venues?: VenuesConfig;

  /** Aggregation tuning (timeouts + comparator) for `getQuotes`/`getBestQuote`. */
  aggregation?: AggregationConfig;
}
