import type { AggregationConfig, VenuesConfig } from 'usdm-bridge-sdk';

const DEFAULT_AORI_API_URL = 'https://api.aori.io';

let _aoriApiBaseUrl: string | undefined;

export function setAoriApiBaseUrl(url: string | undefined): void {
  _aoriApiBaseUrl = url;
}

export function getAoriApiBaseUrl(): string | undefined {
  return _aoriApiBaseUrl;
}

/**
 * Raw base URL for direct fetch calls (e.g. status polling, order details).
 * Returns the configured proxy path (relative) or the public Aori API.
 */
export function getAoriApiUrl(): string {
  return _aoriApiBaseUrl || DEFAULT_AORI_API_URL;
}

/**
 * Absolute base URL suitable for the @aori/aori-ts SDK (which builds request
 * URLs via `new URL(path, base)` and therefore requires an absolute origin).
 * In the browser a relative proxy path is resolved against window.location.origin.
 * A trailing slash is enforced so `new URL('quote', base)` resolves to `<base>/quote`.
 */
export function getAoriSdkBaseUrl(): string {
  const base = getAoriApiUrl();
  let absolute = base;
  if (!/^https?:\/\//i.test(base)) {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    absolute = `${origin}${base.startsWith('/') ? '' : '/'}${base}`;
  }
  return absolute.endsWith('/') ? absolute : `${absolute}/`;
}

let _apiKey: string | undefined;

export function setApiKey(key: string | undefined): void {
  _apiKey = key;
}

export function getApiKey(): string | undefined {
  return _apiKey;
}

/**
 * Headers for direct fetch calls. When a proxy base URL is configured the key
 * is injected server-side, so we only attach `x-api-key` for direct API calls.
 */
export function getAoriHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!_aoriApiBaseUrl) {
    const key = getApiKey();
    if (key) headers['x-api-key'] = key;
  }
  return headers;
}

/**
 * API key passed to the SDK. When a proxy is configured this returns undefined
 * (the proxy injects the key); otherwise the client-side key is used.
 */
export function getAoriSdkApiKey(): string | undefined {
  return _aoriApiBaseUrl ? undefined : _apiKey;
}

let _rpcOverrides: Partial<Record<number, string | string[]>> | undefined;

export function setRpcOverrides(overrides: Partial<Record<number, string | string[]>> | undefined): void {
  _rpcOverrides = overrides;
}

export function getRpcOverrides(): Partial<Record<number, string | string[]>> | undefined {
  return _rpcOverrides;
}

export function getRpcUrlsForChain(chainId: number, defaultUrls: string[]): string[] {
  const override = _rpcOverrides?.[chainId];
  if (!override) return defaultUrls;
  const overrideUrls = Array.isArray(override) ? override : [override];
  return [...overrideUrls, ...defaultUrls];
}

// ── Multi-venue aggregation config ──────────────────────────────────────────
// Set synchronously by <SwapWidget> (like setApiKey) so the widget SDK singleton
// picks them up on first use. Left undefined for Aori-only (back-compat).

let _venuesConfig: VenuesConfig | undefined;

export function setVenuesConfig(config: VenuesConfig | undefined): void {
  _venuesConfig = config;
}

export function getVenuesConfig(): VenuesConfig | undefined {
  return _venuesConfig;
}

/** True when the Relay venue is configured + enabled for this widget instance. */
export function isRelayConfigured(): boolean {
  return _venuesConfig?.relay?.enabled === true;
}

let _aggregationConfig: AggregationConfig | undefined;

export function setAggregationConfig(config: AggregationConfig | undefined): void {
  _aggregationConfig = config;
}

export function getAggregationConfig(): AggregationConfig | undefined {
  return _aggregationConfig;
}
