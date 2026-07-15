'use client';

import { getClient } from '../internal';
import { useQuery } from '@tanstack/react-query';
import { erc20Abi, formatUnits } from 'viem';

export interface UseAllowanceParams {
  tokenAddress: string | undefined;
  chainId: number | undefined;
  accountAddress: string | undefined;
  spenderAddress: string | undefined;
  decimals: number | undefined;
  enabled?: boolean;
  pollingInterval?: number;
}

export interface AllowanceResult {
  allowanceRaw: string;
  allowanceFormatted: string;
  hasAllowance: boolean;
  chainId: number;
  tokenAddress: string;
  accountAddress: string;
  spenderAddress: string;
}

/**
 * Reads an ERC20 allowance directly on-chain via the widget's viem client.
 * Mirrors aori-ui's useAllowance but skips the server proxy.
 */
export function useAllowance({
  tokenAddress,
  chainId,
  accountAddress,
  spenderAddress,
  decimals,
  enabled = true,
  pollingInterval = 0,
}: UseAllowanceParams) {
  return useQuery<AllowanceResult>({
    queryKey: ['allowance', chainId, tokenAddress, accountAddress, spenderAddress],
    queryFn: async () => {
      if (!tokenAddress || !chainId || !accountAddress || !spenderAddress || decimals == null) {
        throw new Error('Missing required parameters for allowance check');
      }

      const client = getClient(chainId);
      const allowance = (await (client as any).readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [accountAddress as `0x${string}`, spenderAddress as `0x${string}`],
      })) as bigint;

      const allowanceRaw = allowance.toString();

      return {
        allowanceRaw,
        allowanceFormatted: formatUnits(allowance, decimals),
        hasAllowance: allowance > 0n,
        chainId,
        tokenAddress,
        accountAddress,
        spenderAddress,
      };
    },
    enabled:
      enabled &&
      !!tokenAddress &&
      !!chainId &&
      !!accountAddress &&
      !!spenderAddress &&
      decimals != null,
    staleTime: 900_000,
    refetchInterval: pollingInterval || false,
  });
}
