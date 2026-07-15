import { getAddress, parseUnits } from 'viem';
import type { NormalizedQuote, QuoteRequestInput } from '../types';
import { type RelayEnvironment, relayFetch, resolveRelayUrl } from './client';
import type { RelayQuoteResponse } from './types';

/** Relay's canonical native-currency sentinel. */
export const RELAY_NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Aori's native-currency sentinel (EIP-7528-style). */
const AORI_NATIVE_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

/**
 * Normalize a token address for Relay. Both the zero address and the Aori native
 * sentinel map to Relay's native sentinel (zero address); everything else is
 * checksum-normalized.
 */
export function toRelayCurrency(address: string): string {
  const lower = address.toLowerCase();
  if (lower === RELAY_NATIVE_ADDRESS || lower === AORI_NATIVE_ADDRESS) {
    return RELAY_NATIVE_ADDRESS;
  }
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

/**
 * Normalize a user-facing amount into raw on-chain units.
 *  - `bigint` → raw units (no decimals needed).
 *  - `string`/`number` → decimal human amount (requires `decimals`).
 */
function normalizeAmount(amount: QuoteRequestInput['amount'], decimals: number | undefined): string {
  if (typeof amount === 'bigint') return amount.toString();
  const str = String(amount).trim();
  if (str.length === 0) throw new Error('amount is empty');
  if (!/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str)) {
    throw new Error(`Invalid amount: ${str}`);
  }
  if (decimals == null) {
    throw new Error(
      `srcTokenDecimals is required when passing amount as a string or number (${str}). ` +
        'Pass amount as a bigint to send raw on-chain units instead.',
    );
  }
  return parseUnits(str, decimals).toString();
}

/** Extract the venue-native id (requestId) from a Relay quote. */
export function extractRequestId(quote: RelayQuoteResponse): string {
  for (const step of quote.steps ?? []) {
    if (step.requestId) return step.requestId;
  }
  // Fall back to a requestId embedded in a check endpoint query.
  for (const step of quote.steps ?? []) {
    for (const item of step.items ?? []) {
      const endpoint = item.check?.endpoint;
      if (endpoint) {
        const match = /requestId=([^&]+)/.exec(endpoint);
        if (match?.[1]) return match[1];
      }
    }
  }
  return '';
}

export interface RequestRelayQuoteContext {
  env: RelayEnvironment;
  /** Hard timeout for this single quote fetch. Default 15000. */
  defaultTimeoutMs?: number;
}

/**
 * Compose an external `AbortSignal` with an internal timeout.
 */
function withTimeoutSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort((external as { reason?: unknown } | undefined)?.reason);
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

/** Fetch a raw Relay quote (`POST /quote/v2`). */
export async function requestRelayQuote(
  input: QuoteRequestInput,
  ctx: RequestRelayQuoteContext,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<RelayQuoteResponse> {
  const amount = normalizeAmount(input.amount, input.srcTokenDecimals);
  const recipient = input.dstWalletAddress || input.srcWalletAddress;

  const body = {
    user: input.srcWalletAddress,
    recipient,
    originChainId: input.srcChainId,
    destinationChainId: input.dstChainId,
    originCurrency: toRelayCurrency(input.srcTokenAddress),
    destinationCurrency: toRelayCurrency(input.dstTokenAddress),
    amount,
    tradeType: 'EXACT_INPUT' as const,
  };

  const timeoutMs = opts.timeoutMs ?? ctx.defaultTimeoutMs ?? 15_000;
  const { signal, cancel } = withTimeoutSignal(timeoutMs, opts.signal);

  try {
    const url = resolveRelayUrl(ctx.env, '/quote/v2');
    const quote = await relayFetch<RelayQuoteResponse>(ctx.env, url, { method: 'POST', body, signal });
    if (!quote || !Array.isArray(quote.steps) || quote.steps.length === 0) {
      throw new Error('Relay returned no executable steps for this route');
    }
    return quote;
  } finally {
    cancel();
  }
}

/** Map a raw Relay quote onto a normalized quote for the given request. */
export function toNormalizedQuote(input: QuoteRequestInput, quote: RelayQuoteResponse): NormalizedQuote {
  const details = quote.details;
  const currencyIn = details?.currencyIn;
  const currencyOut = details?.currencyOut;

  const inputToken = currencyIn?.currency?.address ?? toRelayCurrency(input.srcTokenAddress);
  const outputToken = currencyOut?.currency?.address ?? toRelayCurrency(input.dstTokenAddress);
  const outputAmount = currencyOut?.amount ?? '0';
  const inputAmount = currencyIn?.amount ?? normalizeAmountSafe(input);

  return {
    venue: 'relay',
    quoteId: extractRequestId(quote),
    srcChainId: input.srcChainId,
    dstChainId: input.dstChainId,
    inputToken,
    outputToken,
    inputAmount: String(inputAmount),
    outputAmount: String(outputAmount),
    ...(currencyIn?.amountUsd != null ? { inputAmountUsd: currencyIn.amountUsd } : {}),
    ...(currencyOut?.amountUsd != null ? { outputAmountUsd: currencyOut.amountUsd } : {}),
    ...(details?.timeEstimate != null ? { estimatedTimeSec: Number(details.timeEstimate) } : {}),
    ...(details?.totalImpact?.usd != null ? { totalFeeUsd: details.totalImpact.usd } : {}),
    ...(details?.totalImpact?.percent != null ? { priceImpactPercent: details.totalImpact.percent } : {}),
    ...(details?.rate != null ? { rate: details.rate } : {}),
    receivedAt: Date.now(),
    raw: quote,
  };
}

function normalizeAmountSafe(input: QuoteRequestInput): string {
  try {
    return normalizeAmount(input.amount, input.srcTokenDecimals);
  } catch {
    return typeof input.amount === 'bigint' ? input.amount.toString() : String(input.amount);
  }
}
