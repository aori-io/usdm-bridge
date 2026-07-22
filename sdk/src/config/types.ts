import type { WalletScreeningConfig } from '../screening/walletScreening';
import type {
  GetTokenPriceParams,
  GetTokensParams,
  NormalizedQuote,
  TokenMetadata,
} from '../venues/types';

export interface TokenRef {
  chainId: number;
  address: string;
}

/**
 * An integrator-supplied token-population source. Merged into
 * {@link UsdmBridgeConfig.tokens.sources} and consumed by `getTokenRegistry`
 * alongside the built-in venue sources (Aori/Relay).
 *
 * Three shapes are supported:
 * - `custom`  — bring your own async fetcher (mirrors Relay's `queryTokenList`
 *   pattern: base URL + options → normalized tokens). This is the primary shape
 *   for server-curated / searchable token APIs.
 * - `tokenlist` — a hosted JSON endpoint returning a Uniswap-standard token list
 *   (`{ tokens: [...] }`) or a raw `TokenMetadata[]`. Static/GET only.
 * - `static` — an inline array baked into config.
 */
export type TokenSourceConfig =
  | {
      id: string;
      type: 'custom';
      /** Fetch/search tokens. Receives the same params venues get. */
      getTokens: (params?: GetTokensParams) => Promise<TokenMetadata[]>;
      /** Optional single-token USD price resolver. */
      getTokenPrice?: (params: GetTokenPriceParams) => Promise<number | null>;
      /** Set true when `getTokens` honors `term` server-side (search-as-you-type). */
      searchable?: boolean;
    }
  | {
      id: string;
      type: 'tokenlist';
      /** URL returning `{ tokens: TokenMetadata[] }` or `TokenMetadata[]`. */
      url: string;
      /** Extra request headers (e.g. an integrator key). */
      headers?: Record<string, string>;
    }
  | {
      id: string;
      type: 'static';
      tokens: TokenMetadata[];
    };

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

    /**
     * Integrator-supplied token sources merged into `getTokenRegistry` alongside
     * the built-in venue sources. Use to populate the picker from your own token
     * API / hosted token list / static array.
     */
    sources?: TokenSourceConfig[];
    /**
     * Merge priority by source id (first wins identity on `chainId:address`
     * collisions; later sources only fill gaps). Ids not listed keep their
     * natural order: built-in venue sources first, then `sources` in array order.
     */
    sourcePriority?: string[];
    /**
     * When true, custom `sources` REPLACE the venue-derived token registry
     * instead of augmenting it (integrator wants only their curated list).
     * Default false (augment).
     */
    replaceVenueTokens?: boolean;
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
