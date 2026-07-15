'use client';

import { useEmitBalanceEvent } from './useBalanceEventListener';
import { pollOrderStatus, type AoriOrderStatus } from '../lib/pollOrderStatus';
import type { ToastStatus } from '../stores/swapUIStore';
import { type Asset, getAoriApiUrl } from '../internal';
import { useWalletState } from '../wallet/useWalletState';
import { useCallback, useEffect, useRef } from 'react';

interface OrderMetadata {
  baseToken?: Asset;
  quoteToken?: Asset;
}

function normalizeStatus(aoriStatus: string): ToastStatus {
  const upper = aoriStatus.toUpperCase();
  if (upper === 'COMPLETED') return 'completed';
  if (upper === 'FAILED') return 'failed';
  if (upper === 'CANCELLED') return 'cancelled';
  if (upper === 'RECEIVED') return 'received';
  return 'pending';
}

export const useOrderStatusPolling = (
  onStatusUpdate?: (orderHash: string, status: ToastStatus, txUrl?: string) => void,
) => {
  const activePolls = useRef<Map<string, boolean>>(new Map());
  const orderMetadata = useRef<Map<string, OrderMetadata>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const pollingLock = useRef(0);
  const incrementPollingLock = useCallback(() => ++pollingLock.current, []);

  const { address: userAddress } = useWalletState();
  const emitBalanceEvent = useEmitBalanceEvent();

  const startPolling = useCallback(
    (orderHash: string, metadata?: OrderMetadata) => {
      if (activePolls.current.get(orderHash)) return;

      if (metadata) orderMetadata.current.set(orderHash, metadata);

      activePolls.current.set(orderHash, true);
      const currentLock = pollingLock.current;

      const abortController = new AbortController();
      abortControllers.current.set(orderHash, abortController);

      const isMainnet = metadata?.baseToken?.chainId === 1;
      pollOrderStatus(
        orderHash,
        getAoriApiUrl(),
        {
          interval: isMainnet ? 1000 : 500,
          timeout: 300000,
          signal: abortController.signal,

          onStatusChange: (status: AoriOrderStatus) => {
            if (!status?.status) return;
            const statusValue = normalizeStatus(status.status);

            onStatusUpdate?.(orderHash, statusValue, status.txUrl);

            if (statusValue === 'completed' && userAddress) {
              const meta = orderMetadata.current.get(orderHash);
              if (meta && (meta.baseToken || meta.quoteToken)) {
                const tokens: Array<{ asset: Asset; userAddress: string }> = [];
                if (meta.baseToken) tokens.push({ asset: meta.baseToken, userAddress });
                if (meta.quoteToken) tokens.push({ asset: meta.quoteToken, userAddress });
                emitBalanceEvent({ type: 'swap', tokens });
              }
            }

            if (['completed', 'failed', 'cancelled'].includes(statusValue)) {
              activePolls.current.delete(orderHash);
              orderMetadata.current.delete(orderHash);
            }

            if (currentLock !== pollingLock.current) {
              activePolls.current.delete(orderHash);
              orderMetadata.current.delete(orderHash);
            }
          },

          onComplete: (status: AoriOrderStatus) => {
            if (status?.status) {
              onStatusUpdate?.(orderHash, normalizeStatus(status.status), status.txUrl);
            }
            activePolls.current.delete(orderHash);
            orderMetadata.current.delete(orderHash);
          },

          onError: (error) => {
            if (error instanceof Error && error.message === 'Order expired or not found') {
              onStatusUpdate?.(orderHash, 'expired');
            }
            activePolls.current.delete(orderHash);
            orderMetadata.current.delete(orderHash);
          },
        },
      ).catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        activePolls.current.delete(orderHash);
        orderMetadata.current.delete(orderHash);
        abortControllers.current.delete(orderHash);
      });
    },
    [userAddress, emitBalanceEvent, onStatusUpdate],
  );

  const stopPolling = useCallback(
    (orderHash: string) => {
      const controller = abortControllers.current.get(orderHash);
      if (controller) {
        controller.abort();
        abortControllers.current.delete(orderHash);
      }
      incrementPollingLock();
      activePolls.current.delete(orderHash);
      orderMetadata.current.delete(orderHash);
    },
    [incrementPollingLock],
  );

  const stopAllPolling = useCallback(() => {
    for (const controller of abortControllers.current.values()) controller.abort();
    abortControllers.current.clear();
    incrementPollingLock();
    activePolls.current.clear();
    orderMetadata.current.clear();
  }, [incrementPollingLock]);

  useEffect(() => {
    return () => stopAllPolling();
  }, [stopAllPolling]);

  return {
    startPolling,
    stopPolling,
    stopAllPolling,
    isPolling: (orderHash: string) => activePolls.current.has(orderHash),
  };
};
