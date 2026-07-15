import type { AggregatedStatus, NormalizedQuote, PollAggregatedStatusOptions } from '../types';
import { type RelayEnvironment, relayFetch, resolveRelayUrl } from './client';
import type { RelayStatusResponse } from './types';

const TERMINAL: readonly RelayStatusResponse['status'][] = ['success', 'failure', 'refund'];

/** Map a Relay status string onto the normalized status set. */
export function mapRelayStatus(status: RelayStatusResponse['status']): AggregatedStatus['status'] {
  switch (status) {
    case 'success':
      return 'completed';
    case 'failure':
      return 'failed';
    case 'refund':
      return 'cancelled';
    case 'submitted':
      return 'received';
    case 'waiting':
    case 'depositing':
    case 'pending':
    case 'delayed':
    default:
      return 'pending';
  }
}

/** Build a normalized status from a raw Relay status response. */
export function toAggregatedStatus(raw: RelayStatusResponse): AggregatedStatus {
  const txHash = raw.txHashes?.[0] ?? raw.inTxHashes?.[0];
  return {
    venue: 'relay',
    status: mapRelayStatus(raw.status),
    ...(txHash ? { txHash } : {}),
    raw,
  };
}

export interface PollRelayStatusContext {
  relayEnv: RelayEnvironment;
  interval: number;
  timeout: number;
}

/**
 * Fetch the Relay intent status once (`GET /intents/status/v3?requestId=…`).
 */
export async function getRelayStatus(
  relayEnv: RelayEnvironment,
  requestId: string,
  signal?: AbortSignal,
): Promise<RelayStatusResponse> {
  const url = resolveRelayUrl(relayEnv, `/intents/status/v3?requestId=${encodeURIComponent(requestId)}`);
  return relayFetch<RelayStatusResponse>(relayEnv, url, { method: 'GET', ...(signal ? { signal } : {}) });
}

/**
 * Poll Relay intent status until terminal, deadline, or abort. Transient errors
 * (e.g. the intent not yet indexed) are retried up to a small budget, mirroring
 * the resilient Aori poll loop.
 */
export function pollRelayStatus(
  quote: NormalizedQuote,
  opts: PollAggregatedStatusOptions,
  ctx: PollRelayStatusContext,
): Promise<AggregatedStatus> {
  const requestId = quote.quoteId;
  const interval = opts.interval ?? ctx.interval;
  const timeout = opts.timeout ?? ctx.timeout;
  const { signal } = opts;

  let lastStatus: string | null = null;
  const startTime = Date.now();
  let consecutiveErrorCount = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return new Promise<AggregatedStatus>((resolve, reject) => {
    const check = async (): Promise<void> => {
      try {
        if (signal?.aborted) {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new DOMException('Polling aborted', 'AbortError'));
          return;
        }
        if (Date.now() - startTime > timeout) {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new Error('Relay status polling timed out'));
          return;
        }

        const raw = await getRelayStatus(ctx.relayEnv, requestId, signal);
        if (!raw || typeof raw !== 'object' || !raw.status) {
          throw new Error(`Invalid Relay status response: ${JSON.stringify(raw)}`);
        }

        consecutiveErrorCount = 0;
        const normalized = toAggregatedStatus(raw);

        if (raw.status !== lastStatus) {
          lastStatus = raw.status;
          opts.onStatusChange?.(normalized);
        }

        if (TERMINAL.includes(raw.status)) {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(normalized);
          return;
        }

        timeoutId = setTimeout(check, interval);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          if (timeoutId) clearTimeout(timeoutId);
          reject(error);
          return;
        }
        if (++consecutiveErrorCount >= MAX_CONSECUTIVE_ERRORS) {
          if (timeoutId) clearTimeout(timeoutId);
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        timeoutId = setTimeout(check, interval);
      }
    };

    void check();
  });
}
