import type { VenuesConfig, VenueId } from 'usdm-bridge-sdk';
import type { AoriSwapWidgetConfig } from './types';

/**
 * Whether the widget should run in aggregator mode (multi-venue quote list +
 * user selection) or a non-default single venue. When this is false the widget
 * behaves exactly as before (Aori-only via `RfqProvider`).
 */
export function isAggregatorActive(config: AoriSwapWidgetConfig): boolean {
  if (config.aggregator?.enabled === true) return true;
  if (config.venue != null && config.venue !== 'aori') return true;
  return false;
}

/**
 * The ordered list of venues the aggregator should quote across. In single-venue
 * override mode this is just that venue; in aggregator mode it's the configured
 * list (defaulting to Aori + Relay when Relay is configured).
 */
export function resolveAggregatorVenues(config: AoriSwapWidgetConfig): VenueId[] {
  if (config.aggregator?.enabled === true) {
    if (config.aggregator.venues && config.aggregator.venues.length > 0) {
      return config.aggregator.venues;
    }
    return config.venues?.relay ? ['aori', 'relay'] : ['aori'];
  }
  if (config.venue != null && config.venue !== 'aori') return [config.venue];
  return ['aori'];
}

/**
 * Translate the widget-level venue config into the SDK's `venues` config shape.
 * Returns `undefined` for the pure Aori-only case so the SDK stays in its
 * backward-compatible default (no venue registry customization).
 */
export function buildSdkVenuesConfig(config: AoriSwapWidgetConfig): VenuesConfig | undefined {
  const venues = resolveAggregatorVenues(config);
  const relay = config.venues?.relay;
  const wantsRelay = venues.includes('relay') || relay != null;
  const wantsAori = venues.includes('aori');

  // Pure Aori with no Relay config → let the SDK use its default (Aori-only).
  if (wantsAori && !wantsRelay) return undefined;

  return {
    aori: { enabled: wantsAori },
    ...(wantsRelay
      ? {
          relay: {
            enabled: true,
            ...(relay?.apiBaseUrl != null ? { apiBaseUrl: relay.apiBaseUrl } : {}),
            ...(relay?.apiKey != null ? { apiKey: relay.apiKey } : {}),
          },
        }
      : {}),
  };
}
