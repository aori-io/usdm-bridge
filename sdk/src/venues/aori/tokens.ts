import type { SdkEnvironment } from '../../api/environment';
import type { GetTokenPriceParams, GetTokensParams, TokenMetadata } from '../types';

/**
 * Raw shape of Aori's `/tokens?metadata=true` endpoint. Unlike the typed
 * `@aori/aori-ts` `TokenInfo` (symbol/address/chainId/chainKey only), the
 * `metadata=true` variant returns the richer fields the UI needs — including
 * `price`, `name`, `decimals`, and `icon`.
 */
interface AoriTokenMetadata {
  symbol: string;
  name?: string;
  address: string;
  chainId: number;
  chainKey?: string;
  decimals?: number;
  price?: number;
  icon?: string | null;
}

/** Short-lived cache of the full metadata list, keyed by base URL. */
interface CacheEntry {
  at: number;
  tokens: TokenMetadata[];
}
const TOKENS_TTL_MS = 30_000;
const tokensCache = new Map<string, CacheEntry>();

const mapAoriToken = (t: AoriTokenMetadata): TokenMetadata => ({
  chainId: t.chainId,
  address: t.address,
  symbol: t.symbol,
  name: t.name || t.symbol,
  decimals: t.decimals ?? 18,
  ...(t.icon ? { logoURI: t.icon } : {}),
  ...(t.price != null ? { price: t.price } : {}),
  source: 'aori' as const,
});

/**
 * Fetch Aori's full token registry (`GET /tokens?metadata=true`) as normalized
 * {@link TokenMetadata}. Honors the SDK env's base URL (integrator proxy) and
 * API key policy. Results are cached for a short TTL so repeated price/registry
 * lookups within a session don't re-fetch the whole list.
 */
async function fetchAllAoriTokens(env: SdkEnvironment, signal?: AbortSignal): Promise<TokenMetadata[]> {
  const base = env.getAoriApiUrl().replace(/\/$/, '');
  const cached = tokensCache.get(base);
  if (cached && Date.now() - cached.at < TOKENS_TTL_MS) return cached.tokens;

  const url = `${base}/tokens?metadata=true`;
  const response = await fetch(url, {
    headers: env.getAoriHeaders(),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Aori tokens: ${response.status} ${response.statusText}`);
  }
  const raw: AoriTokenMetadata[] = await response.json();
  const tokens = (Array.isArray(raw) ? raw : [])
    .filter((t) => t != null && typeof t.chainId === 'number' && typeof t.address === 'string')
    .map(mapAoriToken);
  tokensCache.set(base, { at: Date.now(), tokens });
  return tokens;
}

/** Aori token metadata, optionally filtered by chain / free-text term. */
export async function getAoriTokens(env: SdkEnvironment, params: GetTokensParams = {}): Promise<TokenMetadata[]> {
  const all = await fetchAllAoriTokens(env, params.signal);
  const term = params.term?.trim().toLowerCase();
  return all.filter((t) => {
    if (params.chainId != null && t.chainId !== params.chainId) return false;
    if (term) {
      const hay = `${t.symbol} ${t.name} ${t.address}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

/**
 * Resolve a single token's USD price from the Aori registry. Returns `null`
 * when the token isn't in Aori's list (e.g. a Relay-only token).
 */
export async function getAoriTokenPrice(
  env: SdkEnvironment,
  { chainId, address, signal }: GetTokenPriceParams,
): Promise<number | null> {
  const tokens = await fetchAllAoriTokens(env, signal);
  const addr = address.toLowerCase();
  const match = tokens.find((t) => t.chainId === chainId && t.address.toLowerCase() === addr);
  return match?.price != null ? match.price : null;
}
