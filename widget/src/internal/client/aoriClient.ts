import { Aori } from '@aori/aori-ts';
import { getWidgetSdk } from './sdk';

/**
 * HMR/StrictMode-safe accessor for the underlying `@aori/aori-ts` client.
 *
 * The widget no longer creates its own Aori client — it delegates to the shared
 * `usdm-bridge-sdk` instance (`getWidgetSdk().client()`) so the SDK is the
 * single source of truth for the Aori integration. Components still use the
 * resolved client for synchronous chain lookups (`getChain`) via `useAori()`.
 */
export const getAoriClient = (): Promise<Aori> => getWidgetSdk().client();
