'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import {
  chainKeys,
  clearAvailableChainsCache,
  getWidgetSdk,
  registerDynamicChains,
} from '../internal';

// Module-level guards so the (potentially many-mounted) hook only fetches and
// registers Relay's chain list once per page load.
let registrationInFlight = false;
let registrationDone = false;

/**
 * When the aggregator is running with Relay configured, fetch Relay's supported
 * EVM chains and merge them into the widget chain registry so they appear in the
 * chain/token selectors. Best-effort: failures leave the Aori-only chain set
 * intact. Idempotent across mounts and StrictMode double-invokes.
 */
export function useRelayChainRegistration(): void {
  const { aggregatorEnabled, aggregatorVenues } = useWidgetConfig();
  const queryClient = useQueryClient();
  const relayEnabled = aggregatorEnabled && aggregatorVenues.includes('relay');

  useEffect(() => {
    if (!relayEnabled || registrationDone || registrationInFlight) return;
    let cancelled = false;
    registrationInFlight = true;

    void (async () => {
      try {
        const sdk = getWidgetSdk();
        const chains = await sdk.getRelayChains();
        if (cancelled) return;

        const added = registerDynamicChains(
          chains.map((c) => ({
            id: c.id,
            key: c.key,
            name: c.name,
            ...(c.rpcUrl ? { rpcUrl: c.rpcUrl } : {}),
            ...(c.explorerUrl ? { explorerUrl: c.explorerUrl } : {}),
            ...(c.iconUrl ? { iconUrl: c.iconUrl } : {}),
            nativeCurrency: c.nativeCurrency,
          })),
        );
        registrationDone = true;

        if (added > 0) {
          clearAvailableChainsCache();
          void queryClient.invalidateQueries({ queryKey: chainKeys.list() });
          void queryClient.invalidateQueries({ queryKey: ['tokens'] });
        }
      } catch {
        // Best-effort: leave the curated chain set in place on failure.
      } finally {
        registrationInFlight = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [relayEnabled, queryClient]);
}
