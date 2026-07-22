import { type RelayEnvironment, relayFetch, resolveRelayUrl } from './client';

/** Normalized EVM chain info from Relay's `GET /chains`. */
export interface RelayChainInfo {
  id: number;
  /** Relay slug (lowercased `name`), e.g. `base`. */
  key: string;
  /** Human-readable name (`displayName`). */
  name: string;
  vmType: string;
  rpcUrl?: string;
  wsRpcUrl?: string;
  explorerUrl?: string;
  iconUrl?: string;
  disabled?: boolean;
  depositEnabled?: boolean;
  nativeCurrency: { symbol: string; name: string; decimals: number; address: string };
}

interface RawRelayChain {
  id?: number;
  name?: string;
  displayName?: string;
  vmType?: string;
  httpRpcUrl?: string;
  wsRpcUrl?: string;
  explorerUrl?: string;
  iconUrl?: string;
  disabled?: boolean;
  depositEnabled?: boolean;
  currency?: { symbol?: string; name?: string; decimals?: number; address?: string };
}

interface RelayChainsResponse {
  chains?: RawRelayChain[];
}

export interface GetRelayChainsOptions {
  signal?: AbortSignal;
  /** Include chains flagged `disabled`. Default false. */
  includeDisabled?: boolean;
}

/**
 * Fetch Relay's supported chains (`GET /chains`), filtered to EVM chains and
 * normalized. Non-EVM chains (Solana, Bitcoin, TON, …) are excluded since this
 * SDK/widget is EVM/viem-based.
 */
export async function getRelayChains(
  env: RelayEnvironment,
  opts: GetRelayChainsOptions = {},
): Promise<RelayChainInfo[]> {
  const url = resolveRelayUrl(env, '/chains');
  const res = await relayFetch<RelayChainsResponse>(env, url, {
    method: 'GET',
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const chains = Array.isArray(res?.chains) ? res.chains : [];
  return chains
    .filter((c): c is RawRelayChain & { id: number } => c != null && typeof c.id === 'number' && c.vmType === 'evm')
    .filter((c) => opts.includeDisabled || !c.disabled)
    .map((c) => ({
      id: c.id,
      key: (c.name ?? String(c.id)).toLowerCase(),
      name: c.displayName ?? c.name ?? `Chain ${c.id}`,
      vmType: 'evm',
      ...(c.httpRpcUrl ? { rpcUrl: c.httpRpcUrl } : {}),
      ...(c.wsRpcUrl ? { wsRpcUrl: c.wsRpcUrl } : {}),
      ...(c.explorerUrl ? { explorerUrl: c.explorerUrl } : {}),
      ...(c.iconUrl ? { iconUrl: c.iconUrl } : {}),
      ...(c.disabled != null ? { disabled: c.disabled } : {}),
      ...(c.depositEnabled != null ? { depositEnabled: c.depositEnabled } : {}),
      nativeCurrency: {
        symbol: c.currency?.symbol ?? 'ETH',
        name: c.currency?.name ?? 'Ether',
        decimals: c.currency?.decimals ?? 18,
        address: c.currency?.address ?? '0x0000000000000000000000000000000000000000',
      },
    }));
}

/** Normalized token info from Relay's `POST /currencies/v2`. */
export interface RelayCurrencyInfo {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  verified?: boolean;
}

interface RawRelayCurrency {
  chainId?: number;
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  vmType?: string;
  metadata?: { logoURI?: string; verified?: boolean };
}

export interface GetRelayCurrenciesOptions {
  signal?: AbortSignal;
  /** Max tokens per request. Default 100 (Relay caps at 100). */
  limit?: number;
  /** Optional search term (symbol/name/address). Searched server-side by Relay. */
  term?: string;
  /** Only verified tokens. Default true. */
  verifiedOnly?: boolean;
  /**
   * Request Relay's curated default/suggested list. When true, an empty
   * `chainIds` is allowed (Relay returns its cross-chain default set).
   */
  defaultList?: boolean;
  /** Resolve specific tokens by `"chainId:address"` identity keys. */
  tokens?: string[];
  /** Let Relay fall back to 3rd-party lookups for tokens it hasn't indexed. */
  useExternalSearch?: boolean;
}

/**
 * Fetch Relay currencies (`POST /currencies/v2`) and normalize them. Requires at
 * least one of `chainIds`, `opts.defaultList`, or `opts.tokens`; returns `[]`
 * when none is provided (an unscoped, non-default call).
 */
export async function getRelayCurrencies(
  env: RelayEnvironment,
  chainIds: number[],
  opts: GetRelayCurrenciesOptions = {},
): Promise<RelayCurrencyInfo[]> {
  const hasChains = Array.isArray(chainIds) && chainIds.length > 0;
  const hasTokens = Array.isArray(opts.tokens) && opts.tokens.length > 0;
  if (!hasChains && !opts.defaultList && !hasTokens) return [];
  const url = resolveRelayUrl(env, '/currencies/v2');
  const res = await relayFetch<RawRelayCurrency[] | { currencies?: RawRelayCurrency[] }>(env, url, {
    method: 'POST',
    body: {
      ...(hasChains ? { chainIds } : {}),
      limit: Math.min(opts.limit ?? 100, 100),
      verified: opts.verifiedOnly !== false,
      ...(opts.term ? { term: opts.term } : {}),
      ...(opts.defaultList ? { defaultList: true } : {}),
      ...(hasTokens ? { tokens: opts.tokens } : {}),
      ...(opts.useExternalSearch ? { useExternalSearch: true } : {}),
    },
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const list = Array.isArray(res) ? res : (res?.currencies ?? []);
  return list
    .filter((t): t is RawRelayCurrency & { chainId: number; address: string } =>
      t != null && typeof t.chainId === 'number' && typeof t.address === 'string',
    )
    .map((t) => ({
      chainId: t.chainId,
      address: t.address,
      symbol: t.symbol ?? '',
      name: t.name ?? t.symbol ?? '',
      decimals: t.decimals ?? 18,
      ...(t.metadata?.logoURI ? { logoURI: t.metadata.logoURI } : {}),
      ...(t.metadata?.verified != null ? { verified: t.metadata.verified } : {}),
    }));
}

/**
 * Fetch a single token's USD price from Relay's dedicated price endpoint
 * (`GET /currencies/token/price?address=&chainId=`). Returns `null` when Relay
 * cannot price the token. Use the zero address for a chain's native currency.
 */
export async function getRelayTokenPrice(
  env: RelayEnvironment,
  params: { chainId: number; address: string; signal?: AbortSignal },
): Promise<number | null> {
  const { chainId, address, signal } = params;
  if (chainId == null || !address) return null;
  const query = `address=${encodeURIComponent(address)}&chainId=${encodeURIComponent(String(chainId))}`;
  const url = resolveRelayUrl(env, `/currencies/token/price?${query}`);
  const res = await relayFetch<{ price?: number | string }>(env, url, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  });
  const price = typeof res?.price === 'string' ? Number(res.price) : res?.price;
  return typeof price === 'number' && Number.isFinite(price) ? price : null;
}
