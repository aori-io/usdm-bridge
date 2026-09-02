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

/** VM types this SDK can quote and execute against. */
const DEFAULT_VM_TYPES = ['evm', 'svm'] as const;

export interface GetRelayChainsOptions {
  signal?: AbortSignal;
  /** Include chains flagged `disabled`. Default false. */
  includeDisabled?: boolean;
  /**
   * VM types to include. Defaults to `['evm', 'svm']` — the types this SDK can
   * execute. Pass `['evm']` to exclude Solana. Chains on VM types with no
   * execution path (Bitcoin, TON, …) are always excluded unless requested here.
   */
  vmTypes?: string[];
}

/**
 * Fetch Relay's supported chains (`GET /chains`), normalized. EVM and Solana
 * chains are returned by default; the caller can narrow this via
 * {@link GetRelayChainsOptions.vmTypes}. Each result keeps its real `vmType`
 * so consumers can branch on EVM vs SVM.
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
  const allowedVmTypes = new Set<string>(opts.vmTypes ?? DEFAULT_VM_TYPES);
  const chains = Array.isArray(res?.chains) ? res.chains : [];
  return chains
    .filter((c): c is RawRelayChain & { id: number; vmType: string } =>
      c != null && typeof c.id === 'number' && c.vmType != null && allowedVmTypes.has(c.vmType))
    .filter((c) => opts.includeDisabled || !c.disabled)
    .map((c) => ({
      id: c.id,
      key: (c.name ?? String(c.id)).toLowerCase(),
      name: c.displayName ?? c.name ?? `Chain ${c.id}`,
      vmType: c.vmType,
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
  /** Max tokens per request. Default 100. */
  limit?: number;
  /** Optional search term (symbol/name/address). */
  term?: string;
  /** Only verified tokens. Default true. */
  verifiedOnly?: boolean;
}

/**
 * Fetch Relay currencies for the given chain IDs (`POST /currencies/v2`) and
 * normalize them. Returns `[]` for an empty chain list.
 */
export async function getRelayCurrencies(
  env: RelayEnvironment,
  chainIds: number[],
  opts: GetRelayCurrenciesOptions = {},
): Promise<RelayCurrencyInfo[]> {
  if (!Array.isArray(chainIds) || chainIds.length === 0) return [];
  const url = resolveRelayUrl(env, '/currencies/v2');
  const res = await relayFetch<RawRelayCurrency[] | { currencies?: RawRelayCurrency[] }>(env, url, {
    method: 'POST',
    body: {
      chainIds,
      limit: opts.limit ?? 100,
      verified: opts.verifiedOnly !== false,
      ...(opts.term ? { term: opts.term } : {}),
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
