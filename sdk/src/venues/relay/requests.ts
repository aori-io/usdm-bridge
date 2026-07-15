import type { VenueHistoryEntry } from '../types';
import { type RelayEnvironment, relayFetch, resolveRelayUrl } from './client';
import { mapRelayStatus } from './status';
import type { RelayStatusResponse } from './types';

interface RelayTxRef {
  hash?: string;
  chainId?: number;
  timestamp?: number;
}

interface RelayRequestCurrency {
  currency?: { chainId?: number; address?: string; symbol?: string; decimals?: number };
  amount?: string;
  amountUsd?: string;
}

/** A single entry from `GET /requests/v2` (only the fields we consume). */
export interface RelayRequest {
  id: string;
  status: RelayStatusResponse['status'];
  user?: string;
  recipient?: string;
  createdAt?: string;
  updatedAt?: string;
  data?: {
    inTxs?: RelayTxRef[];
    outTxs?: RelayTxRef[];
    metadata?: {
      sender?: string;
      recipient?: string;
      currencyIn?: RelayRequestCurrency;
      currencyOut?: RelayRequestCurrency;
    };
  };
}

export interface RelayRequestsResponse {
  requests?: RelayRequest[];
  continuation?: string;
}

export interface GetRelayHistoryOptions {
  /** Max entries (Relay caps at 50). Default 50. */
  limit?: number;
  signal?: AbortSignal;
}

/** Map a raw Relay request onto a normalized history entry. */
function toHistoryEntry(r: RelayRequest): VenueHistoryEntry {
  const cin = r.data?.metadata?.currencyIn;
  const cout = r.data?.metadata?.currencyOut;
  const inTx = r.data?.inTxs?.[0];
  const outTx = r.data?.outTxs?.[0];

  const parsedCreatedAt = r.createdAt ? Date.parse(r.createdAt) : NaN;
  const ms = Number.isFinite(parsedCreatedAt)
    ? parsedCreatedAt
    : inTx?.timestamp
      ? inTx.timestamp * 1000
      : Date.now();

  const srcChainId = cin?.currency?.chainId ?? inTx?.chainId;
  const dstChainId = cout?.currency?.chainId ?? outTx?.chainId;

  return {
    venue: 'relay',
    id: r.id,
    status: mapRelayStatus(r.status),
    ...(srcChainId != null ? { srcChainId } : {}),
    ...(dstChainId != null ? { dstChainId } : {}),
    ...(cin?.currency?.address ? { inputToken: cin.currency.address } : {}),
    ...(cout?.currency?.address ? { outputToken: cout.currency.address } : {}),
    ...(cin?.amount ? { inputAmount: cin.amount } : {}),
    ...(cout?.amount ? { outputAmount: cout.amount } : {}),
    ...(inTx?.hash ? { srcTxHash: inTx.hash } : {}),
    ...(outTx?.hash ? { dstTxHash: outTx.hash } : {}),
    timestampMs: Number.isFinite(ms) ? ms : Date.now(),
    explorerUrl: `https://relay.link/transaction/${r.id}`,
    raw: r,
  };
}

/**
 * Fetch a user's Relay transaction history (`GET /requests/v2?user=…`) and map
 * it onto normalized {@link VenueHistoryEntry}s. Resolves to `[]` on failure so
 * a failing Relay history never breaks an aggregated view.
 */
export async function getRelayHistory(
  env: RelayEnvironment,
  user: string,
  opts: GetRelayHistoryOptions = {},
): Promise<VenueHistoryEntry[]> {
  if (!user) return [];
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 50);
  const url = resolveRelayUrl(env, `/requests/v2?user=${encodeURIComponent(user)}&limit=${limit}`);
  const res = await relayFetch<RelayRequestsResponse>(env, url, {
    method: 'GET',
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const requests = Array.isArray(res?.requests) ? res.requests : [];
  return requests.filter((r) => r && typeof r.id === 'string' && r.id.length > 0).map(toHistoryEntry);
}
