/**
 * Relay API environment + fetch helper. Mirrors the Aori env's proxy/key policy:
 * when `apiBaseUrl` points at an integrator proxy, the client-side key is
 * omitted (the proxy injects it server-side).
 */

export const DEFAULT_RELAY_API_URL = 'https://api.relay.link';

export interface RelayEnvironmentInit {
  /** Override the Relay API base URL (absolute origin, or a relative proxy path like `/api/relay`). */
  apiBaseUrl?: string;
  /** Direct Relay API key. Omit and set `apiBaseUrl` to a proxy in production. */
  apiKey?: string;
}

export class RelayEnvironment {
  apiBaseUrl?: string;
  apiKey?: string;

  constructor(init: RelayEnvironmentInit = {}) {
    this.apiBaseUrl = init.apiBaseUrl;
    this.apiKey = init.apiKey;
  }

  /** Raw configured base URL (proxy path or custom origin), or the public Relay API. */
  getApiUrl(): string {
    return this.apiBaseUrl || DEFAULT_RELAY_API_URL;
  }

  /**
   * Absolute base URL (no trailing slash). In the browser a relative proxy path
   * is resolved against `window.location.origin`.
   */
  getBaseUrl(): string {
    const base = this.getApiUrl();
    let absolute = base;
    if (!/^https?:\/\//i.test(base)) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      absolute = `${origin}${base.startsWith('/') ? '' : '/'}${base}`;
    }
    return absolute.endsWith('/') ? absolute.slice(0, -1) : absolute;
  }

  /**
   * API key sent from the client. When `apiBaseUrl` is set we assume an
   * integrator proxy injects the key, so nothing is sent from the client.
   */
  getEffectiveApiKey(): string | undefined {
    return this.apiBaseUrl ? undefined : this.apiKey;
  }

  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = this.getEffectiveApiKey();
    if (key) headers['x-api-key'] = key;
    return headers;
  }
}

/** Error thrown by Relay HTTP calls. Carries the HTTP status when available. */
export class RelayApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RelayApiError';
    this.status = status;
  }
}

/**
 * Resolve a Relay endpoint path (possibly relative, possibly already absolute)
 * against the environment base URL. Relay `check`/`post` endpoints come back as
 * root-relative paths like `/intents/status?requestId=…`.
 */
export function resolveRelayUrl(env: RelayEnvironment, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const base = env.getBaseUrl();
  return `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}

export interface RelayFetchOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Perform a Relay HTTP request against a resolved URL and parse the JSON body.
 * Throws {@link RelayApiError} on non-2xx responses.
 */
export async function relayFetch<T>(
  env: RelayEnvironment,
  url: string,
  options: RelayFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: env.getHeaders(),
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new RelayApiError(`Relay request failed: ${msg}`);
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === 'object'
        ? ((parsed as { message?: string; error?: string }).message ??
          (parsed as { error?: string }).error ??
          JSON.stringify(parsed))
        : String(parsed ?? '');
    throw new RelayApiError(`Relay API error ${response.status}: ${detail}`, response.status);
  }

  return parsed as T;
}
