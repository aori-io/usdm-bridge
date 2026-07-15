'use client';

import { type Asset, useTokenRegistry } from '../internal';
import { create } from 'zustand';
import { useCallback, useEffect, useRef } from 'react';


interface TokenSelectionState {
  baseToken: Asset | null;
  quoteToken: Asset | null;
  setBaseTokenDirect: (token: Asset | null) => void;
  setQuoteTokenDirect: (token: Asset | null) => void;
  swapTokensDirect: () => void;
}

export const useTokenSelectionStore = create<TokenSelectionState>()((set) => ({
  baseToken: null,
  quoteToken: null,
  setBaseTokenDirect: (token) => set({ baseToken: token }),
  setQuoteTokenDirect: (token) => set({ quoteToken: token }),
  swapTokensDirect: () =>
    set((state) => ({ baseToken: state.quoteToken, quoteToken: state.baseToken })),
}));

interface UseTokenSelectionOptions {
  defaultBaseToken?: { chainId: number; address: string };
  defaultQuoteToken?: { chainId: number; address: string };
}

export function useTokenSelection(options?: UseTokenSelectionOptions) {
  const { data: tokenRegistry, isLoading } = useTokenRegistry();
  const store = useTokenSelectionStore();
  const initializedRef = useRef(false);

  const defaultBase = options?.defaultBaseToken ?? null;
  const defaultQuote = options?.defaultQuoteToken ?? null;

  useEffect(() => {
    if (!tokenRegistry || tokenRegistry.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    const findInRegistry = (spec: { chainId: number; address: string }): Asset | null =>
      tokenRegistry.find(
        (t) => t.chainId === spec.chainId && t.address.toLowerCase() === spec.address.toLowerCase(),
      ) ?? null;

    const base = defaultBase ? findInRegistry(defaultBase) : null;
    const quote = defaultQuote ? findInRegistry(defaultQuote) : null;

    if (base && quote && base.chainId === quote.chainId &&
        base.address.toLowerCase() === quote.address.toLowerCase()) {
      store.setBaseTokenDirect(base);
      store.setQuoteTokenDirect(null);
    } else {
      store.setBaseTokenDirect(base);
      store.setQuoteTokenDirect(quote);
    }
  }, [tokenRegistry, defaultBase, defaultQuote, store]);

  const setBaseToken = useCallback(
    (token: Asset | null) => {
      if (!token) { store.setBaseTokenDirect(null); return; }
      const current = useTokenSelectionStore.getState();
      if (current.quoteToken && token.chainId === current.quoteToken.chainId &&
          token.address.toLowerCase() === current.quoteToken.address.toLowerCase()) {
        store.swapTokensDirect();
      } else {
        store.setBaseTokenDirect(token);
      }
    },
    [store],
  );

  const setQuoteToken = useCallback(
    (token: Asset | null) => {
      if (!token) { store.setQuoteTokenDirect(null); return; }
      const current = useTokenSelectionStore.getState();
      if (current.baseToken && token.chainId === current.baseToken.chainId &&
          token.address.toLowerCase() === current.baseToken.address.toLowerCase()) {
        store.swapTokensDirect();
      } else {
        store.setQuoteTokenDirect(token);
      }
    },
    [store],
  );

  const swapTokens = useCallback(() => {
    store.swapTokensDirect();
  }, [store]);

  return {
    baseToken: store.baseToken,
    quoteToken: store.quoteToken,
    setBaseToken,
    setQuoteToken,
    swapTokens,
    isLoading,
  };
}
