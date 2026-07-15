import type { Aori, OrderStatus } from '@aori/aori-ts';

export interface PollOrderStatusOptions {
  onStatusChange?: (status: OrderStatus) => void;
  /**
   * Fires once for any terminal state (success **or** failure). Equivalent to
   * `onSettled`. Kept for backward compatibility — prefer the semantic
   * `onSuccess` / `onFailure` / `onSettled` hooks for new code.
   */
  onComplete?: (status: OrderStatus) => void | Promise<void>;
  /** Fires once when the order reaches `completed`. Awaited before the promise resolves. */
  onSuccess?: (status: OrderStatus) => void | Promise<void>;
  /** Fires once when the order reaches `failed` or `cancelled`. Awaited before the promise resolves. */
  onFailure?: (status: OrderStatus) => void | Promise<void>;
  /** Fires once on any terminal state. Awaited before the promise resolves. */
  onSettled?: (status: OrderStatus) => void | Promise<void>;
  onError?: (error: Error) => void;
  /** Poll interval (ms). Default 4000. */
  interval?: number;
  /** Total polling deadline (ms). Default 300000. */
  timeout?: number;
  /** Abort the poll loop early. */
  signal?: AbortSignal;
}

const SUCCESS_STATUSES = ['completed'] as const;
const FAILURE_STATUSES = ['failed', 'cancelled'] as const;
const TERMINAL_STATUSES: readonly string[] = [...SUCCESS_STATUSES, ...FAILURE_STATUSES];

/** True when the status string represents a terminal state (any outcome). */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status.toLowerCase());
}

/** True when the status string represents a successful settlement. */
export function isSuccessStatus(status: string): boolean {
  return (SUCCESS_STATUSES as readonly string[]).includes(status.toLowerCase());
}

/** True when the status string represents a failed/cancelled settlement. */
export function isFailureStatus(status: string): boolean {
  return (FAILURE_STATUSES as readonly string[]).includes(status.toLowerCase());
}

/**
 * Polls `GET /data/status/{orderHash}` (via `@aori/aori-ts`) until a terminal
 * status is reached, the deadline elapses, or the abort signal fires. Transient
 * errors (e.g. 404s during the settlement warm-up window before the order is
 * indexed) are retried up to a small budget.
 */
export async function pollOrderStatus(
  orderHash: string,
  aori: Aori,
  options: PollOrderStatusOptions = {},
): Promise<OrderStatus> {
  const {
    onStatusChange,
    onComplete,
    onSuccess,
    onFailure,
    onSettled,
    onError,
    interval = 4_000,
    timeout = 300_000,
    signal,
  } = options;

  let lastStatus: string | null = null;
  const startTime = Date.now();
  let consecutiveErrorCount = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return new Promise<OrderStatus>((resolve, reject) => {
    const checkStatus = async (): Promise<void> => {
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

        const status = await aori.getOrderStatus(orderHash, signal ? { signal } : {});

        if (!status || typeof status !== 'object' || !status.status) {
          throw new Error(`Invalid status response format: ${JSON.stringify(status)}`);
        }

        consecutiveErrorCount = 0;
        const normalized = status.status.toLowerCase();

        if (normalized !== lastStatus) {
          lastStatus = normalized;
          onStatusChange?.(status);
        }

        if (TERMINAL_STATUSES.includes(normalized)) {
          if (timeoutId) clearTimeout(timeoutId);
          try {
            if (isSuccessStatus(normalized)) {
              await onSuccess?.(status);
            } else {
              await onFailure?.(status);
            }
            await onSettled?.(status);
            await onComplete?.(status);
          } catch (hookError) {
            const err = hookError instanceof Error ? hookError : new Error(String(hookError));
            onError?.(err);
            reject(err);
            return;
          }
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

        // Transient errors (e.g. 404 before the order is indexed) — retry up to
        // the budget before giving up.
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
