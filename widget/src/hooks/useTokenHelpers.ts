'use client';

import { useTokenData, getChainKeyToIdMapping } from '../internal';
import { useMemo } from 'react';

export const useTokensForChain = (chainId: number) => {
  const { tokenRegistry, isLoadingRegistry, error } = useTokenData();

  const tokens = useMemo(() => {
    return tokenRegistry.filter((token) => token.chainId === chainId);
  }, [tokenRegistry, chainId]);

  return { tokens, isLoading: isLoadingRegistry, error };
};

export const useIsTokenSupported = (address: string, chainId: number) => {
  const { tokenRegistry } = useTokenData();

  return useMemo(() => {
    if (!address || !tokenRegistry.length) return false;
    return tokenRegistry.some(
      (token) =>
        token.address.toLowerCase() === address.toLowerCase() &&
        token.chainId === chainId,
    );
  }, [tokenRegistry, address, chainId]);
};

export const useTokenByAddress = (address: string, chainId: number) => {
  const { getToken } = useTokenData();

  return useMemo(() => {
    if (!address || !chainId) return undefined;
    return getToken(chainId, address);
  }, [getToken, address, chainId]);
};

export const SUPPORTED_CHAINS = getChainKeyToIdMapping();
