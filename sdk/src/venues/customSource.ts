import type { TokenSourceConfig } from '../config/types';
import type { GetTokensParams, TokenMetadata, TokenSource } from './types';

/** `"chainId:address"` identity key, lowercased address. Matches Relay's format. */
const tokenKey = (chainId: number, address: string): string =>
  `${chainId}:${address.toLowerCase()}`;

/**
 * Coerce an arbitrary token-list entry into {@link TokenMetadata}, or `null`
 * when it lacks the minimum identity fields. Accepts Uniswap-standard token-list
 * entries (`logoURI` at top level) and Relay-style (`metadata.logoURI`).
 */
function normalizeToken(raw: unknown, sourceId: string): TokenMetadata | null {
  if (raw == null || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const chainId = typeof t.chainId === 'number' ? t.chainId : Number(t.chainId);
  const address = typeof t.address === 'string' ? t.address : undefined;
  if (!Number.isFinite(chainId) || !address) return null;

  const metadata = (t.metadata ?? {}) as Record<string, unknown>;
  const logoURI =
    typeof t.logoURI === 'string'
      ? t.logoURI
      : typeof metadata.logoURI === 'string'
        ? metadata.logoURI
        : undefined;
  const verified =
    typeof t.verified === 'boolean'
      ? t.verified
      : typeof metadata.verified === 'boolean'
        ? metadata.verified
        : undefined;
  const symbol = typeof t.symbol === 'string' ? t.symbol : '';
  const price =
    typeof t.price === 'number' ? t.price : typeof t.price === 'string' ? Number(t.price) : undefined;

  return {
    chainId,
    address,
    symbol,
    name: typeof t.name === 'string' && t.name ? t.name : symbol,
    decimals: typeof t.decimals === 'number' ? t.decimals : Number(t.decimals ?? 18) || 18,
    ...(logoURI ? { logoURI } : {}),
    ...(price != null && Number.isFinite(price) ? { price } : {}),
    ...(verified != null ? { verified } : {}),
    source: sourceId,
  };
}

/**
 * Apply the venue-agnostic {@link GetTokensParams} filters client-side. Used by
 * sources that return their whole list (static / hosted token list) and can't
 * push filtering server-side.
 */
function filterTokens(tokens: TokenMetadata[], params: GetTokensParams): TokenMetadata[] {
  const wanted =
    params.tokens && params.tokens.length > 0
      ? new Set(params.tokens.map((k) => k.toLowerCase().replace(/-/g, ':')))
      : undefined;
  const term = params.term?.trim().toLowerCase();

  let out = tokens.filter((t) => {
    if (params.chainId != null && t.chainId !== params.chainId) return false;
    if (params.verifiedOnly && t.verified === false) return false;
    if (wanted && !wanted.has(tokenKey(t.chainId, t.address))) return false;
    if (term) {
      const hay = `${t.symbol} ${t.name} ${t.address}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  if (params.limit != null && params.limit >= 0 && out.length > params.limit) {
    out = out.slice(0, params.limit);
  }
  return out;
}

const TOKEN_LIST_TTL_MS = 30_000;
interface TokenListCacheEntry {
  at: number;
  tokens: TokenMetadata[];
}
const tokenListCache = new Map<string, TokenListCacheEntry>();

/**
 * Fetch + normalize a hosted token list (Uniswap-standard `{ tokens: [...] }`
 * or a raw array). Cached per URL for a short TTL so repeated picker opens don't
 * re-fetch the whole list.
 */
async function fetchTokenList(
  id: string,
  url: string,
  headers: Record<string, string> | undefined,
  signal?: AbortSignal,
): Promise<TokenMetadata[]> {
  const cached = tokenListCache.get(url);
  if (cached && Date.now() - cached.at < TOKEN_LIST_TTL_MS) return cached.tokens;

  const response = await fetch(url, {
    method: 'GET',
    ...(headers ? { headers } : {}),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`Token list "${id}" fetch failed: ${response.status} ${response.statusText}`);
  }
  const body: unknown = await response.json();
  const rawList: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { tokens?: unknown[] })?.tokens)
      ? ((body as { tokens: unknown[] }).tokens)
      : [];

  const tokens = rawList
    .map((t) => normalizeToken(t, id))
    .filter((t): t is TokenMetadata => t != null);

  tokenListCache.set(url, { at: Date.now(), tokens });
  return tokens;
}

/**
 * Build a {@link TokenSource} from an integrator {@link TokenSourceConfig}. The
 * `custom` shape passes through untouched (the integrator owns fetching/filtering);
 * `tokenlist` and `static` normalize + filter client-side.
 */
export function createTokenSource(config: TokenSourceConfig): TokenSource {
  if (config.type === 'custom') {
    return {
      id: config.id,
      getTokens: config.getTokens,
      ...(config.getTokenPrice ? { getTokenPrice: config.getTokenPrice } : {}),
      ...(config.searchable != null ? { searchable: config.searchable } : {}),
    };
  }

  if (config.type === 'tokenlist') {
    return {
      id: config.id,
      getTokens: async (params: GetTokensParams = {}) => {
        const all = await fetchTokenList(config.id, config.url, config.headers, params.signal);
        return filterTokens(all, params);
      },
    };
  }

  // static
  const staticTokens = config.tokens
    .map((t) => normalizeToken(t, config.id))
    .filter((t): t is TokenMetadata => t != null);
  return {
    id: config.id,
    getTokens: async (params: GetTokensParams = {}) => filterTokens(staticTokens, params),
  };
}
