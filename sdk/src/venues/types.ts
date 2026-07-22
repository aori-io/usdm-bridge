import type { SwapWalletClient } from '../swap/walletClient';

/**
 * Identifier for a quote venue. The two first-party venues are `'aori'` and
 * `'relay'`; the `(string & {})` branch keeps the type open so future venues are
 * drop-in without a breaking change.
 */
export type VenueId = 'aori' | 'relay' | (string & {});

/**
 * Venue-agnostic quote request. Mirrors the shape the individual venues need
 * (chain IDs + token addresses + a raw or human amount). Each venue adapter maps
 * this onto its own request body.
 */
export interface QuoteRequestInput {
  srcChainId: number;
  dstChainId: number;
  srcTokenAddress: string;
  dstTokenAddress: string;
  /**
   * `bigint` = raw on-chain units. `string`/`number` = human-readable decimal
   * amount (requires `srcTokenDecimals`).
   */
  amount: bigint | string | number;
  /** Required when `amount` is a string or number. Ignored for bigint. */
  srcTokenDecimals?: number;
  srcWalletAddress: string;
  /** Defaults to `srcWalletAddress`. */
  dstWalletAddress?: string;
}

/**
 * Common, comparable quote header plus an opaque venue-specific payload consumed
 * only by the same venue's executor. All amounts are raw on-chain units.
 */
export interface NormalizedQuote {
  venue: VenueId;
  /** Venue-native id (Aori `orderHash` / Relay `requestId`). */
  quoteId: string;
  srcChainId: number;
  dstChainId: number;
  inputToken: string;
  outputToken: string;
  /** Raw input amount (on-chain units). */
  inputAmount: string;
  /** Raw output amount (on-chain units). The default comparator key. */
  outputAmount: string;
  /** USD value of the input amount, when the venue reports it. */
  inputAmountUsd?: string;
  outputAmountUsd?: string;
  estimatedTimeSec?: number;
  totalFeeUsd?: string;
  priceImpactPercent?: string;
  rate?: string;
  /** Quote expiry as ms since epoch, when known. */
  expiresAt?: number;
  /** When this quote was received (ms since epoch). */
  receivedAt: number;
  /** Opaque, venue-specific payload consumed only by the same venue's executor. */
  raw: unknown;
}

/** Normalized execution progress step, emitted by every venue's executor. */
export type QuoteExecutionStep =
  | { kind: 'chain-switch'; chainId: number }
  | { kind: 'approval-sent'; hash: string }
  | { kind: 'transaction-sent'; hash: string; chainId: number }
  | { kind: 'signing' }
  | { kind: 'submitted'; quoteId: string }
  | { kind: 'done'; quoteId: string };

/** Normalized settlement status shared across venues. */
export interface AggregatedStatus {
  venue: VenueId;
  status: 'pending' | 'received' | 'completed' | 'failed' | 'cancelled';
  txHash?: string;
  txUrl?: string;
  /** Opaque venue-native status payload. */
  raw: unknown;
}

export interface ExecuteQuoteParams {
  walletClient: SwapWalletClient;
  /** Defaults to `walletClient.account.address`. */
  userAddress?: string;
  /** Per-stage progress hook. */
  onStep?: (step: QuoteExecutionStep) => void;
  /** Fired on every transaction hash produced during execution. */
  onTxHash?: (hash: string, kind: string) => void;
  /** Optional staleness check called right before the first submit/deposit. */
  validateBeforeSubmit?: () => { canSubmit: boolean; reason?: string };
  /** When true, skips the implicit chain switch to the input chain. */
  skipChainSwitch?: boolean;
  abortSignal?: AbortSignal;
}

export interface ExecuteQuoteResult {
  venue: VenueId;
  quoteId: string;
  txHashes: string[];
  signature?: string;
  isNativeDeposit: boolean;
}

/**
 * A normalized past-order entry, venue-agnostic, for building a unified
 * transaction-history view across venues.
 */
export interface VenueHistoryEntry {
  venue: VenueId;
  /** Venue-native id (Aori orderHash / Relay requestId). */
  id: string;
  status: AggregatedStatus['status'];
  srcChainId?: number;
  dstChainId?: number;
  inputToken?: string;
  outputToken?: string;
  /** Raw on-chain units. */
  inputAmount?: string;
  outputAmount?: string;
  srcTxHash?: string;
  dstTxHash?: string;
  /** Timestamp in ms since epoch. */
  timestampMs: number;
  explorerUrl?: string;
  /** Opaque venue-native payload. */
  raw: unknown;
}

