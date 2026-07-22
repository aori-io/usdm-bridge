import { UsdmBridgeSdk } from 'usdm-bridge-sdk';
import {
  getAggregationConfig,
  getApiKey,
  getAoriApiBaseUrl,
  getRpcOverrides,
  getTokenSourcesConfig,
  getVenuesConfig,
} from '../environment';

/**
 * HMR/StrictMode-safe singleton `UsdmBridgeSdk` instance.
 *
 * The widget consumes the Aori API exclusively through this SDK instance (quote,
 * sign, submit, status, order history, order details). It is created lazily on
 * first use so it picks up the `apiKey` / `aoriApiBaseUrl` / `rpcOverrides` set
 * synchronously by <SwapWidget> before any Aori call is made.
 */
export const getWidgetSdk = (): UsdmBridgeSdk => {
  const g = globalThis as unknown as { __usdmBridgeWidgetSdk?: UsdmBridgeSdk };
  if (!g.__usdmBridgeWidgetSdk) {
    const apiKey = getApiKey();
    const aoriApiBaseUrl = getAoriApiBaseUrl();
    const rpcOverrides = getRpcOverrides();
    const venues = getVenuesConfig();
    const aggregation = getAggregationConfig();
    const tokenSources = getTokenSourcesConfig();
    g.__usdmBridgeWidgetSdk = new UsdmBridgeSdk({
      ...(apiKey != null ? { apiKey } : {}),
      ...(aoriApiBaseUrl != null ? { aoriApiBaseUrl } : {}),
      ...(rpcOverrides != null ? { rpcOverrides } : {}),
      ...(venues != null ? { venues } : {}),
      ...(aggregation != null ? { aggregation } : {}),
      ...(tokenSources != null &&
      (tokenSources.sources != null ||
        tokenSources.sourcePriority != null ||
        tokenSources.replaceVenueTokens != null)
        ? { tokens: tokenSources }
        : {}),
    });
  }
  return g.__usdmBridgeWidgetSdk;
};
