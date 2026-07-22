import type { SdkEnvironment } from '../../api/environment';
import type {
  AggregatedStatus,
  ExecuteQuoteParams,
  ExecuteQuoteResult,
  GetTokenPriceParams,
  GetTokensParams,
  NormalizedQuote,
  PollAggregatedStatusOptions,
  QuoteRequestInput,
  TokenMetadata,
  Venue,
  VenueId,
} from '../types';
import { RelayEnvironment, type RelayEnvironmentInit } from './client';
import { requestRelayQuote, toNormalizedQuote } from './quotes';
import { executeRelayQuote } from './execute';
import { pollRelayStatus } from './status';
import { getRelayCurrencies, getRelayTokenPrice } from './chains';

export {
  getRelayChains,
  getRelayCurrencies,
  getRelayTokenPrice,
  type GetRelayChainsOptions,
  type GetRelayCurrenciesOptions,
  type RelayChainInfo,
  type RelayCurrencyInfo,
} from './chains';

export interface RelayVenueOptions {
  /** Default single-quote request timeout (ms). */
  quoteTimeoutMs?: number;
  /** Default poll interval (ms) for `pollStatus`. */
  pollingIntervalMs?: number;
  /** Default poll deadline (ms) for `pollStatus`. */
  statusTimeoutMs?: number;
}

/**
 * Relay venue adapter. Talks to the Relay REST API directly (quote/execute/status)
 * and re-shapes everything into the normalized `Venue` contract.
 *
 * `sdkEnv` is reused for viem public clients (receipts) and RPC overrides so
 * Relay execution honors the same integrator RPC config as Aori.
 */
export class RelayVenue implements Venue {
  readonly id: VenueId = 'relay';
  /** Relay searches its currency index server-side via the `term` param. */
  readonly searchable = true;
  readonly relayEnv: RelayEnvironment;
  private readonly sdkEnv: SdkEnvironment;
  private readonly options: RelayVenueOptions;

  constructor(sdkEnv: SdkEnvironment, relayInit: RelayEnvironmentInit = {}, options: RelayVenueOptions = {}) {
    this.sdkEnv = sdkEnv;
    this.relayEnv = new RelayEnvironment(relayInit);
    this.options = options;
  }

  async requestQuote(input: QuoteRequestInput, opts: { signal?: AbortSignal }): Promise<NormalizedQuote> {
    const raw = await requestRelayQuote(
      input,
      {
        env: this.relayEnv,
        ...(this.options.quoteTimeoutMs != null ? { defaultTimeoutMs: this.options.quoteTimeoutMs } : {}),
      },
      { ...(opts.signal ? { signal: opts.signal } : {}) },
    );
    return toNormalizedQuote(input, raw);
  }

  async executeQuote(quote: NormalizedQuote, params: ExecuteQuoteParams): Promise<ExecuteQuoteResult> {
    return executeRelayQuote(quote, params, { sdkEnv: this.sdkEnv, relayEnv: this.relayEnv });
  }

  async pollStatus(quote: NormalizedQuote, opts: PollAggregatedStatusOptions): Promise<AggregatedStatus> {
    return pollRelayStatus(quote, opts, {
      relayEnv: this.relayEnv,
      interval: this.options.pollingIntervalMs ?? 4_000,
      timeout: this.options.statusTimeoutMs ?? 300_000,
    });
  }

  /**
   * Relay token metadata (`POST /currencies/v2`). Relay is search-capable
   * server-side (`term`) and can return its curated default set (`defaultList`)
   * or resolve specific `tokens` by `"chainId:address"`. When none of
   * `chainId` / `defaultList` / `tokens` is provided the call returns `[]`. Relay
   * does not embed prices here; use {@link getTokenPrice} for USD pricing.
   */
  async getTokens(params: GetTokensParams = {}): Promise<TokenMetadata[]> {
    const chainIds = params.chainId != null ? [params.chainId] : [];
    const currencies = await getRelayCurrencies(this.relayEnv, chainIds, {
      limit: params.limit ?? 100,
      verifiedOnly: params.verifiedOnly !== false,
      ...(params.term ? { term: params.term } : {}),
      ...(params.defaultList ? { defaultList: params.defaultList } : {}),
      ...(params.tokens ? { tokens: params.tokens } : {}),
      ...(params.useExternalSearch ? { useExternalSearch: params.useExternalSearch } : {}),
      ...(params.signal ? { signal: params.signal } : {}),
    });
    return currencies.map((c) => ({
      chainId: c.chainId,
      address: c.address,
      symbol: c.symbol,
      name: c.name,
      decimals: c.decimals,
      ...(c.logoURI ? { logoURI: c.logoURI } : {}),
      ...(c.verified != null ? { verified: c.verified } : {}),
      source: 'relay' as const,
    }));
  }

  /** Single-token USD price via Relay's `GET /currencies/token/price`. */
  async getTokenPrice(params: GetTokenPriceParams): Promise<number | null> {
    return getRelayTokenPrice(this.relayEnv, params);
  }
}
