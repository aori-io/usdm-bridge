import type { OrderStatus } from '@aori/aori-ts';
import type { SdkEnvironment } from './environment';

/**
 * Options for {@link trackOrderStatus}.
 *
 * This is the status-code-aware poller used by UI integrations (e.g. the widget)
 * that need to distinguish the settlement warm-up window (404, before the order
 * is indexed) from an expired/not-found order (400). It hits
 * `GET /data/status/{orderHash}` directly through the SDK environment so it can
 * read the raw HTTP status — something `@aori/aori-ts`'s `getOrderStatus`
 * discards when it re-wraps errors.
 *
 * For most server-side flows prefer {@link pollOrderStatus} / `sdk.pollStatus`,
 * which drives the same endpoint through the typed Aori client and exposes the
 * semantic `onSuccess` / `onFailure` / `onSettled` hooks.
 */
export interface TrackOrderStatusOptions {
  onStatusChange?: (status: OrderStatus) => void;
  onComplete?: (status: OrderStatus) => void;
  onError?: (error: Error) => void;
  /** Poll interval (ms). Default 4000. */
  interval?: number;
  /** Total polling deadline (ms). Default 300000. */
  timeout?: number;
  /** Abort the poll loop early. */
  signal?: AbortSignal;
}

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED'];

/**
 * Polls `GET /data/status/{orderHash}` until a terminal status is reached, the
 * deadline elapses, or the abort signal fires.
 *
 * Transient conditions are handled distinctly:
 *  - **404** (order not indexed yet, e.g. a native deposit still mining) is
 *    retried indefinitely within the timeout window.
 *  - **400** carrying `not found` / `expired` is retried up to a small budget,
 *    then rejected with `Order expired or not found`.
 *  - Any other error is retried up to a small budget before rejecting.
 */
export async function trackOrderStatus(
  orderHash: string,
  env: SdkEnvironment,
  options: TrackOrderStatusOptions = {},
): Promise<OrderStatus> {
  const {
    onStatusChange,
    onComplete,
    onError,
    interval = 4000,
    timeout = 300000,
    signal,
  } = options;

  const baseUrl = env.getAoriApiUrl();

  let lastStatus: string | null = null;
  const startTime = Date.now();
  let consecutiveErrorCount = 0;
  const MAX_CONSECUTIVE_ERRORS = 8;
  let consecutive400Count = 0;
  const MAX_CONSECUTIVE_400 = 10;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return new Promise<OrderStatus>((resolve, reject) => {
    const checkStatus = async () => {
      try {
        if (signal?.aborted) {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new DOMException('Polling aborted', 'AbortError'));
          return;
        }

        if (Date.now() - startTime > timeout) {
          if (timeoutId) clearTimeout(timeoutId);
          const error = new Error('Order status polling timed out');
          onError?.(error);
          reject(error);
          return;
        }

        const response = await fetch(`${baseUrl}/data/status/${orderHash}`, {
          headers: env.getAoriHeaders(),
          signal,
        });

        if (response.status === 404) {
          // Order not indexed yet (e.g. native deposit still mining) — keep polling
          timeoutId = setTimeout(checkStatus, interval);
          return;
        }

        if (response.status === 400) {
          const body = await response.text();
          if (body.includes('not found') || body.includes('expired')) {
            if (++consecutive400Count >= MAX_CONSECUTIVE_400) {
              if (timeoutId) clearTimeout(timeoutId);
              const err = new Error('Order expired or not found');
              onError?.(err);
              reject(err);
              return;
            }
            timeoutId = setTimeout(checkStatus, interval);
            return;
          }
          throw new Error(`Failed to fetch order status: ${body}`);
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch order status: ${await response.text()}`);
        }

        const status = (await response.json()) as OrderStatus;

        if (!status || typeof status !== 'object' || !status.status) {
          throw new Error(`Invalid status response format: ${JSON.stringify(status)}`);
        }

        consecutiveErrorCount = 0;
        consecutive400Count = 0;

        const normalized = status.status.toUpperCase();

        if (normalized !== lastStatus) {
          lastStatus = normalized;
          onStatusChange?.(status);
        }

        if (TERMINAL_STATUSES.includes(normalized)) {
          if (timeoutId) clearTimeout(timeoutId);
          onComplete?.(status);
          resolve(status);
          return;
        }

        timeoutId = setTimeout(checkStatus, interval);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          if (timeoutId) clearTimeout(timeoutId);
          reject(error);
          return;
        }

        if (++consecutiveErrorCount >= MAX_CONSECUTIVE_ERRORS) {
          if (timeoutId) clearTimeout(timeoutId);
          const err = error instanceof Error ? error : new Error(String(error));
          onError?.(err);
          reject(err);
          return;
        }

        timeoutId = setTimeout(checkStatus, interval);
      }
    };

    void checkStatus();
  });
}
