/**
 * Query key factory for balance queries
 * Provides type-safe, consistent cache keys
 *
 * Pattern:
 * - ['balances'] - all balance-related queries
 * - ['balances', address] - all balances for a user
 * - ['balances', address, chainId, tokenAddress] - specific token balance
 * - ['balances', address, 'bulk', chainIds] - bulk balance for chains
 */

export const balanceKeys = {
  all: ['balances'] as const,

  user: (address: string) =>
    [...balanceKeys.all, address.toLowerCase()] as const,

  token: (address: string, chainId: number, tokenAddress: string) =>
    [
      ...balanceKeys.user(address),
      chainId,
      tokenAddress.toLowerCase(),
    ] as const,

  bulk: (address: string, chainIds: number[]) =>
    [
      ...balanceKeys.user(address),
      'bulk',
      [...chainIds].sort((a, b) => a - b).join(','),
    ] as const,

  swap: (
    address: string,
    baseChainId: number,
    baseTokenAddress: string,
    quoteChainId: number,
    quoteTokenAddress: string,
  ) => {
    const tokenA = `${baseChainId}:${baseTokenAddress.toLowerCase()}`;
    const tokenB = `${quoteChainId}:${quoteTokenAddress.toLowerCase()}`;
    const sorted = [tokenA, tokenB].sort();
    return [...balanceKeys.user(address), 'swap', sorted[0], sorted[1]] as const;
  },
};
