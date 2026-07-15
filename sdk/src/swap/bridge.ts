import type { Hash } from 'viem';
import type { OrderStatus, QuoteResponse } from '@aori/aori-ts';
import { type PollOrderStatusOptions, isSuccessStatus, pollOrderStatus } from '../api/status';
import {
  type ExecuteSwapContext,
  type ExecuteSwapParams,
  type ExecutionStep,
  executeSwap,
} from './execute';
import type { SwapWalletClient } from './walletClient';

/**
 * One-shot end-to-end bridge result. Includes everything an integrator needs to
 * render a "done" screen, fire analytics, or trigger downstream side effects.
 */
export interface BridgeResult {
  quote: QuoteResponse;
  orderHash: string;
  txHashes: Hash[];
  signature?: string;
  /** Final terminal status from `pollStatus`. */
  status: OrderStatus;
  /** Semantic outcome derived from `status.status`. */
  outcome: 'success' | 'failure';
  /** Settlement tx hash / explorer URL, when present on the terminal status. */
  txHash?: string;
  txUrl?: string;
  isNativeDeposit: boolean;
  depositChainBlockTimeMs: number;
}

export interface BridgeParams {
  quote: QuoteResponse;
  walletClient: SwapWalletClient;
  /** Defaults to `walletClient.account.address`. */
  userAddress?: string;

  /** Per-execution-stage progress hook (chain switch, approval, signing, deposit, …). */
  onStep?: (step: ExecutionStep) => void;
  /** Fired on every TRANSACTION hash (approvals + native deposit). */
  onTxHash?: ExecuteSwapParams['onTxHash'];
  /** Forwarded to `pollStatus`. Fired whenever the order status string changes. */
  onStatusChange?: (status: OrderStatus) => void;

  /** Fired once when the order settles successfully (`completed`). Awaited. */
  onSuccess?: (result: BridgeResult) => void | Promise<void>;
  /** Fired once when the order ends unsuccessfully (`failed` / `cancelled`). Awaited. */
  onFailure?: (result: BridgeResult) => void | Promise<void>;
  /** Fired once on any terminal state, after `onSuccess`/`onFailure`. Awaited. */
  onSettled?: (result: BridgeResult) => void | Promise<void>;

  /** Optional staleness check called before submit/deposit. */
  validateBeforeSubmit?: ExecuteSwapParams['validateBeforeSubmit'];
  /** When true, skips the implicit chain switch to the input chain. */
  skipChainSwitch?: boolean;
  abortSignal?: AbortSignal;

  /**
   * Override the default deposit-chain settle delay. For native deposits the
   * default is `2 * depositChainBlockTimeMs` between the deposit tx and the
   * first `pollStatus` call. Set to `0` to disable.
   */
  depositSettleDelayMs?: number;

  /** Pass-through tuning for the underlying `pollStatus` call. */
  pollOptions?: Pick<PollOrderStatusOptions, 'interval' | 'timeout'>;
}

/**
 * Sleep that resolves early if the provided AbortSignal fires.
 */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Bridge aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Bridge aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * One-shot end-to-end bridge: `executeSwap` → optional deposit-settle delay →
 * `pollStatus` → classify outcome → fire `onSuccess`/`onFailure`/`onSettled` →
 * resolve with a single `BridgeResult`.
 *
 * Resolves regardless of outcome (`outcome: 'success' | 'failure'`). Only actual
 * errors (network, user-rejected signing, hook throws, abort) reject.
 */
export async function bridge(
  params: BridgeParams,
  ctx: ExecuteSwapContext,
): Promise<BridgeResult> {
  const {
    quote,
    walletClient,
    userAddress,
    onStep,
    onTxHash,
    onStatusChange,
    onSuccess,
    onFailure,
    onSettled,
    validateBeforeSubmit,
    skipChainSwitch,
    abortSignal,
    depositSettleDelayMs,
    pollOptions,
  } = params;

  const executeResult = await executeSwap(
    {
      quote,
      walletClient,
      ...(userAddress ? { userAddress } : {}),
      ...(onStep ? { onStep } : {}),
      ...(onTxHash ? { onTxHash } : {}),
      ...(validateBeforeSubmit ? { validateBeforeSubmit } : {}),
      ...(skipChainSwitch ? { skipChainSwitch } : {}),
      ...(abortSignal ? { abortSignal } : {}),
    },
    ctx,
  );

  const settleDelay =
    depositSettleDelayMs ?? (executeResult.isNativeDeposit ? 2 * executeResult.depositChainBlockTimeMs : 0);
  if (settleDelay > 0) {
    await abortableSleep(settleDelay, abortSignal);
  }

  const status = await pollOrderStatus(executeResult.orderHash, ctx.aori, {
    ...(pollOptions ?? {}),
    ...(abortSignal ? { signal: abortSignal } : {}),
    ...(onStatusChange ? { onStatusChange } : {}),
  });

  const outcome: BridgeResult['outcome'] = isSuccessStatus(status.status) ? 'success' : 'failure';
  const txHash = (status as { txHash?: string }).txHash;
  const txUrl = (status as { txUrl?: string }).txUrl;

  const result: BridgeResult = {
    quote,
    orderHash: executeResult.orderHash,
    txHashes: executeResult.txHashes,
    ...(executeResult.signature ? { signature: executeResult.signature } : {}),
    status,
    outcome,
    ...(txHash ? { txHash } : {}),
    ...(txUrl ? { txUrl } : {}),
    isNativeDeposit: executeResult.isNativeDeposit,
    depositChainBlockTimeMs: executeResult.depositChainBlockTimeMs,
  };

  if (outcome === 'success') {
    await onSuccess?.(result);
  } else {
    await onFailure?.(result);
  }
  await onSettled?.(result);

  return result;
}
