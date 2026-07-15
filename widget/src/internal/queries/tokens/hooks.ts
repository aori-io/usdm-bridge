/**
 * React Query hooks for token data
 *
 * Main hooks:
 * - useTokenRegistry() - Full token list
 * - useTokenPrice() - Single token price from cached registry
 * - useTokenData() - Token registry with helper methods
 * - useTokenWithFallback() - Registry lookup only (no pricemaster fallback)
 * - useSupportedTokensWithPricing() - Filtered tokens by chain
 * - useInvalidateTokens() - Cache invalidation utilities
 */

import {
  type UseQueryOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { Asset } from '../../types';
import { isRelayConfigured } from '../../environment';
import { getWidgetSdk } from '../../client/sdk';
import { fetchRelayTokensForChain, fetchTokenRegistry } from './queryFunctions';
import { tokenKeys } from './queryKeys';

const EMPTY_TOKENS: Asset[] = [];

// =======================
// REGISTRY QUERIES
// =======================

/**
 * Fetch all tokens from registry
 * Use for: Token selection menus, full token lists
 */
export function useTokenRegistry(
  chainId?: number,
  options?: Omit<UseQueryOptions<Asset[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: tokenKeys.registry(chainId),
    queryFn: ({ signal }) => fetchTokenRegistry(chainId, signal),
    staleTime: 55000,
    refetchInterval: 60000,
    retry: 1,
    refetchIntervalInBackground: false,
    ...options,
  });
}

// =======================
// INDIVIDUAL TOKEN QUERIES
// =======================

/**
 * Get single token price from registry cache
 * Use for: Token displays, price lookups
 *
 * NOTE: Reads from cached registry (no additional API call)
 */
export function useTokenPrice(
  address: string | null | undefined,
  chainId: number | null | undefined,
) {
  const { data: tokens = EMPTY_TOKENS } = useTokenRegistry();

  const token = useMemo(() => {
    if (!address || !chainId) return undefined;

    return tokens.find(
      (t) =>
        t &&
        t.address &&
        t.chainId === chainId &&
        t.address.toLowerCase() === address.toLowerCase(),
    );
  }, [tokens, address, chainId]);

  return { data: token, isLoading: false, error: undefined };
}

/**
 * IMPORTANT PATTERN:
 * Fetch single token price with granular pricemaster API call.
 * Use for: Active swap pair tokens that need frequent updates ONLY DURING during quoting.
 *
 * Behavior:
 * - On token selection: returns registry-cached price (NO pricemaster fetch)
 * - During quoting: RfqContext invalidates this key → pricemaster fetch fires
 * - After quoting stops: cached pricemaster price persists (staleTime: Infinity) - refetched lazily by RfqContext.
 *
 * How it works: The query cache is pre-seeded from the token registry. Since
 * staleTime is Infinity and refetchOnMount is false, React Query uses the
 * cached registry data without fetching. Only explicit invalidation from
 * RfqContext triggers a pricemaster fetch.
 */
export function useTokenPriceWithRefetch(
  address: string | null | undefined,
  chainId: number | null | undefined,
  options?: Omit<UseQueryOptions<Asset, Error>, 'queryKey' | 'queryFn'>,
) {
  const queryClient = useQueryClient();

  if (address && chainId) {
    const key = tokenKeys.price(chainId, address);
    const existing = queryClient.getQueryData(key);
    if (!existing) {
      const registry = queryClient.getQueryData<Asset[]>(
        tokenKeys.registries(),
      );
      if (registry) {
        const fromRegistry = registry.find(
          (t) =>
            t.chainId === chainId &&
            t.address.toLowerCase() === address.toLowerCase(),
        );
        // Only seed a positively-priced registry entry. Tokens missing a price
        // (e.g. Relay-only tokens absent from the Aori registry, or priced 0)
        // fall through to the on-demand SDK price resolution below.
        if (fromRegistry && (fromRegistry.price ?? 0) > 0) {
          queryClient.setQueryData(key, fromRegistry);
        }
      }
    }
  }

  return useQuery({
    queryKey: tokenKeys.price(chainId ?? 0, address ?? ''),
    queryFn: async ({ signal }) => {
      const registry = queryClient.getQueryData<Asset[]>(
        tokenKeys.registries(),
      );
      const match = registry?.find(
        (t) =>
          t.chainId === chainId &&
          t.address.toLowerCase() === address!.toLowerCase(),
      );
      if (match && (match.price ?? 0) > 0) return match;

      // No known price yet — resolve on demand across venues (Aori registry,
      // then Relay's dedicated price endpoint). This is what populates the USD
      // value for tokens only some venues support (e.g. Relay-only tokens).
      try {
        const price = await getWidgetSdk().getTokenPrice({
          chainId: chainId!,
          address: address!,
          signal,
        });
        if (price != null && price > 0) {
          const base: Asset =
            match ??
            ({
              symbol: '',
              address: address!,
              chainId: chainId as Asset['chainId'],
              name: '',
              decimals: 18,
              price: 0,
            } satisfies Asset);
          return { ...base, price };
        }
      } catch {
        // Ignore and fall back to whatever we have.
      }

      if (match) return match;
      throw new Error(`Token not found in registry: ${chainId}:${address}`);
    },
    enabled: !!address && !!chainId,
    staleTime: Infinity,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    ...options,
  });
}

