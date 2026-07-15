/**
 * Per-instance environment for the SDK. Held on each `UsdmBridgeSdk` instance so
 * multiple SDKs can coexist (e.g. one talking directly to the Aori API with a
 * key, one behind an integrator proxy).
 */

export const DEFAULT_AORI_API_URL = 'https://api.aori.io';

export interface SdkEnvironmentInit {
  /** Direct Aori API key. Omit and set `aoriApiBaseUrl` to a proxy in production. */
  apiKey?: string;
  /** Override the Aori API base URL (absolute origin, or a relative proxy path like `/api/aori`). */
  aoriApiBaseUrl?: string;
  rpcOverrides?: Partial<Record<number, string | string[]>>;
}

export class SdkEnvironment {
  apiKey?: string;
  aoriApiBaseUrl?: string;
  rpcOverrides: Partial<Record<number, string | string[]>>;

  constructor(init: SdkEnvironmentInit = {}) {
    this.apiKey = init.apiKey;
    this.aoriApiBaseUrl = init.aoriApiBaseUrl;
    this.rpcOverrides = init.rpcOverrides ?? {};
  }

  /**
   * Raw configured base URL (proxy path or custom origin), or the public Aori
   * API. Suitable for direct `fetch` calls.
   */
  getAoriApiUrl(): string {
    return this.aoriApiBaseUrl || DEFAULT_AORI_API_URL;
  }

  /**
   * Absolute base URL suitable for `@aori/aori-ts` (which builds request URLs
   * via `new URL(path, base)` and therefore requires an absolute origin with a
   * trailing slash). In the browser a relative proxy path is resolved against
   * `window.location.origin`.
   */
  getAoriSdkBaseUrl(): string {
    const base = this.getAoriApiUrl();
    let absolute = base;
    if (!/^https?:\/\//i.test(base)) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      absolute = `${origin}${base.startsWith('/') ? '' : '/'}${base}`;
    }
    return absolute.endsWith('/') ? absolute : `${absolute}/`;
  }

  /**
   * API key to hand to the Aori client / direct fetches. When `aoriApiBaseUrl`
   * is set we assume an integrator proxy injects the key server-side, so no key
   * is sent from the client. The key is only forwarded when hitting the API
   * directly.
   */
  getEffectiveApiKey(): string | undefined {
    return this.aoriApiBaseUrl ? undefined : this.apiKey;
  }

  /** Headers for direct `fetch` calls (order history, details, etc.). */
  getAoriHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = this.getEffectiveApiKey();
    if (key) headers['x-api-key'] = key;
    return headers;
  }

  /**
   * Resolve RPC URLs for a chain: integrator overrides first, then the
   * `defaultUrls` (from the chain registry) as fallback.
   */
  getRpcUrlsForChain(chainId: number, defaultUrls: string[] = []): string[] {
    const override = this.rpcOverrides[chainId];
    if (!override) return defaultUrls;
    const overrideUrls = Array.isArray(override) ? override : [override];
    return [...overrideUrls, ...defaultUrls];
  }
}
