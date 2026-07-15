'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { waitForTransactionReceipt } from '@wagmi/core';
import { erc20Abi, parseEventLogs } from 'viem';
import { useConfig, useWriteContract } from 'wagmi';

export interface ApproveTokenParams {
  tokenAddress: `0x${string}`;
  chainId: number;
  spenderAddress: `0x${string}`;
  accountAddress: `0x${string}`;
  allowanceRaw: string;
}

export interface ApproveTokenResult {
  success: boolean;
  hash: `0x${string}`;
}

/**
 * ERC20 approval mutation. Executes approve, waits for 2 confirmations,
 * verifies the Approval event, then optimistically updates + invalidates the
 * allowance cache. Mirrors aori-ui's useApproval.
 */
export function useApproval() {
  const queryClient = useQueryClient();
  const wagmiConfig = useConfig();
  const { writeContractAsync } = useWriteContract();

  return useMutation<ApproveTokenResult, Error, ApproveTokenParams>({
    mutationFn: async ({ tokenAddress, chainId, spenderAddress, accountAddress, allowanceRaw }) => {
      const hash = await writeContractAsync({
        chainId,
        address: tokenAddress,
        account: accountAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spenderAddress, BigInt(allowanceRaw)],
      } as any);

      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        confirmations: 2,
        hash,
        chainId,
      });

      if (receipt.status !== 'success') {
        throw new Error('Approval transaction did not get successful receipt');
      }

      const approvalEvent = parseEventLogs({ abi: erc20Abi, logs: receipt.logs }).find(
        (event) => event.eventName === 'Approval',
      );
      if (!approvalEvent) {
        throw new Error(`Token ${tokenAddress} approval for spend by ${spenderAddress} failed`);
      }

      return { success: true, hash };
    },

    onSuccess: (_, variables) => {
      const { chainId, tokenAddress, accountAddress, spenderAddress, allowanceRaw } = variables;
      const bigIntAllowance = BigInt(allowanceRaw);

      queryClient.setQueryData(
        ['allowance', chainId, tokenAddress, accountAddress, spenderAddress],
        {
          allowanceRaw: bigIntAllowance > 0n ? allowanceRaw : '0',
          hasAllowance: bigIntAllowance > 0n,
          chainId,
          tokenAddress,
          accountAddress,
          spenderAddress,
        },
      );

      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ['allowance', chainId, tokenAddress, accountAddress, spenderAddress],
        });
      }, 500);
    },
  });
}
