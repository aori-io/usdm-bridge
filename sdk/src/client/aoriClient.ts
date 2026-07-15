import { Aori } from '@aori/aori-ts';
import type { SdkEnvironment } from '../api/environment';

/**
 * Lazily-created, per-environment `@aori/aori-ts` client.
 *
 * `Aori.create` performs network calls (fetching the chain registry and EIP-712
 * domain), so we cache one promise per `SdkEnvironment` and reuse it across all
 * SDK calls. Keying on the environment lets multiple SDK instances (e.g. direct
 * vs. proxied) each keep their own client.
 */
const cache = new WeakMap<SdkEnvironment, Promise<Aori>>();

export function getAoriClient(env: SdkEnvironment): Promise<Aori> {
  const existing = cache.get(env);
  if (existing) return existing;

  const created = Aori.create(
    env.getAoriSdkBaseUrl(),
    undefined,
    env.getEffectiveApiKey(),
  );
  cache.set(env, created);
  return created;
}
