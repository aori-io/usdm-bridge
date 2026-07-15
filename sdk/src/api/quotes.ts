import { parseUnits, getAddress } from 'viem';
import type { Aori, QuoteRequest, QuoteResponse } from '@aori/aori-ts';
import { chainIdToKey } from '../chains/chainKeys';
import { QuoteRequestError } from '../errors';

export interface RequestQuoteParams {
  srcChainId: number;
  dstChainId: number;
  srcTokenAddress: string;
  dstTokenAddress: string;
  /**
   * The amount the user wants to send on the source chain. Two forms:
   *  - `bigint`: raw on-chain units (e.g. `1_000_000n` = 1 USDC at 6 decimals).
   *    `srcTokenDecimals` is not required.
   *  - `string` or `number`: a human-readable decimal amount (e.g. `"1"`,
   *    `"1.5"`, `0.5`). `srcTokenDecimals` is REQUIRED and `parseUnits` is
   *    applied. `"1"` and `"1.0"` are equivalent.
   *
   * To avoid ambiguity, digit-only strings are NOT treated as raw units. If
   * you have raw units in a string, convert to bigint first: `BigInt(str)`.
   */
  amount: bigint | string | number;
  /** Required when `amount` is a string or number. Ignored for bigint. */
  srcTokenDecimals?: number;
  srcWalletAddress: string;
  /** Defaults to `srcWalletAddress`. */
  dstWalletAddress?: string;
  /** Hard timeout for this single quote fetch. Default: ctx.defaultTimeoutMs or 15000. */
  timeoutMs?: number;
  /** External abort signal, composed with the internal timeout. */
  signal?: AbortSignal;
}

export interface RequestQuoteContext {
  aori: Aori;
  /** Default request timeout. */
  defaultTimeoutMs?: number;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Normalize the user-facing `amount` into a raw on-chain units string.
 *
 * Contract:
 *  - `bigint` is always raw on-chain units. No `decimals` needed.
 *  - `string` / `number` is always a decimal human amount. `decimals` is
 *    REQUIRED. `parseUnits(amount, decimals)` is applied.
 *
 * Digit-only strings are intentionally NOT treated as raw units — that
 * overloading was a footgun. Pass raw values as `bigint` to disambiguate.
 */
function normalizeAmount(
  amount: RequestQuoteParams['amount'],
  decimals: number | undefined,
): string {
  if (typeof amount === 'bigint') return amount.toString();

  const str = String(amount).trim();
  if (str.length === 0) throw new Error('amount is empty');
  if (!/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str)) {
    throw new Error(`Invalid amount: ${str}`);
  }

  if (decimals == null) {
    throw new Error(
      `srcTokenDecimals is required when passing amount as a string or number (${str}). ` +
        `Pass amount as a bigint to send raw on-chain units instead.`,
    );
  }
  return parseUnits(str, decimals).toString();
}

/**
 * Compose an external `AbortSignal` with an internal timeout. Returns the
 * combined signal plus a `cancel` to clear the timer if the caller finishes
 * early.
 */
function withTimeout(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort((external as { reason?: unknown })?.reason);
  if (external) {
    if (external.aborted) controller.abort((external as { reason?: unknown }).reason);
    else external.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * Requests a single quote from the Aori API via `@aori/aori-ts`. Resolves chain
 * IDs to Aori chain keys, normalizes the amount, and applies a request timeout.
 * Throws `QuoteRequestError` on failure.
 */
export async function requestQuote(
  params: RequestQuoteParams,
  ctx: RequestQuoteContext,
): Promise<QuoteResponse> {
  const {
    srcChainId,
    dstChainId,
    srcTokenAddress,
    dstTokenAddress,
    amount,
    srcTokenDecimals,
    srcWalletAddress,
    dstWalletAddress,
  } = params;

  const inputChain = chainIdToKey(srcChainId);
  const outputChain = chainIdToKey(dstChainId);
  if (!inputChain) throw new Error(`Unknown srcChainId: ${srcChainId}`);
  if (!outputChain) throw new Error(`Unknown dstChainId: ${dstChainId}`);

  const normalizedAmount = normalizeAmount(amount, srcTokenDecimals);

  const request: QuoteRequest = {
    offerer: srcWalletAddress || ZERO_ADDRESS,
    recipient: dstWalletAddress || srcWalletAddress || ZERO_ADDRESS,
    inputToken: getAddress(srcTokenAddress),
    outputToken: getAddress(dstTokenAddress),
    inputAmount: normalizedAmount,
    inputChain,
    outputChain,
  };

  const timeoutMs = params.timeoutMs ?? ctx.defaultTimeoutMs ?? 15_000;
  const { signal, cancel } = withTimeout(timeoutMs, params.signal);

  try {
    return await ctx.aori.getQuote(request, { signal });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number })?.status;
    throw new QuoteRequestError(`Quote request failed: ${msg}`, {
      ...(status != null ? { status } : {}),
    });
  } finally {
    cancel();
  }
}
