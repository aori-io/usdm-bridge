'use client';

import {
  type Asset,
  type WalletBalanceResponse,
  balanceKeys,
  fetchSwapBalances,
  getChainConfig,
} from '../internal';
import { useWalletState } from '../wallet/useWalletState';
import { useEnabledChainIds } from './useEnabledChainIds';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

interface BalanceUpdateEvent {
  type: 'swap' | 'wrap' | 'unwrap';
  tokens: Array<{ asset: Asset; userAddress: string }>;
}

function getRefetchDelay(chainIds: number[]): number {
  const MIN_DELAY = 1_000;
  const MAX_DELAY = 5_000;
  const BUFFER = 1_000;
  if (chainIds.length === 0) return 5_000;
  const maxBlockTime = Math.max(
    ...chainIds.map((id) => getChainConfig(id)?.blockTimeMs ?? 2_000),
  );
  return Math.min(MAX_DELAY, Math.max(MIN_DELAY, maxBlockTime * 2 + BUFFER));
}

export const useBalanceEventListener = () => {
  const { address: userAddress } = useWalletState();
  const availableChainIds = useEnabledChainIds();
  const queryClient = useQueryClient();
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const triggerBalanceUpdate = useCallback(
    (event: BalanceUpdateEvent) => {
      if (!userAddress) return;

      const chainIds = [...new Set(event.tokens.map((t) => t.asset.chainId))];
      const delay = getRefetchDelay(chainIds);

      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }

      pendingTimerRef.current = setTimeout(async () => {
        pendingTimerRef.current = null;
        if (!mountedRef.current) return;
        try {
          const tokens = event.tokens.map((t) => ({
            chainId: t.asset.chainId,
            tokenAddress: t.asset.address,
          }));

          const swapResult = await fetchSwapBalances(userAddress, tokens);
          if (swapResult.balances.length === 0) return;

          if (event.tokens.length >= 2) {
            const base = event.tokens[0].asset;
            const quote = event.tokens[1].asset;
            const swapKey = balanceKeys.swap(
              userAddress, base.chainId, base.address, quote.chainId, quote.address,
            );
            queryClient.setQueryData(swapKey, swapResult);
          }

          const bulkKey = balanceKeys.bulk(userAddress, availableChainIds);
          const existingBulk = queryClient.getQueryData<WalletBalanceResponse>(bulkKey);

          if (existingBulk) {
            const updatedBalances = existingBulk.balances.map((existing) => {
              const updated = swapResult.balances.find(
                (b) => b.chainId === existing.chainId && b.token.toLowerCase() === existing.token.toLowerCase(),
              );
              return updated ?? existing;
            });
            for (const newBalance of swapResult.balances) {
              if (!updatedBalances.some(
                (b) => b.chainId === newBalance.chainId && b.token.toLowerCase() === newBalance.token.toLowerCase(),
              )) updatedBalances.push(newBalance);
            }
            for (const eventToken of event.tokens) {
              const inResult = swapResult.balances.some(
                (b) =>
                  b.chainId === eventToken.asset.chainId &&
                  b.token.toLowerCase() === eventToken.asset.address.toLowerCase(),
              );
              if (!inResult) {
                const idx = updatedBalances.findIndex(
                  (b) =>
                    b.chainId === eventToken.asset.chainId &&
                    b.token.toLowerCase() === eventToken.asset.address.toLowerCase(),
                );
                if (idx !== -1) {
                  updatedBalances[idx] = { ...updatedBalances[idx], balance: '0', shiftedBalance: '0' };
                }
              }
            }
            queryClient.setQueryData(bulkKey, { balances: updatedBalances });
          }
        } catch { /* next interaction will refetch */ }
      }, delay);
    },
    [userAddress, availableChainIds, queryClient],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, []);

  return { triggerBalanceUpdate };
};

class BalanceEventEmitter extends EventTarget {
  emit(event: BalanceUpdateEvent) {
    this.dispatchEvent(new CustomEvent('balance-update', { detail: event }));
  }
}

export const balanceEventEmitter = new BalanceEventEmitter();

export const useEmitBalanceEvent = () => {
  return (event: BalanceUpdateEvent) => balanceEventEmitter.emit(event);
};

export const useBalanceEventSubscription = () => {
  const { triggerBalanceUpdate } = useBalanceEventListener();

  useEffect(() => {
    const handler = (event: CustomEvent<BalanceUpdateEvent>) => {
      triggerBalanceUpdate(event.detail);
    };
    balanceEventEmitter.addEventListener('balance-update', handler as EventListener);
    return () => balanceEventEmitter.removeEventListener('balance-update', handler as EventListener);
  }, [triggerBalanceUpdate]);
};
