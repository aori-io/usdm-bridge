import { getAllChainConfigs, staticChainsConfig, type StaticChainConfig } from '../../internal';
import type { Chain } from 'wagmi/chains';
import { http, fallback } from 'wagmi';

export function buildTransports(
  rpcOverrides?: Partial<Record<number, string | string[]>>,
) {
  const chainEntries = Object.entries(staticChainsConfig) as [string, StaticChainConfig][];
  return Object.fromEntries(
    chainEntries.map(([id, c]) => {
      const override = rpcOverrides?.[Number(id)];
      const overrideUrls = override
        ? Array.isArray(override) ? override : [override]
        : [];
      const urls = overrideUrls.length > 0
        ? [...overrideUrls, ...c.rpcUrls]
        : c.rpcUrls;
      return [
        id,
        urls.length > 1
          ? fallback(urls.map((url) => http(url, { batch: { batchSize: 50, wait: 50 } })))
          : http(urls[0], { batch: { batchSize: 50, wait: 50 } }),
      ];
    }),
  );
}

export const wagmiChains = getAllChainConfigs().map((c) => c.wagmiChain) as [Chain, ...Chain[]];
