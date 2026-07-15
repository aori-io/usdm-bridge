import {
  type Address,
  type Hash,
  type WalletClient,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
} from 'viem';
import { sendTransaction } from 'viem/actions';
import type { SdkEnvironment } from '../api/environment';
import { getPublicClient } from './publicClients';
import { type SwapWalletClient } from './walletClient';

export interface EnsureApprovalParams {
  /** ERC20 token being spent (the quote's input token). */
  tokenAddress: string;
  /** The Aori settlement contract for the input chain. */
  spender: string;
  /** Minimum allowance required (the quote's input amount). */
  amount: bigint;
  /** Token owner (the offerer / user address). */
  ownerAddress: string;
  /** Chain the token/allowance lives on. */
  chainId: number;
  walletClient: SwapWalletClient;
  env: SdkEnvironment;
  onTxHash?: (hash: Hash, kind: 'approval-reset' | 'approval') => void;
}

/**
 * Ensures the Aori settlement contract has sufficient ERC20 allowance to pull
 * the input token. Reads the current allowance; if it's short, resets to 0 for
 * USDT-style tokens that require it, then approves `maxUint256` so future trades
 * never re-prompt. Waits for each approval receipt.
 *
 * Returns `{ sent }` — `false` when the existing allowance already covered the
 * amount (no transaction was sent).
 */
export async function ensureApproval(params: EnsureApprovalParams): Promise<{ sent: boolean }> {
  const { tokenAddress, spender, amount, ownerAddress, chainId, walletClient, env, onTxHash } = params;

  const publicClient = getPublicClient(env, chainId);

  const currentAllowance = (await publicClient.readContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [ownerAddress as Address, spender as Address],
  })) as bigint;

  if (currentAllowance >= amount) return { sent: false };

  const baseTx = {
    account: ownerAddress as Address,
    chain: walletClient.chain ?? null,
    to: tokenAddress as Address,
    value: 0n,
  } as const;

  if (currentAllowance > 0n) {
    const resetData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender as Address, 0n],
    });
    const resetHash = await sendTransaction(walletClient as WalletClient, { ...baseTx, data: resetData });
    onTxHash?.(resetHash, 'approval-reset');
    await publicClient.waitForTransactionReceipt({ hash: resetHash });
  }

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender as Address, maxUint256],
  });
  const approveHash = await sendTransaction(walletClient as WalletClient, { ...baseTx, data: approveData });
  onTxHash?.(approveHash, 'approval');
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  return { sent: true };
}
