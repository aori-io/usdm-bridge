import type {
  Aori,
  ChainInfo,
  OrderDetails,
  OrderStatus,
  QuoteResponse,
  QueryOrdersParams,
  QueryOrdersResponse,
  SwapResponse,
  TokenInfo,
} from '@aori/aori-ts';
import { SdkEnvironment } from '../api/environment';
import { getAoriClient } from './aoriClient';
import { type RequestQuoteParams, requestQuote } from '../api/quotes';
import { type SubmitSwapParams, submitSwap } from '../api/submit';
import { type PollOrderStatusOptions, pollOrderStatus } from '../api/status';
import { type TrackOrderStatusOptions, trackOrderStatus } from '../api/statusTracker';
import type { UsdmBridgeConfig, TokenRef } from '../config/types';
import { createTokenSource } from '../venues/customSource';
import { UnsupportedPairError } from '../errors';
import { type ScreeningResult, screenWallet } from '../screening/walletScreening';
import { type BridgeParams, type BridgeResult, bridge } from '../swap/bridge';
import { type ExecuteSwapParams, type ExecuteSwapResult, executeSwap } from '../swap/execute';
import { signOrder } from '../swap/sign';
import { type SwapWalletClient } from '../swap/walletClient';
import {
  type BridgeQuoteParams,
  type BridgeQuoteResult,
  type GetQuotesOptions,
  type GetQuotesResult,
  bridgeQuote,
  getBestQuote,
  getQuotes,
} from '../aggregator';
import { AoriVenue } from '../venues/aori';
import { RelayVenue } from '../venues/relay';
import { getRelayHistory } from '../venues/relay/requests';
import {
  getRelayChains,
  getRelayCurrencies,
  type GetRelayChainsOptions,
  type GetRelayCurrenciesOptions,
  type RelayChainInfo,
  type RelayCurrencyInfo,
} from '../venues/relay/chains';
import type {
  ExecuteQuoteParams,
  ExecuteQuoteResult,
  GetTokenPriceParams,
  GetTokensParams,
  NormalizedQuote,
  QuoteRequestInput,
  TokenMetadata,
  TokenSource,
  Venue,
  VenueId,
  VenueHistoryEntry,
} from '../venues/types';

const sameTokenRef = (a: TokenRef, b: { chainId: number; address: string }) =>
  a.chainId === b.chainId && a.address.toLowerCase() === b.address.toLowerCase();

export class UsdmBridgeSdk {
  readonly config: UsdmBridgeConfig;
  readonly env: SdkEnvironment;
  private venueRegistry?: Map<VenueId, Venue>;
  private tokenSources?: TokenSource[];

  constructor(config: UsdmBridgeConfig = {}) {
    this.config = config;
    this.env = new SdkEnvironment({
      ...(config.apiKey != null ? { apiKey: config.apiKey } : {}),
      ...(config.aoriApiBaseUrl != null ? { aoriApiBaseUrl: config.aoriApiBaseUrl } : {}),
      ...(config.rpcOverrides != null ? { rpcOverrides: config.rpcOverrides } : {}),
    });
  }

  /** Resolve (and cache) the underlying `@aori/aori-ts` client. */
  client(): Promise<Aori> {
    return getAoriClient(this.env);
  }

