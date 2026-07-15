'use client';

import { getChainConfig, type SupportedChainId } from '../internal';
import { useMutation } from '@tanstack/react-query';
import { waitForTransactionReceipt } from '@wagmi/core';
import { wethAbi } from 'abitype/abis';
import { useConfig, type useWriteContract } from 'wagmi';

export interface UnwrapTokenParams {
  chainId: SupportedChainId;
  accountAddress: `0x${string}`;
  amountRaw: bigint;
  writeContractAsync: ReturnType<typeof useWriteContract>['writeContractAsync'];
}

export function useUnwrapToken() {
  const wagmiConfig = useConfig();
  return useMutation({
    mutationFn: async ({ chainId, accountAddress, amountRaw, writeContractAsync }: UnwrapTokenParams) => {
      const chainConfig = getChainConfig(chainId);
      if (!chainConfig) throw new Error(`No wrapping contract for chain ${chainId}`);

      const wNativeAddress = chainConfig.wrappedAsset.address as `0x${string}`;

      const hash = await writeContractAsync({
        abi: wethAbi,
        functionName: 'withdraw',
        address: wNativeAddress,
        account: accountAddress,
        args: [amountRaw],
        chainId,
      } as any); /* wagmi v2 chainId literal type mismatch */

      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash, chainId, confirmations: 1, pollingInterval: 4_000,
      });

      if (receipt.status !== 'success') {
        throw new Error('Unwrap transaction did not get successful receipt');
      }

      return { success: true, hash };
    },
  });
}
