/**
 * React Query hooks for balance data
 *
 * Main hooks:
 * - useBulkBalances() - All wallet balances for multiple chains
 * - useTokenBalance() - Single token balance
 * - useInvalidateBalances() - Cache invalidation utilities
 */

import {
  type UseQueryOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { formatUnits } from 'viem';
import { getChainConfig, isGasToken } from '../../chainsConfig';
import type { Asset } from '../../types';
import { useTokenData } from '../tokens/hooks';
import {
  type WalletBalanceItem,
  type WalletBalanceResponse,
  fetchBulkBalances,
  fetchSwapBalances,
  fetchTokenBalance,
} from './queryFunctions';
import { balanceKeys } from './queryKeys';

const EMPTY_BALANCES: EnrichedBalance[] = [];

function formatTokenBalance(
  balances: WalletBalanceItem[] | undefined,
  token: { chainId: number; address: string; decimals?: number } | null | undefined,
  getToken: (chainId: number, address: string) => Asset | undefined,
): { raw: string; formatted: string } {
  if (!token || !balances) return { raw: '0', formatted: '0' };

  const item = balances.find(
    (b) =>
      b.chainId === token.chainId &&
      b.token.toLowerCase() === token.address.toLowerCase(),
  );
  if (!item) return { raw: '0', formatted: '0' };

  const resolved = getToken(token.chainId, token.address);
  const tokenDecimals = resolved?.decimals ?? token.decimals;
  const isGas = isGasToken({ address: token.address, chainId: token.chainId } as Asset);
  const chainConfig = isGas ? getChainConfig(token.chainId) : null;
  if (isGas && !chainConfig) return { raw: '0', formatted: '0' };
  const decimals = isGas ? chainConfig!.gasToken.decimals : tokenDecimals;

  let formatted = '0';
  if (decimals !== undefined) {
    try {
      if (item.balance && item.balance !== '0') {
        formatted = formatUnits(BigInt(item.balance), decimals);
      }
    } catch {
      /* skip format errors */
    }
  }

  return { raw: item.balance, formatted };
}

export interface EnrichedBalance {
  address: string;
  chainId: number;
  balance: string;
  formatted: string;
  decimals: number;
  lastUpdated: number;
  assetInfo: Asset | null;
}

// =======================
// WALLET BALANCES
// =======================

/**
 * Fetch bulk balances for multiple chains
 * Used for: Portfolio view, swap form, account panel
 */
export function useBulkBalances(
  address: string | null | undefined,
  chainIds: number[],
  options?: Omit<
    UseQueryOptions<WalletBalanceResponse, Error>,
    'queryKey' | 'queryFn'
  >,
  supportedTokens?: Array<{ chainId: number; address: string }>,
) {
  const { getToken, tokenRegistry } = useTokenData();

  const tokensByChain = useMemo(() => {
    const map: Record<number, string[]> = {};
    const supportedSet = supportedTokens?.length
      ? new Set(supportedTokens.map((t) => `${t.chainId}-${t.address.toLowerCase()}`))
      : null;
    for (const chainId of chainIds) {
      map[chainId] = (tokenRegistry ?? [])
        .filter((t) => t.chainId === chainId)
        .filter((t) => !supportedSet || supportedSet.has(`${t.chainId}-${t.address.toLowerCase()}`))
        .map((t) => t.address);
    }
    return map;
  }, [tokenRegistry, chainIds, supportedTokens]);

  const queryResult = useQuery({
    queryKey: balanceKeys.bulk(address ?? '', chainIds),
    queryFn: () => fetchBulkBalances(address!, chainIds, tokensByChain),
    enabled: !!address && chainIds.length > 0 && (tokenRegistry ?? []).length > 0,
    refetchInterval: false,
    staleTime: 1_800_000,
    ...options,
  });

  const enrichedBalances = useMemo(() => {
    if (!queryResult.data?.balances) return EMPTY_BALANCES;

    return queryResult.data.balances
      .map((balance) => {
        const token = getToken(balance.chainId, balance.token);

        const isGas = isGasToken({
          address: balance.token,
          chainId: balance.chainId,
        } as Asset);

        const assetInfo = token || (isGas ? null : null);

        if (!assetInfo || assetInfo.decimals === undefined) {
          return null;
        }

        let formatted = '0';
        const gasChainConfig = isGas ? getChainConfig(balance.chainId) : null;
        if (isGas && !gasChainConfig) return null;
        const decimals = isGas
          ? gasChainConfig!.gasToken.decimals
          : assetInfo.decimals;

        try {
          if (balance.balance && balance.balance !== '0') {
            formatted = formatUnits(BigInt(balance.balance), decimals);
          }
        } catch {
          // fallback to '0' formatted value
        }

        return {
          address: balance.token,
          chainId: balance.chainId,
          balance: balance.balance,
          formatted,
          decimals,
          lastUpdated: Date.now(),
          assetInfo,
        } as EnrichedBalance;
      })
      .filter((b): b is EnrichedBalance => b !== null);
  }, [queryResult.data?.balances, getToken]);

  return {
    data: queryResult.data,
    balances: enrichedBalances,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

/**
 * Fetch single token balance
 * Used for: Individual token lookups
 */
export function useTokenBalance(
  address: string | null | undefined,
  chainId: number | null | undefined,
  tokenAddress: string | null | undefined,
  options?: Omit<
    UseQueryOptions<WalletBalanceItem | null, Error>,
    'queryKey' | 'queryFn' | 'enabled'
  >,
) {
  return useQuery({
    queryKey: balanceKeys.token(
      address ?? '',
      chainId ?? 0,
      tokenAddress ?? '',
    ),
    queryFn: () => fetchTokenBalance(address!, chainId!, tokenAddress!),
    enabled: !!address && !!chainId && !!tokenAddress,
    refetchInterval: false,
    staleTime: 1_800_000,
    ...options,
  });
}

/**
 * Fetch balances for the 2 selected swap tokens only.
 */
export function useSwapBalances(
  address: string | null | undefined,
  baseToken:
    | { chainId: number; address: string; decimals?: number }
    | null
    | undefined,
  quoteToken:
    | { chainId: number; address: string; decimals?: number }
    | null
    | undefined,
  options?: Omit<
    UseQueryOptions<WalletBalanceResponse, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  const { getToken } = useTokenData();
  const queryClient = useQueryClient();

  const queryResult = useQuery({
    queryKey: balanceKeys.swap(
      address ?? '',
      baseToken?.chainId ?? 0,
      baseToken?.address ?? '',
      quoteToken?.chainId ?? 0,
      quoteToken?.address ?? '',
    ),
    queryFn: () => {
      const allBulkQueries = queryClient.getQueriesData<WalletBalanceResponse>({
        queryKey: [...balanceKeys.all, address?.toLowerCase() ?? '', 'bulk'],
      });

      for (const [, bulkData] of allBulkQueries) {
        if (!bulkData?.balances?.length) continue;

        const tokensNeeded = [baseToken, quoteToken].filter(Boolean);
        const found: typeof bulkData.balances = [];

        for (const token of tokensNeeded) {
          if (!token) continue;
          const match = bulkData.balances.find(
            (b) =>
              b.chainId === token.chainId &&
              b.token.toLowerCase() === token.address.toLowerCase(),
          );
          if (match) found.push(match);
        }

        if (found.length === tokensNeeded.length) {
          return { balances: found } as WalletBalanceResponse;
        }
      }

      const tokens: Array<{ chainId: number; tokenAddress: string }> = [];
      if (baseToken)
        tokens.push({
          chainId: baseToken.chainId,
          tokenAddress: baseToken.address,
        });
      if (quoteToken)
        tokens.push({
          chainId: quoteToken.chainId,
          tokenAddress: quoteToken.address,
        });
      return fetchSwapBalances(address!, tokens);
    },
    enabled: !!address && (!!baseToken || !!quoteToken),
    refetchInterval: false,
    staleTime: 55_000,
    ...options,
  });

  const baseBalance = useMemo(
    () => formatTokenBalance(queryResult.data?.balances, baseToken, getToken),
    [queryResult.data?.balances, baseToken, getToken],
  );

  const quoteBalance = useMemo(
    () => formatTokenBalance(queryResult.data?.balances, quoteToken, getToken),
    [queryResult.data?.balances, quoteToken, getToken],
  );

  return {
    baseBalance,
    quoteBalance,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

// =======================
// CACHE INVALIDATION
// =======================

/**
 * Hook for invalidating balance caches
 */
export function useInvalidateBalances() {
  const queryClient = useQueryClient();

  return {
    invalidateUser: (address: string) => {
      queryClient.refetchQueries({
        queryKey: balanceKeys.user(address),
      });
    },

    invalidateToken: (
      address: string,
      chainId: number,
      tokenAddress: string,
    ) => {
      queryClient.refetchQueries({
        queryKey: balanceKeys.token(address, chainId, tokenAddress),
      });

      queryClient.refetchQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key[0] === 'balances' &&
            key[1] === address &&
            key[2] === 'bulk' &&
            typeof key[3] === 'string' &&
            key[3].split(',').includes(chainId.toString())
          );
        },
      });
    },

    invalidateBulk: (address: string, chainIds: number[]) => {
      queryClient.refetchQueries({
        queryKey: balanceKeys.bulk(address, chainIds),
      });
    },

    invalidateContracts: () => {
      queryClient.invalidateQueries({
        queryKey: [...balanceKeys.all, 'contracts'],
      });
    },

    invalidateAll: () => {
      queryClient.invalidateQueries({
        queryKey: balanceKeys.all,
      });
    },

    removeAll: () => {
      queryClient.removeQueries({
        queryKey: balanceKeys.all,
      });
    },
  };
}