/** Options for a normalized status poll. */
export interface PollAggregatedStatusOptions {
  onStatusChange?: (status: AggregatedStatus) => void;
  /** Poll interval (ms). */
  interval?: number;
  /** Total polling deadline (ms). */
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * Venue-agnostic token metadata (plus an optional USD unit price when the venue
 * can supply one). This is the headless shape the widget consumes so it never
 * needs to know which venue a token's metadata/price came from.
 */
export interface TokenMetadata {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  /** USD price for one whole token, when the venue can price it. */
  price?: number;
  /** Whether the venue considers the token verified/curated. */
  verified?: boolean;
  /** The venue this metadata was sourced from. */
  source?: VenueId;
}

/** Params for a venue/aggregated token-metadata lookup. */
export interface GetTokensParams {
  /** Restrict to a single chain. Required by some venues (e.g. Relay). */
  chainId?: number;
  /** Optional free-text filter (symbol/name/address). */
  term?: string;
  /** Only verified/curated tokens, where the venue distinguishes. */
  verifiedOnly?: boolean;
  /** Max tokens per venue request. */
  limit?: number;
  /**
   * Request the source's curated default/suggested set (what a picker shows
   * before the user searches). Sources that don't distinguish ignore this.
   */
  defaultList?: boolean;
  /**
   * Resolve specific tokens by identity key (`"chainId:address"`). Lets a source
   * batch-hydrate an exact set instead of returning its whole list.
   */
  tokens?: string[];
  /**
   * Allow the source to fall back to 3rd-party lookups for tokens it hasn't
   * indexed. Off by default.
   */
  useExternalSearch?: boolean;
  signal?: AbortSignal;
}

/** Params for a single-token USD price lookup. */
export interface GetTokenPriceParams {
  chainId: number;
  address: string;
  signal?: AbortSignal;
}

/**
 * The single interface every venue implements. The aggregator only ever talks to
 * this contract, so new venues are drop-in.
 *
 * `getTokens`/`getTokenPrice` are optional capabilities: not every venue can
 * enumerate tokens or price them. The SDK aggregates whatever each venue can
 * provide.
 */
export interface Venue {
  id: VenueId;
  requestQuote(input: QuoteRequestInput, opts: { signal?: AbortSignal }): Promise<NormalizedQuote>;
  executeQuote(quote: NormalizedQuote, params: ExecuteQuoteParams): Promise<ExecuteQuoteResult>;
  pollStatus(quote: NormalizedQuote, opts: PollAggregatedStatusOptions): Promise<AggregatedStatus>;
  /** Optional: enumerate this venue's supported tokens (with metadata/price). */
  getTokens?(params?: GetTokensParams): Promise<TokenMetadata[]>;
  /** Optional: resolve a single token's USD unit price. `null` when unknown. */
  getTokenPrice?(params: GetTokenPriceParams): Promise<number | null>;
  /** Whether `getTokens` honors `term` server-side (search-as-you-type). */
  readonly searchable?: boolean;
}

/**
 * A token-population source, decoupled from quoting. Every {@link Venue} that
 * implements `getTokens` is also a token source, but integrators can register
 * standalone sources (their own token API, a hosted token-list JSON, or a static
 * array) to populate the picker without introducing a new quote venue.
 *
 * A source is not a quote venue: a token it returns may not be quotable/bridgeable
 * unless a real venue also supports it.
 */
export interface TokenSource {
  /** Stable identifier, used for merge priority and dedup diagnostics. */
  id: string;
  /** Enumerate/search this source's tokens. */
  getTokens(params?: GetTokensParams): Promise<TokenMetadata[]>;
  /** Optional: resolve a single token's USD unit price. `null` when unknown. */
  getTokenPrice?(params: GetTokenPriceParams): Promise<number | null>;
  /**
   * Whether this source performs server-side search when a `term` is passed to
   * {@link getTokens}. The widget uses this to route search-as-you-type to the
   * source instead of only filtering the preloaded registry. Default: treat as
   * client-side only (false/undefined).
   */
  searchable?: boolean;
}
