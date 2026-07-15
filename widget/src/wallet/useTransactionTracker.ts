'use client';

import { useCallback, useRef } from 'react';
import { useTransactionRegistry } from './TransactionRegistryContext';

export function useTransactionTracker() {
  const { registerTransaction, enabled } = useTransactionRegistry();
  const registeredRef = useRef(new Set<string>());

  const trackOrderTransaction = useCallback(
    (quoteId: string, description: string) => {
      if (!enabled || registeredRef.current.has(quoteId)) return;
      registeredRef.current.add(quoteId);
      registerTransaction(quoteId, description);
    },
    [enabled, registerTransaction],
  );

  const trackNativeTransaction = useCallback(
    (txHash: string, description: string) => {
      if (!enabled || registeredRef.current.has(txHash)) return;
      registeredRef.current.add(txHash);
      registerTransaction(txHash, description);
    },
    [enabled, registerTransaction],
  );

  return { trackOrderTransaction, trackNativeTransaction, txTrackingEnabled: enabled };
}
