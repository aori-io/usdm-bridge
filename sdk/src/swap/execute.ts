import { type Address, type Hash, type WalletClient } from 'viem';
import { sendTransaction } from 'viem/actions';
import type { Aori, QuoteResponse, TransactionResponse, TxExecutor } from '@aori/aori-ts';
import type { SdkEnvironment } from '../api/environment';
import { getChainConfig, keyToChainId } from '../chains/chainKeys';
import { QuoteStaleError } from '../errors';
import { submitSwap } from '../api/submit';
import { ChainSwitch } from './chainSwitch';
import { ensureApproval } from './steps';
import { signOrder } from './sign';
import { getPublicClient } from './publicClients';
import { type SwapWalletClient, resolveChainId } from './walletClient';

/** Stages reported via the `onStep` callback during `executeSwap`. */
export type ExecutionStep =
  | { kind: 'chain-switch'; chainId: number }
  | { kind: 'approval-skipped'; tokenAddress: string; chainId: number }
  | { kind: 'approval-reset-sent'; hash: Hash }
  | { kind: 'approval-sent'; hash: Hash }
  | { kind: 'signing' }
  | { kind: 'submitted'; orderHash: string; signature: string }
  | { kind: 'deposit-sent'; hash: Hash; chainId: number }
  | { kind: 'done'; orderHash: string };

export interface ExecuteSwapParams {
  quote: QuoteResponse;
  walletClient: SwapWalletClient;
  /** Defaults to `walletClient.account.address`. */
  userAddress?: string;
  /** Per-stage progress hook. */
  onStep?: (step: ExecutionStep) => void;
  /** Fired on every TRANSACTION hash (approvals + native deposit). */
  onTxHash?: (hash: Hash, kind: 'approval' | 'approval-reset' | 'deposit') => void;
  /**
   * Optional staleness check called right before the order is signed/submitted
   * (ERC20) or the deposit is sent (native). Returning `{ canSubmit: false }`
   * raises `QuoteStaleError`.
   */
  validateBeforeSubmit?: () => { canSubmit: boolean; reason?: string };
  /** When true, skips the implicit chain switch to the input chain. */
  skipChainSwitch?: boolean;
  abortSignal?: AbortSignal;
}

export interface ExecuteSwapResult {
  orderHash: string;
  /** Present for ERC20 swaps (the EIP-712 signature). */
  signature?: string;
  /** Approval tx hashes (ERC20) and/or the deposit tx hash (native). */
  txHashes: Hash[];
  /** True for native-token deposits (a deposit tx was sent). */
  isNativeDeposit: boolean;
  /**
   * Approximate block time of the input chain (ms). Use this to delay the first
   * `pollStatus` call after a native deposit.
   */
  depositChainBlockTimeMs: number;
}

export interface ExecuteSwapContext {
  env: SdkEnvironment;
  aori: Aori;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Swap execution aborted', 'AbortError');
  }
}

/**
 * Resolve the input chain ID for a quote: prefer the Aori chain registry
 * (authoritative for the current API), fall back to the SDK's static registry.
 */
function resolveInputChainId(aori: Aori, quote: QuoteResponse): number | undefined {
  const info = aori.getChain(quote.inputChain);
  return info?.chainId ?? keyToChainId(quote.inputChain);
}

/**
 * Executes an Aori swap headlessly, mirroring the widget's flow:
 *
 *   - ERC20:  ensure the Aori contract is approved → `signReadableOrder`
 *             (EIP-712) → `submitSwap`.
 *   - native: send the deposit transaction via `aori.executeSwap({ type:'native' })`.
 *
 * The wallet is switched to the input chain first (unless `skipChainSwitch`).
 */