// =======================
// COMPOSITE HOOKS
// =======================

/**
 * Hook that returns token from registry. Unknown tokens return undefined — no fallback for now..
 *
 * Flow:
 * 1. Wait for registry to finish loading (bulk /tokens?metadata=true)
 * 2. Check registry cache with O(1) Map lookup
 * 3. Return undefined if token not found — no fallback fetch for now
 */
export function useTokenWithFallback(
  address: string | null | undefined,
  chainId: number | null | undefined,
) {
  const { getToken, isLoadingRegistry } = useTokenData();

  const registryToken = useMemo(() => {
    if (!address || !chainId) return undefined;
    return getToken(chainId, address);
  }, [getToken, address, chainId]);

  return {
    token: registryToken,
    isLoading: isLoadingRegistry,
    isError: false,
    error: undefined,
  };
}

/**
 * Hook providing full token data utilities
 * Uses Map for O(1) lookups
 */
export function useTokenData() {
  const { data, isLoading, error } = useTokenRegistry();

  const tokens = data ?? EMPTY_TOKENS;

  const tokenMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const token of tokens) {
      if (token && token.address && token.chainId) {
        const key = `${token.chainId}-${token.address.toLowerCase()}`;
        map.set(key, token);
      }
    }
    return map;
  }, [tokens]);

  const getToken = useCallback(
    (chainId: number, address: string): Asset | undefined => {
      if (!address || !chainId) return undefined;
      const key = `${chainId}-${address.toLowerCase()}`;
      return tokenMap.get(key);
    },
    [tokenMap],
  );

  const searchTokens = useCallback(
    (searchTerm: string): Asset[] => {
      if (!searchTerm) return tokens;

      const term = searchTerm.toLowerCase();
      return tokens.filter(
        (token) =>
          token &&
          token.symbol &&
          token.name &&
          token.address &&
          (token.symbol.toLowerCase().includes(term) ||
            token.name.toLowerCase().includes(term) ||
            token.address.toLowerCase().includes(term)),
      );
    },
    [tokens],
  );

  const getTokensByChain = useCallback(
    (chainId: number): Asset[] => {
      return tokens.filter((token) => token && token.chainId === chainId);
    },
    [tokens],
  );

  return {
    tokens,
    tokenRegistry: tokens,

    getToken,
    searchTokens,
    getTokensByChain,

    isLoading,
    isLoadingRegistry: isLoading,
    isInitialLoading: isLoading,
    error,
  };
}

/**
 * Fetch Relay-supported tokens for a single chain, on demand. Disabled when
 * Relay isn't configured or no specific chain is selected. Cached aggressively
 * since Relay's per-chain token set is effectively static within a session.
 */
export function useRelayTokensForChain(chainId: number | null) {
  const enabled = isRelayConfigured() && typeof chainId === 'number' && chainId > 0;
  return useQuery({
    queryKey: tokenKeys.relay(chainId ?? 0),
    queryFn: ({ signal }) => fetchRelayTokensForChain(chainId as number, signal),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for getting tokens filtered by chain
 * Use for: Token selection menus with chain filtering
 *
 * When Relay is configured and a specific chain is selected, Relay's token set
 * for that chain is merged in (Aori entries win on address collisions), giving
 * the union of both venues' supported tokens.
 */
export function useSupportedTokensWithPricing(chainId: number | 'all') {
  const { tokens, isLoading, error } = useTokenData();
  const relayChainId = chainId === 'all' ? null : chainId;
  const { data: relayTokens = EMPTY_TOKENS, isLoading: relayLoading } =
    useRelayTokensForChain(relayChainId);

  const enrichedTokens = useMemo(() => {
    const base = chainId === 'all' ? tokens : tokens.filter((t) => t && t.chainId === chainId);
    if (relayTokens.length === 0) return base;

    const seen = new Set(
      base.map((t) => `${t.chainId}-${t.address.toLowerCase()}`),
    );
    const additions = relayTokens.filter(
      (t) => !seen.has(`${t.chainId}-${t.address.toLowerCase()}`),
    );
    return additions.length > 0 ? [...base, ...additions] : base;
  }, [tokens, chainId, relayTokens]);

  return {
    enrichedTokens,
    isLoading: isLoading || relayLoading,
    error,
  };
}

// =======================
// CACHE INVALIDATION
// =======================

/**
 * Hook for invalidating token caches
 */
export function useInvalidateTokens() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: tokenKeys.all });
    },

    invalidateRegistry: () => {
      queryClient.invalidateQueries({ queryKey: tokenKeys.registries() });
    },

    invalidateToken: (chainId: number, address: string) => {
      queryClient.invalidateQueries({
        queryKey: tokenKeys.price(chainId, address),
      });
    },
  };
}
