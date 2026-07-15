'use client';

import { useSwapForm } from '../hooks/useSwapForm';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import type { Asset } from '../internal';

type SwapFormData = ReturnType<typeof useSwapForm>;

const SwapFormContext = createContext<SwapFormData | null>(null);

interface SwapFormProviderProps {
  children: ReactNode;
  defaultBaseToken?: { chainId: number; address: string };
  defaultQuoteToken?: { chainId: number; address: string };
  onBaseTokenChange?: (token: Asset) => void;
  onQuoteTokenChange?: (token: Asset) => void;
}

export const SwapFormProvider = ({ children, defaultBaseToken, defaultQuoteToken, onBaseTokenChange, onQuoteTokenChange }: SwapFormProviderProps) => {
  const swapForm = useSwapForm(defaultBaseToken, defaultQuoteToken, onBaseTokenChange, onQuoteTokenChange);

  const value = useMemo(
    () => swapForm,
    [
      swapForm.baseToken,
      swapForm.quoteToken,
      swapForm.baseAmount,
      swapForm.quoteAmount,
      swapForm.isBaseGasToken,
      swapForm.isQuoteGasToken,
      swapForm.isWrappingPair,
      swapForm.isUnwrappingPair,
      swapForm.baseBalance,
      swapForm.quoteBalance,
      swapForm.baseAmountRaw,
      swapForm.quoteAmountRaw,
      swapForm.isBaseBalanceLoading,
      swapForm.isQuoteBalanceLoading,
      swapForm.setBaseToken,
      swapForm.setQuoteToken,
      swapForm.setBaseAmount,
      swapForm.setQuoteAmount,
      swapForm.swapTokens,
      swapForm.clearForm,
      swapForm.isRegistryLoading,
    ],
  );

  return (
    <SwapFormContext.Provider value={value}>
      {children}
    </SwapFormContext.Provider>
  );
};

export const useSwapFormContext = () => {
  const ctx = useContext(SwapFormContext);
  if (!ctx) {
    throw new Error('useSwapFormContext must be used within SwapFormProvider');
  }
  return ctx;
};
