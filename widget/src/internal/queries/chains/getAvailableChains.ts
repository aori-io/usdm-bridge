import {
  getAllChainConfigs,
  getChainIdToKeyMapping,
  getChainKeyToIdMapping,
} from '../../chainsConfig';

export interface AvailableChain {
  chainKey: string;
  chainId: number;
  chainType: string;
  name: string;
  shortName: string;
  nativeCurrency: {
    chainKey: string;
    address: string;
    decimals: number;
    symbol: string;
    name: string;
  };
}

// Chain metadata is fully static (from chainsConfig). The Aori API no longer
// needs to be hit to resolve chain keys/ids — these helpers read the config.

export function getChainIdForKey(chainKey: string): number | undefined {
  return getChainKeyToIdMapping()[chainKey.toLowerCase()];
}

export function getKeyForChainId(chainId: number): string | undefined {
  return getChainIdToKeyMapping()[chainId];
}

function buildAvailableChains(): AvailableChain[] {
  return getAllChainConfigs().map((c) => ({
    chainKey: c.key,
    chainId: c.id,
    chainType: 'EVM',
    name: c.displayName ?? c.key,
    shortName: c.shortName ?? c.displayName ?? c.key,
    nativeCurrency: {
      chainKey: c.key,
      address: c.nativeAsset.address,
      decimals: c.nativeAsset.decimals,
      symbol: c.nativeAsset.symbol,
      name: c.nativeAsset.name,
    },
  }));
}

let cachedChainData: AvailableChain[] | null = null;

function getChainData(): AvailableChain[] {
  if (!cachedChainData) cachedChainData = buildAvailableChains();
  return cachedChainData;
}

export async function getAvailableChainData(): Promise<AvailableChain[]> {
  return getChainData();
}

export async function getAvailableChains(): Promise<number[]> {
  return getChainData().map((chain) => chain.chainId);
}

export async function isChainAvailable(chainId: number): Promise<boolean> {
  return getChainData().some((c) => c.chainId === chainId);
}

export function getCachedChainData(): AvailableChain[] | null {
  return getChainData();
}

export function getCachedChainByChainId(chainId: number): AvailableChain | undefined {
  return getChainData().find((c) => c.chainId === chainId);
}

export function clearAvailableChainsCache(): void {
  cachedChainData = null;
}
