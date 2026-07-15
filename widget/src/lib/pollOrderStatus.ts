import type { OrderStatus } from '@aori/aori-ts';
import { getWidgetSdk } from '../internal';

export interface AoriOrderStatus {
  status: string;
  txHash?: string;
  txUrl?: string;
  error?: string;
  timestamp?: number;
}

export interface PollOrderStatusOptions {
  onStatusChange?: (status: AoriOrderStatus) => void;
  onComplete?: (status: AoriOrderStatus) => void;
  onError?: (error: Error) => void;
  interval?: number;
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * Polls an order's status until it reaches a terminal state, times out, or is
 * aborted.
 *
 * The Aori status interaction now lives in the SDK
 * (`usdm-bridge-sdk` → `sdk.trackOrderStatus`), which owns the direct
 * `GET /data/status/{orderHash}` call and the settlement warm-up (404) /
 * expired (400) handling. This wrapper preserves the widget's public API and
 * status shape. The `baseUrl` argument is retained for backward compatibility
 * but is now sourced from the SDK's configured environment.
 */
export async function pollOrderStatus(
  orderHash: string,
  _baseUrl: string,
  options: PollOrderStatusOptions = {},
): Promise<AoriOrderStatus> {
  const { onStatusChange, onComplete, onError, interval, timeout, signal } = options;

  const status = await getWidgetSdk().trackOrderStatus(orderHash, {
    ...(onStatusChange
      ? { onStatusChange: (s: OrderStatus) => onStatusChange(s as AoriOrderStatus) }
      : {}),
    ...(onComplete
      ? { onComplete: (s: OrderStatus) => onComplete(s as AoriOrderStatus) }
      : {}),
    ...(onError ? { onError } : {}),
    ...(interval != null ? { interval } : {}),
    ...(timeout != null ? { timeout } : {}),
    ...(signal ? { signal } : {}),
  });

  return status as AoriOrderStatus;
}