export async function executeSwap(
  params: ExecuteSwapParams,
  ctx: ExecuteSwapContext,
): Promise<ExecuteSwapResult> {
  const { quote, walletClient, onStep, onTxHash, validateBeforeSubmit, skipChainSwitch, abortSignal } = params;
  const { env, aori } = ctx;

  const userAddress = params.userAddress || walletClient.account?.address;
  if (!userAddress) {
    throw new Error('userAddress is required (walletClient.account is missing)');
  }

  const inputChainId = resolveInputChainId(aori, quote);
  if (!inputChainId) {
    throw new Error(`Unknown input chain for quote: ${quote.inputChain}`);
  }

  const result: ExecuteSwapResult = {
    orderHash: quote.orderHash,
    txHashes: [],
    isNativeDeposit: false,
    depositChainBlockTimeMs: getChainConfig(inputChainId)?.blockTimeMs ?? 5_000,
  };

  // Ensure the wallet is on the input chain before approving / signing / depositing.
  if (!skipChainSwitch) {
    const currentChainId = await resolveChainId(walletClient);
    if (currentChainId !== inputChainId) {
      onStep?.({ kind: 'chain-switch', chainId: inputChainId });
      await ChainSwitch(walletClient, inputChainId);
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  checkAborted(abortSignal);

  if (aori.isNativeSwap(quote)) {
    // ── Native deposit ────────────────────────────────────────────────────
    if (validateBeforeSubmit) {
      const validation = validateBeforeSubmit();
      if (!validation.canSubmit) {
        throw new QuoteStaleError(validation.reason || 'Quote expired before deposit');
      }
    }

    const txExecutor: TxExecutor = {
      sendTransaction: async (req) => {
        const hash = await sendTransaction(walletClient as WalletClient, {
          account: userAddress as Address,
          chain: walletClient.chain ?? null,
          to: req.to as Address,
          data: (req.data || '0x') as `0x${string}`,
          value: BigInt(req.value || '0'),
        });
        return {
          hash,
          wait: () => getPublicClient(env, inputChainId).waitForTransactionReceipt({ hash }),
        };
      },
      estimateGas: (req) =>
        getPublicClient(env, inputChainId).estimateGas({
          account: userAddress as Address,
          to: req.to as Address,
          data: (req.data || '0x') as `0x${string}`,
          value: BigInt(req.value || '0'),
        }),
    };

    const txResponse = (await aori.executeSwap(quote, { type: 'native', txExecutor })) as TransactionResponse;
    if (!txResponse.success) {
      throw new Error(txResponse.error || 'Native deposit failed');
    }
    const hash = txResponse.txHash as Hash;
    result.isNativeDeposit = true;
    result.txHashes.push(hash);
    onTxHash?.(hash, 'deposit');
    onStep?.({ kind: 'deposit-sent', hash, chainId: inputChainId });
  } else {
    // ── ERC20: approve → sign → submit ───────────────────────────────────
    const spender = aori.getChain(quote.inputChain)?.address;
    if (!spender) {
      throw new Error(`No Aori settlement contract for chain: ${quote.inputChain}`);
    }

    const approval = await ensureApproval({
      tokenAddress: quote.inputToken,
      spender,
      amount: BigInt(quote.inputAmount),
      ownerAddress: userAddress,
      chainId: inputChainId,
      walletClient,
      env,
      onTxHash: (hash, kind) => {
        result.txHashes.push(hash);
        onTxHash?.(hash, kind);
        onStep?.(kind === 'approval-reset' ? { kind: 'approval-reset-sent', hash } : { kind: 'approval-sent', hash });
      },
    });
    if (!approval.sent) {
      onStep?.({ kind: 'approval-skipped', tokenAddress: quote.inputToken, chainId: inputChainId });
    }

    checkAborted(abortSignal);

    if (validateBeforeSubmit) {
      const validation = validateBeforeSubmit();
      if (!validation.canSubmit) {
        throw new QuoteStaleError(validation.reason || 'Quote expired before submission');
      }
    }

    onStep?.({ kind: 'signing' });
    const { orderHash, signature } = await signOrder({ quote, walletClient, userAddress, aori });

    await submitSwap({ orderHash, signature }, aori, abortSignal ? { signal: abortSignal } : {});

    result.orderHash = orderHash;
    result.signature = signature;
    onStep?.({ kind: 'submitted', orderHash, signature });
  }

  onStep?.({ kind: 'done', orderHash: result.orderHash });
  return result;
}
