import type {
  AggregatedStatus,
  ExecuteQuoteParams,
  NormalizedQuote,
  PollAggregatedStatusOptions,
  Venue,
  VenueId,
} from '../venues/types';

export interface BridgeQuoteParams extends ExecuteQuoteParams {
  /** Forwarded to `pollStatus`. Fired whenever the normalized status changes. */
  onStatusChange?: (status: AggregatedStatus) => void;
  /** Fired once when the swap settles successfully (`completed`). Awaited. */
  onSuccess?: (result: BridgeQuoteResult) => void | Promise<void>;
  /** Fired once when the swap ends unsuccessfully (`failed`/`cancelled`). Awaited. */
  onFailure?: (result: BridgeQuoteResult) => void | Promise<void>;
  /** Fired once on any terminal state, after `onSuccess`/`onFailure`. Awaited. */
  onSettled?: (result: BridgeQuoteResult) => void | Promise<void>;
  /** Pass-through tuning for the underlying status poll. */
  pollOptions?: Pick<PollAggregatedStatusOptions, 'interval' | 'timeout'>;
  /**
   * Delay (ms) between execution and the first status poll. Defaults to a small
   * settle window for native deposits, `0` otherwise.
   */
  settleDelayMs?: number;
}

export interface BridgeQuoteResult {
  venue: VenueId;
  quoteId: string;
  txHashes: string[];
  signature?: string;
  /** Final terminal normalized status. */
  status: AggregatedStatus;
  outcome: 'success' | 'failure';
  txHash?: string;
  txUrl?: string;
  isNativeDeposit: boolean;
}

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
      reject(new DOMException('Bridge aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * One-shot end-to-end bridge against a single venue: `executeQuote` → optional
 * settle delay → `pollStatus` → classify outcome → fire hooks. Resolves
 * regardless of outcome (`outcome: 'success' | 'failure'`); only real errors
 * (network, user-rejected signing, hook throws, abort) reject.
 */
export async function bridgeQuote(
  venue: Venue,
  quote: NormalizedQuote,
  params: BridgeQuoteParams,
): Promise<BridgeQuoteResult> {
  const execParams: ExecuteQuoteParams = {
    walletClient: params.walletClient,
    ...(params.userAddress != null ? { userAddress: params.userAddress } : {}),
    ...(params.onStep ? { onStep: params.onStep } : {}),
    ...(params.onTxHash ? { onTxHash: params.onTxHash } : {}),
    ...(params.validateBeforeSubmit ? { validateBeforeSubmit: params.validateBeforeSubmit } : {}),
    ...(params.skipChainSwitch ? { skipChainSwitch: params.skipChainSwitch } : {}),
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
    ...(params.solanaWallet ? { solanaWallet: params.solanaWallet } : {}),
  };

  const exec = await venue.executeQuote(quote, execParams);

  const settleDelay = params.settleDelayMs ?? (exec.isNativeDeposit ? 4_000 : 0);
  if (settleDelay > 0) await abortableSleep(settleDelay, params.abortSignal);

  const status = await venue.pollStatus(quote, {
    ...(params.pollOptions?.interval != null ? { interval: params.pollOptions.interval } : {}),
    ...(params.pollOptions?.timeout != null ? { timeout: params.pollOptions.timeout } : {}),
    ...(params.abortSignal ? { signal: params.abortSignal } : {}),
    ...(params.onStatusChange ? { onStatusChange: params.onStatusChange } : {}),
  });

  const outcome: BridgeQuoteResult['outcome'] = status.status === 'completed' ? 'success' : 'failure';

  const result: BridgeQuoteResult = {
    venue: exec.venue,
    quoteId: exec.quoteId,
    txHashes: exec.txHashes,
    ...(exec.signature ? { signature: exec.signature } : {}),
    status,
    outcome,
    ...(status.txHash ? { txHash: status.txHash } : {}),
    ...(status.txUrl ? { txUrl: status.txUrl } : {}),
    isNativeDeposit: exec.isNativeDeposit,
  };

  if (outcome === 'success') {
    await params.onSuccess?.(result);
  } else {
    await params.onFailure?.(result);
  }
  await params.onSettled?.(result);

  return result;
}
