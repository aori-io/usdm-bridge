import type { TokenMetadata } from 'usdm-bridge-sdk';
import { getActiveChainIds, getTokenLogoFallback } from '../../chainsConfig';
import type { Asset } from '../../types';
import { getTokenIcon } from '../../assets/tokenIcons';
import { getSymbolOverride } from '../../assets/symbolOverrides';
import { getWidgetSdk } from '../../client/sdk';

/**
 * Resolve a display logo for a token, preferring the venue-provided URI and
 * falling back through the widget's bundled/chain-specific icon sources. Logo
 * resolution is a widget (presentation) concern and stays here rather than in
 * the headless SDK.
 */
const resolveLogo = (
  chainId: number,
  address: string,
  symbol: string,
  logoURI?: string,
): string | undefined => {
  return (
    logoURI ||
    getTokenLogoFallback(chainId, address) ||
    getSymbolOverride(symbol) ||
    getTokenIcon(symbol) ||
    undefined
  );
};

/** Map venue-agnostic {@link TokenMetadata} from the SDK onto the widget `Asset`. */
export const tokenMetadataToAsset = (token: TokenMetadata): Asset => {
  const logoURI = resolveLogo(token.chainId, token.address, token.symbol, token.logoURI);
  return {
    symbol: token.symbol,
    address: token.address,
    chainId: token.chainId as Asset['chainId'],
    name: token.name || token.symbol,
    decimals: token.decimals,
    ...(logoURI ? { logoURI } : {}),
    price: token.price ?? 0,
    vol24h: undefined,
    change24h: undefined,
    marketCap: undefined,
  };
};

/**
 * Fetch the token registry (metadata + prices) via the SDK's venue-aggregated
 * {@link UsdmBridgeSdk.getTokenRegistry}. The widget no longer talks to any
 * venue's token API directly — the SDK owns metadata/pricing per venue. Results
 * are filtered to the widget's active chains and mapped to `Asset`.
 */
export async function fetchTokenRegistry(
  chainId?: number,
  signal?: AbortSignal,
): Promise<Asset[]> {
  const tokens = await getWidgetSdk().getTokenRegistry({
    ...(chainId ? { chainId } : {}),
    ...(signal ? { signal } : {}),
  });

  const activeChainIds = getActiveChainIds();
  return tokens
    .filter((t) => activeChainIds.includes(t.chainId))
    .filter((t) => !chainId || t.chainId === chainId)
    .map(tokenMetadataToAsset);
}

/**
 * Fetch Relay-supported tokens for a single chain via the SDK, on demand.
 * Used to augment the (typically Aori-sourced) registry with Relay's wider
 * token coverage in the asset selector. Relay tokens have no bundled price
 * here — per-token USD is resolved lazily for the active pair via
 * {@link UsdmBridgeSdk.getTokenPrice}.
 */
export async function fetchRelayTokensForChain(
  chainId: number,
  signal?: AbortSignal,
): Promise<Asset[]> {
  if (!chainId) return [];
  const tokens = await getWidgetSdk().getTokenRegistry({
    chainId,
    venues: ['relay'],
    limit: 100,
    verifiedOnly: true,
    ...(signal ? { signal } : {}),
  });
  return tokens.map(tokenMetadataToAsset);
}