  /**
   * Lazily build the venue registry from config. Aori is always available
   * unless explicitly disabled. Additional venues (e.g. Relay) are added when
   * present in `config.venues`. With no `venues` config this is Aori-only, which
   * preserves the pre-aggregation behavior.
   */
  private getVenueRegistry(): Map<VenueId, Venue> {
    if (this.venueRegistry) return this.venueRegistry;

    const registry = new Map<VenueId, Venue>();
    const venuesCfg = this.config.venues;

    const venueOptions = {
      ...(this.config.settings?.quoteTimeoutMs != null
        ? { quoteTimeoutMs: this.config.settings.quoteTimeoutMs }
        : {}),
      ...(this.config.settings?.pollingIntervalMs != null
        ? { pollingIntervalMs: this.config.settings.pollingIntervalMs }
        : {}),
      ...(this.config.settings?.statusTimeoutMs != null
        ? { statusTimeoutMs: this.config.settings.statusTimeoutMs }
        : {}),
    };

    const aoriEnabled = venuesCfg?.aori?.enabled !== false;
    if (aoriEnabled) {
      registry.set('aori', new AoriVenue(this.env, venueOptions));
    }

    // Relay is opt-in: only registered when a `relay` config block is present
    // and not explicitly disabled.
    const relayCfg = venuesCfg?.relay;
    if (relayCfg && relayCfg.enabled !== false) {
      registry.set(
        'relay',
        new RelayVenue(
          this.env,
          {
            ...(relayCfg.apiBaseUrl != null ? { apiBaseUrl: relayCfg.apiBaseUrl } : {}),
            ...(relayCfg.apiKey != null ? { apiKey: relayCfg.apiKey } : {}),
          },
          venueOptions,
        ),
      );
    }

    this.venueRegistry = registry;
    return registry;
  }

  /** The list of active venues, in a stable order. */
  private getVenues(): Venue[] {
    return [...this.getVenueRegistry().values()];
  }

  /** Look up a single venue by id (used to dispatch execution/status). */
  getVenue(id: VenueId): Venue | undefined {
    return this.getVenueRegistry().get(id);
  }

