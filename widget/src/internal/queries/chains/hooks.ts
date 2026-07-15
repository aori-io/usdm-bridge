import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  getActiveChainConfigs,
  getAvailableActiveChainConfigs,
} from '../../chainsConfig';
import {
  type AvailableChain,
  getAvailableChainData,
} from './getAvailableChains';
import { chainKeys } from './queryKeys';

const EMPTY_CHAINS: AvailableChain[] = [];

export function useChainRegistry() {
  return useQuery({
    queryKey: chainKeys.list(),
    queryFn: getAvailableChainData,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
  });
}

export function useChainData() {
  const { data, isLoading, error } = useChainRegistry();
  const chains = data ?? EMPTY_CHAINS;

  const chainMap = useMemo(() => {
    const byId = new Map<number, AvailableChain>();
    const byKey = new Map<string, AvailableChain>();
    for (const chain of chains) {
      byId.set(chain.chainId, chain);
      byKey.set(chain.chainKey.toLowerCase(), chain);
    }
    return { byId, byKey };
  }, [chains]);

  const chainDataMap = useMemo(() => {
    const map: Record<number, AvailableChain> = {};
    for (const chain of chains) {
      map[chain.chainId] = chain;
    }
    return map;
  }, [chains]);

  const availableChainIds = useMemo(() => {
    if (chains.length === 0) {
      return getActiveChainConfigs().map((c) => c.id);
    }
    const chainIds = chains.map((c) => c.chainId);
    const activeChains = getAvailableActiveChainConfigs(chainIds);
    return activeChains.map((c) => c.id);
  }, [chains]);

  const getChainData = useCallback(
    (chainId: number): AvailableChain | undefined => {
      return chainMap.byId.get(chainId);
    },
    [chainMap],
  );

  const getChainDataByKey = useCallback(
    (chainKey: string): AvailableChain | undefined => {
      return chainMap.byKey.get(chainKey.toLowerCase());
    },
    [chainMap],
  );

  return {
    chains,
    chainDataMap,
    availableChainIds,
    getChainData,
    getChainDataByKey,
    isLoading,
    error,
  };
}
