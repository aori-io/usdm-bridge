'use client';

import {
  getChainConfig,
  isGasToken,
  useChainData,
  useBulkBalances,
  useTokenData,
  useTokenWithLazyLoad,
  type Asset,
  type SupportedChainId,
} from '../internal';
import { useWalletState } from '../wallet/useWalletState';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useEnabledChainIds } from './useEnabledChainIds';
import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Self-contained data hook for WidgetWalletPanel.
 * Only fetches balances when the wallet view is active (isActive === true).
 */
export function useWidgetWalletData(isActive: boolean) {
  const { address, isConnected } = useWalletState();
  const { chainDataMap } = useChainData();
  const availableChainIds = useEnabledChainIds();
  const { getToken, tokenRegistry } = useTokenData();
  const { supportedInputTokens, supportedOutputTokens } = useWidgetConfig();

  const allSupportedTokens = useMemo(() => {
    if (!supportedInputTokens.length && !supportedOutputTokens.length) return [];
    const seen = new Set<string>();
    const result: Array<{ chainId: number; address: string }> = [];
    for (const t of [...supportedInputTokens, ...supportedOutputTokens]) {
      const key = `${t.chainId}-${t.address.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(t);
      }
    }
    return result;
  }, [supportedInputTokens, supportedOutputTokens]);

  const { balances, isLoading: balancesLoading, isError: balancesError, refetch } = useBulkBalances(
    address,
    availableChainIds as SupportedChainId[],
    {
      enabled: isConnected && isActive && !!address,
      refetchOnWindowFocus: false,
    },
    allSupportedTokens.length > 0 ? allSupportedTokens : undefined,
  );

  const supportedSet = useMemo(() => {
    if (!allSupportedTokens.length) return null;
    return new Set(allSupportedTokens.map((t) => `${t.chainId}-${t.address.toLowerCase()}`));
  }, [allSupportedTokens]);

  const groupedAssets = useMemo(() => {
    if (!balances || balances.length === 0) return {};

    const filtered = balances.filter((b) => {
      if (!b.assetInfo) return false;
      if (!b.balance || b.balance === '0') return false;
      if (supportedSet) {
        return supportedSet.has(`${b.chainId}-${b.address.toLowerCase()}`);
      }
      if (isGasToken(b.assetInfo as Asset)) return true;
      if (tokenRegistry.length === 0) return true;
      return tokenRegistry.some(
        (t) => t.address.toLowerCase() === b.address.toLowerCase() && t.chainId === b.chainId,
      );
    });

    return filtered.reduce((acc, b) => {
      const key = String(b.chainId);
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        token: b.address,
        amount: b.balance,
        decimals: b.decimals,
        assetInfo: b.assetInfo,
      });
      return acc;
    }, {} as Record<string, any[]>);
  }, [balances, tokenRegistry, supportedSet]);

  const totalBalance = useMemo(() => {
    if (!balances || balances.length === 0) return 0;
    return balances.reduce((total, b) => {
      if (!b.assetInfo || b.decimals === undefined) return total;
      return total + (parseFloat(b.balance) / 10 ** b.decimals) * (b.assetInfo.price || 0);
    }, 0);
  }, [balances]);

  const chains = useMemo(() => {
    if (availableChainIds.length === 0) return {};
    return availableChainIds.reduce(
      (acc, chainId) => {
        const apiData = chainDataMap[chainId as number];
        const staticConfig = getChainConfig(chainId as number);
        acc[chainId.toString()] = {
          chainId: chainId as number,
          name: staticConfig?.displayName || apiData?.chainKey || `Chain ${chainId}`,
        };
        return acc;
      },
      {} as Record<string, { chainId: number; name: string }>,
    );
  }, [availableChainIds, chainDataMap]);

  const tokenRegistryForPanel = useMemo(
    () => tokenRegistry.map((t) => ({ address: t.address, chainId: t.chainId })),
    [tokenRegistry],
  );

  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, []);

  const refetchBalances = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => refetch(), 2000);
  }, [refetch]);

  return {
    address,
    isConnected,
    groupedAssets,
    totalBalance,
    balancesLoading,
    balancesError,
    chains,
    getToken,
    useTokenWithLazyLoad,
    tokenRegistry: tokenRegistryForPanel,
    refetchBalances,
  };
}