  /**
   * The ordered list of token-population sources. Built from (1) every configured
   * venue that can enumerate tokens, then (2) integrator `config.tokens.sources`.
   * When `config.tokens.replaceVenueTokens` is set, the venue-derived sources are
   * dropped so only custom sources populate the registry. The final order is then
   * re-sorted by `config.tokens.sourcePriority` (listed ids first, in that order).
   */
  private getTokenSources(): TokenSource[] {
    if (this.tokenSources) return this.tokenSources;

    const venueSources: TokenSource[] = this.config.tokens?.replaceVenueTokens
      ? []
      : this.getVenues()
          .filter((v): v is Venue & Required<Pick<Venue, 'getTokens'>> => typeof v.getTokens === 'function')
          .map((v) => ({
            id: v.id,
            getTokens: (params?: GetTokensParams) => v.getTokens!(params),
            ...(typeof v.getTokenPrice === 'function'
              ? { getTokenPrice: (params: GetTokenPriceParams) => v.getTokenPrice!(params) }
              : {}),
            ...(v.searchable ? { searchable: true } : {}),
          }));

    const customSources = (this.config.tokens?.sources ?? []).map(createTokenSource);

    const combined = [...venueSources, ...customSources];

    const priority = this.config.tokens?.sourcePriority;
    if (priority && priority.length > 0) {
      const rank = new Map(priority.map((id, i) => [id, i]));
      combined.sort((a, b) => {
        const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
    }

    this.tokenSources = combined;
    return combined;
  }

  /**
   * Ids of token sources that perform server-side search (honor `term` in
   * `getTokenRegistry`). The widget uses this to route search-as-you-type to
   * those sources instead of only filtering the preloaded registry. Empty when
   * every source is client-side only.
   */
  getSearchableSourceIds(): string[] {
    return this.getTokenSources()
      .filter((s) => s.searchable === true)
      .map((s) => s.id);
  }

  private mergeAggregationOptions(opts?: GetQuotesOptions): GetQuotesOptions {
    const agg = this.config.aggregation;
    return {
      ...(agg?.perVenueTimeoutMs != null ? { perVenueTimeoutMs: agg.perVenueTimeoutMs } : {}),
      ...(agg?.overallDeadlineMs != null ? { overallDeadlineMs: agg.overallDeadlineMs } : {}),
      ...(agg?.compareQuotes != null ? { compareQuotes: agg.compareQuotes } : {}),
      ...opts,
    };
  }

  /**
   * Request quotes from every configured venue in parallel with bounded
   * timeouts. Always resolves with partial results (never hangs on a slow
   * venue). Quotes are returned sorted best-first.
   */
  async getQuotes(input: QuoteRequestInput, opts?: GetQuotesOptions): Promise<GetQuotesResult> {
    return getQuotes(this.getVenues(), input, this.mergeAggregationOptions(opts));
  }

  /** Convenience over {@link getQuotes}: returns the single best quote. */
  async getBestQuote(input: QuoteRequestInput, opts?: GetQuotesOptions): Promise<NormalizedQuote> {
    return getBestQuote(this.getVenues(), input, this.mergeAggregationOptions(opts));
  }

  private resolveVenueForQuote(quote: NormalizedQuote): Venue {
    const venue = this.getVenue(quote.venue);
    if (!venue) {
      throw new Error(
        `No venue registered for "${quote.venue}". Ensure it is enabled in config.venues before executing.`,
      );
    }
    return venue;
  }

  /**
   * Execute a normalized quote against its originating venue (dispatches to the
   * correct venue adapter). Emits normalized `QuoteExecutionStep`s.
   */
  async executeQuote(quote: NormalizedQuote, params: ExecuteQuoteParams): Promise<ExecuteQuoteResult> {
    return this.resolveVenueForQuote(quote).executeQuote(quote, params);
  }

  /**
   * One-shot bridge for a normalized quote: `executeQuote` → poll status →
   * classify outcome → fire hooks. Dispatches to the correct venue.
   */
  async bridgeQuote(quote: NormalizedQuote, params: BridgeQuoteParams): Promise<BridgeQuoteResult> {
    return bridgeQuote(this.resolveVenueForQuote(quote), quote, params);
  }

  /**
   * Validates that the input/output pair satisfies the integrator's
   * `tokens.supported*` allow-lists. This is the primary mechanism for binding
   * one side of the pair to USDM (or any other asset).
   */
  isPairAllowed(
    input: { chainId: number; address: string },
    output: { chainId: number; address: string },
  ): boolean {
    const t = this.config.tokens;
    if (!t) return true;

    if (t.supportedInputChains?.length && !t.supportedInputChains.includes(input.chainId)) return false;
    if (t.supportedOutputChains?.length && !t.supportedOutputChains.includes(output.chainId)) return false;
    if (t.supportedInputTokens?.length && !t.supportedInputTokens.some((ref) => sameTokenRef(ref, input))) return false;
    if (t.supportedOutputTokens?.length && !t.supportedOutputTokens.some((ref) => sameTokenRef(ref, output))) return false;

    return true;
  }

  /**
   * Fetch a single quote from the Aori API. Enforces `tokens.supported*`
   * allow-lists before hitting the network.
   */
  async getQuote(params: RequestQuoteParams): Promise<QuoteResponse> {
    const input = { chainId: params.srcChainId, address: params.srcTokenAddress };
    const output = { chainId: params.dstChainId, address: params.dstTokenAddress };
    if (!this.isPairAllowed(input, output)) {
      throw new UnsupportedPairError(
        `Pair not allowed by SDK config: ${input.chainId}:${input.address} -> ${output.chainId}:${output.address}`,
      );
    }

    const aori = await this.client();
    return requestQuote(params, {
      aori,
      ...(this.config.settings?.quoteTimeoutMs != null
        ? { defaultTimeoutMs: this.config.settings.quoteTimeoutMs }
        : {}),
    });
  }

  /**
   * Headless swap execution: ERC20 (approve → sign → submit) or native deposit.
   */
  async executeSwap(params: ExecuteSwapParams): Promise<ExecuteSwapResult> {
    const aori = await this.client();
    return executeSwap(params, { env: this.env, aori });
  }

  /**
   * One-shot end-to-end bridge: `executeSwap`, waits the deposit settle delay,
   * polls until terminal status, and fires `onSuccess`/`onFailure`/`onSettled`.
   */
  async bridge(params: BridgeParams): Promise<BridgeResult> {
    const aori = await this.client();
    return bridge(params, { env: this.env, aori });
  }

  /** Sign an Aori order (EIP-712) without submitting it. */
  async signOrder(
    quote: QuoteResponse,
    walletClient: SwapWalletClient,
    userAddress: string,
  ): Promise<{ orderHash: string; signature: string }> {
    const aori = await this.client();
    return signOrder({ quote, walletClient, userAddress, aori });
  }

  /** Submit a signed ERC20 order to the Aori API (`POST /swap`). */
  async submitSwap(params: SubmitSwapParams): Promise<SwapResponse> {
    const aori = await this.client();
    return submitSwap(params, aori);
  }

  /** Poll order status until terminal, deadline, or abort. */
  async pollStatus(orderHash: string, opts: PollOrderStatusOptions = {}): Promise<OrderStatus> {
    const aori = await this.client();
    return pollOrderStatus(orderHash, aori, {
      ...(this.config.settings?.pollingIntervalMs != null
        ? { interval: this.config.settings.pollingIntervalMs }
        : {}),
      ...(this.config.settings?.statusTimeoutMs != null
        ? { timeout: this.config.settings.statusTimeoutMs }
        : {}),
      ...opts,
    });
  }

  /**
   * Status-code-aware order-status poller for UI integrations. Unlike
   * {@link pollStatus} (which drives the typed Aori client), this hits
   * `GET /data/status/{orderHash}` directly so it can distinguish the
   * settlement warm-up window (404) from an expired/not-found order (400).
   * Preferred by the widget; `pollStatus` remains the recommended server-side
   * poller.
   */
  trackOrderStatus(orderHash: string, options: TrackOrderStatusOptions = {}): Promise<OrderStatus> {
    return trackOrderStatus(orderHash, this.env, options);
  }

  /** Fetch the current status of an order once. */
  async getOrderStatus(orderHash: string, options?: { signal?: AbortSignal }): Promise<OrderStatus> {
    const aori = await this.client();
    return aori.getOrderStatus(orderHash, options);
  }

  /** Fetch full order details (`GET /data/details/{orderHash}`). */
  async getOrderDetails(orderHash: string, options?: { signal?: AbortSignal }): Promise<OrderDetails> {
    const aori = await this.client();
    return aori.getOrderDetails(orderHash, options);
  }

  /** Query historical orders with filtering (`GET /data/query`). */
  async queryOrders(params: QueryOrdersParams, options?: { signal?: AbortSignal }): Promise<QueryOrdersResponse> {
    const aori = await this.client();
    return aori.queryOrders(params, options);
  }

  /**
   * Fetch a user's Relay transaction history (`GET /requests/v2`) as normalized
   * {@link VenueHistoryEntry}s. Returns `[]` when the Relay venue isn't
   * configured, so callers can unconditionally merge it with Aori history.
   */
  async queryRelayHistory(
    user: string,
    opts?: { limit?: number; signal?: AbortSignal },
  ): Promise<VenueHistoryEntry[]> {
    const venue = this.getVenue('relay');
    if (!venue) return [];
    return getRelayHistory((venue as RelayVenue).relayEnv, user, opts ?? {});
  }

  /**
   * Fetch Relay's supported EVM chains (`GET /chains`), normalized. Returns `[]`
   * when the Relay venue isn't configured.
   */
  async getRelayChains(opts?: GetRelayChainsOptions): Promise<RelayChainInfo[]> {
    const venue = this.getVenue('relay');
    if (!venue) return [];
    return getRelayChains((venue as RelayVenue).relayEnv, opts ?? {});
  }

  /**
   * Fetch Relay currencies for the given chain IDs (`POST /currencies/v2`),
   * normalized. Returns `[]` when the Relay venue isn't configured or no chain
   * IDs are supplied.
   */
  async getRelayCurrencies(
    chainIds: number[],
    opts?: GetRelayCurrenciesOptions,
  ): Promise<RelayCurrencyInfo[]> {
    const venue = this.getVenue('relay');
    if (!venue) return [];
    return getRelayCurrencies((venue as RelayVenue).relayEnv, chainIds, opts ?? {});
  }

  /** Chain metadata (chainId, eid, settlement contract address) for a chain. */
  async getChainInfo(chain: string | number): Promise<ChainInfo | undefined> {
    const aori = await this.client();
    return aori.getChain(chain);
  }

  /** All chains supported by the Aori API, keyed by chain key. */
  async getChains(): Promise<Record<string, ChainInfo>> {
    const aori = await this.client();
    return aori.getAllChains();
  }

  /** Fetch the token list (optionally filtered by chain). */
  async getTokens(chain?: string | number, options?: { signal?: AbortSignal }): Promise<TokenInfo[]> {
    const aori = await this.client();
    if (chain != null) return aori.fetchTokens(chain, options);
    await aori.loadTokens(undefined, options);
    return aori.getAllTokens();
  }

  /**
   * Source-aggregated token metadata (+ prices where available). Merges
   * {@link TokenSource.getTokens} from every token source — the built-in venue
   * sources (Aori/Relay) plus any integrator `config.tokens.sources` — deduped by
   * chain+address. The first source (in priority order) to yield a token owns its
   * identity; later sources fill in missing fields (price, logoURI, name) and
   * contribute tokens the earlier sources don't cover. This is the headless
   * replacement for the widget talking to a specific venue's token API directly.
   *
   * Pass `venues`/`sources` to restrict which source ids are queried (e.g.
   * `['relay']` for a per-chain augmentation, or `['my-token-api']` for an
   * integrator source). Both are unioned and matched against source ids.
   */
  async getTokenRegistry(
    params: GetTokensParams & { venues?: VenueId[]; sources?: string[] } = {},
  ): Promise<TokenMetadata[]> {
    const { venues: onlyVenues, sources: onlySources, ...tokenParams } = params;
    const only =
      onlyVenues || onlySources
        ? new Set<string>([...(onlyVenues ?? []), ...(onlySources ?? [])])
        : undefined;

    const sources = this.getTokenSources().filter((s) => !only || only.has(s.id));

    const lists = await Promise.all(
      sources.map((s) => s.getTokens(tokenParams).catch(() => [] as TokenMetadata[])),
    );

    const merged = new Map<string, TokenMetadata>();
    for (const list of lists) {
      for (const token of list) {
        if (!token?.address || token.chainId == null) continue;
        const key = `${token.chainId}-${token.address.toLowerCase()}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, token);
          continue;
        }
        // Fill gaps on the first-seen entry without overwriting its identity.
        merged.set(key, {
          ...existing,
          ...(existing.price == null && token.price != null ? { price: token.price } : {}),
          ...(!existing.logoURI && token.logoURI ? { logoURI: token.logoURI } : {}),
          ...(!existing.name && token.name ? { name: token.name } : {}),
        });
      }
    }
    return [...merged.values()];
  }

  /**
   * Resolve a single token's USD unit price by asking each token source in
   * priority order and returning the first non-null result. Aori answers from its
   * token registry; Relay answers from its dedicated price endpoint; integrator
   * `custom` sources answer from their own `getTokenPrice`. Returns `null` when no
   * source can price the token.
   */
  async getTokenPrice(params: GetTokenPriceParams): Promise<number | null> {
    for (const source of this.getTokenSources()) {
      if (typeof source.getTokenPrice !== 'function') continue;
      try {
        const price = await source.getTokenPrice(params);
        if (price != null) return price;
      } catch {
        // Try the next source on failure.
      }
    }
    return null;
  }

  /** Client-side wallet screening (blacklist, Chainalysis oracle, integrator URL). */
  screenWallet(address: string): Promise<ScreeningResult> {
    return screenWallet(address, this.config.walletScreening);
  }
}
