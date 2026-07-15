'use client';

import { useTokenSelection } from './useTokenSelection';
import { useWidgetSwapUIStore } from '../stores/swapUIStore';
import type { Asset } from '../internal/types';
import { getChainConfig } from '../internal/chainsConfig';
import { useTokenPriceWithRefetch } from '../internal/queries/tokens/hooks';
import { useSwapBalances } from '../internal/queries/balances/hooks';
import { useWalletState } from '../wallet/useWalletState';
import { useCallback, useMemo } from 'react';
import { parseUnits } from 'viem';
import { useShallow } from 'zustand/react/shallow';

export const useSwapForm = (
  defaultBaseToken?: { chainId: number; address: string },
  defaultQuoteToken?: { chainId: number; address: string },
  onBaseTokenChange?: (token: Asset) => void,
  onQuoteTokenChange?: (token: Asset) => void,
) => {
  const { address: userAddress } = useWalletState();
  const {
    baseToken: baseTokenFromSelection,
    quoteToken: quoteTokenFromSelection,
    setBaseToken: setBaseTokenSelection,
    setQuoteToken: setQuoteTokenSelection,
    swapTokens: swapTokensSelection,
    isLoading: isRegistryLoading,
  } = useTokenSelection({ defaultBaseToken, defaultQuoteToken });

  const { baseAmount, quoteAmount, setBaseAmount, setQuoteAmount, clearAmounts } =
    useWidgetSwapUIStore(
      useShallow((state) => ({
        baseAmount: state.baseAmount,
        quoteAmount: state.quoteAmount,
        setBaseAmount: state.setBaseAmount,
        setQuoteAmount: state.setQuoteAmount,
        clearAmounts: state.clearAmounts,
      })),
    );

  const { data: basePriceData } = useTokenPriceWithRefetch(
    baseTokenFromSelection?.address,
    baseTokenFromSelection?.chainId,
  );

  const { data: quotePriceData } = useTokenPriceWithRefetch(
    quoteTokenFromSelection?.address,
    quoteTokenFromSelection?.chainId,
  );

  const baseToken = useMemo(() => {
    if (!baseTokenFromSelection) return null;
    const livePrice = basePriceData?.price ?? baseTokenFromSelection.price;
    if (livePrice === baseTokenFromSelection.price) return baseTokenFromSelection;
    return { ...baseTokenFromSelection, price: livePrice };
  }, [baseTokenFromSelection, basePriceData?.price]);

  const quoteToken = useMemo(() => {
    if (!quoteTokenFromSelection) return null;
    const livePrice = quotePriceData?.price ?? quoteTokenFromSelection.price;
    if (livePrice === quoteTokenFromSelection.price) return quoteTokenFromSelection;
    return { ...quoteTokenFromSelection, price: livePrice };
  }, [quoteTokenFromSelection, quotePriceData?.price]);

  const {
    baseBalance: swapBaseBalance,
    quoteBalance: swapQuoteBalance,
    isLoading: isSwapBalanceLoading,
  } = useSwapBalances(userAddress, baseToken, quoteToken);

  const baseBalanceData = useMemo(() => {
    if (!swapBaseBalance || swapBaseBalance.raw === '0') return null;
    return swapBaseBalance;
  }, [swapBaseBalance]);

  const quoteBalanceData = useMemo(() => {
    if (!swapQuoteBalance || swapQuoteBalance.raw === '0') return null;
    return swapQuoteBalance;
  }, [swapQuoteBalance]);

  const isBaseGasToken = useMemo(() => {
    if (!baseToken?.chainId) return false;
    const config = getChainConfig(baseToken.chainId);
    return baseToken.address.toLowerCase() === config?.gasToken.address?.toLowerCase();
  }, [baseToken]);

  const isQuoteGasToken = useMemo(() => {
    if (!quoteToken?.chainId) return false;
    const config = getChainConfig(quoteToken.chainId);
    return quoteToken.address.toLowerCase() === config?.gasToken.address?.toLowerCase();
  }, [quoteToken]);

  const isWrappingPair = useMemo(() => {
    if (!isBaseGasToken || !baseToken?.chainId || !quoteToken) return false;
    if (baseToken.chainId !== quoteToken.chainId) return false;
    if (baseToken.chainId === 988) return false;
    const config = getChainConfig(baseToken.chainId);
    return quoteToken.address.toLowerCase() === config?.wrappedAsset.address?.toLowerCase();
  }, [isBaseGasToken, baseToken, quoteToken]);

  const isUnwrappingPair = useMemo(() => {
    if (!baseToken?.chainId || !quoteToken || !isQuoteGasToken) return false;
    if (baseToken.chainId !== quoteToken.chainId) return false;
    if (baseToken.chainId === 988) return false;
    const config = getChainConfig(baseToken.chainId);
    return baseToken.address.toLowerCase() === config?.wrappedAsset.address?.toLowerCase();
  }, [baseToken, quoteToken, isQuoteGasToken]);

  const baseBalance = useMemo(
    () => ({ raw: baseBalanceData?.raw ?? '0', formatted: baseBalanceData?.formatted ?? '0' }),
    [baseBalanceData],
  );

  const quoteBalance = useMemo(
    () => ({ raw: quoteBalanceData?.raw ?? '0', formatted: quoteBalanceData?.formatted ?? '0' }),
    [quoteBalanceData],
  );

  const baseAmountRaw = useMemo(() => {
    if (!baseToken || typeof baseAmount !== 'number') return null;
    if (baseToken.decimals === undefined || baseToken.decimals === null) return null;
    return parseUnits(baseAmount.toFixed(baseToken.decimals), baseToken.decimals).toString();
  }, [baseToken, baseAmount]);

  const quoteAmountRaw = useMemo(() => {
    if (!quoteToken || typeof quoteAmount !== 'number') return null;
    if (quoteToken.decimals === undefined || quoteToken.decimals === null) return null;
    return parseUnits(quoteAmount.toFixed(quoteToken.decimals), quoteToken.decimals).toString();
  }, [quoteToken, quoteAmount]);

  const handleSetBaseToken = useCallback(
    async (asset: Asset) => {
      setBaseTokenSelection(asset);
      setQuoteAmount(null);
      onBaseTokenChange?.(asset);
    },
    [setBaseTokenSelection, setQuoteAmount, onBaseTokenChange],
  );

  const handleSetQuoteToken = useCallback(
    async (asset: Asset) => {
      setQuoteTokenSelection(asset);
      onQuoteTokenChange?.(asset);
    },
    [setQuoteTokenSelection, onQuoteTokenChange],
  );

  const handleSetBaseAmount = useCallback(
    (value: number | null) => setBaseAmount(value),
    [setBaseAmount],
  );

  const handleSetQuoteAmount = useCallback(
    (value: number | null) => setQuoteAmount(value),
    [setQuoteAmount],
  );

  const handleSwapTokens = useCallback(() => {
    swapTokensSelection();
    useWidgetSwapUIStore.getState().toggleInverted();
    if (quoteTokenFromSelection) onBaseTokenChange?.(quoteTokenFromSelection);
    if (baseTokenFromSelection) onQuoteTokenChange?.(baseTokenFromSelection);
  }, [swapTokensSelection, baseTokenFromSelection, quoteTokenFromSelection, onBaseTokenChange, onQuoteTokenChange]);
  const handleClearForm = useCallback(() => clearAmounts(), [clearAmounts]);

  return {
    baseToken,
    baseAmount,
    quoteToken,
    quoteAmount,
    isBaseGasToken,
    isQuoteGasToken,
    isWrappingPair,
    isUnwrappingPair,
    baseBalance,
    quoteBalance,
    baseAmountRaw,
    quoteAmountRaw,
    isBaseBalanceLoading: isSwapBalanceLoading,
    isQuoteBalanceLoading: isSwapBalanceLoading,
    isRegistryLoading,
    setBaseToken: handleSetBaseToken,
    setQuoteToken: handleSetQuoteToken,
    setBaseAmount: handleSetBaseAmount,
    setQuoteAmount: handleSetQuoteAmount,
    swapTokens: handleSwapTokens,
    clearForm: handleClearForm,
  };
};
