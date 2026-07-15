'use client';

import type { VenueHistoryEntry, VenueId } from 'usdm-bridge-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Asset, getChainIdForKey, getWidgetSdk, useTokenData } from '../internal';

const PAGE_SIZE = 50;
const FETCH_LIMIT = 100;
const RELAY_LIMIT = 50;
const USDM_ADDRESS = '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7';
const MEGAETH_CHAIN = 'megaeth';

export interface EnrichedOrderResult {
  orderHash?: string;
  quoteId?: string;
  /** Which venue executed the order — drives the venue badge in the UI. */
  venue?: VenueId;
  enrichedTokens?: {
    base: Asset | null;
    quote: Asset | null;
  };
  [key: string]: unknown;
}

interface AoriOrder {
  orderHash: string;
  offerer: string;
  recipient: string;
  inputToken: string;
  inputAmount: string;
  inputChain: string;
  inputTokenValueUsd?: string;
  outputToken: string;
  outputAmount: string;
  outputChain: string;
  outputTokenValueUsd?: string;
  startTime: number;
  endTime: number;
  srcTx: string | null;
  dstTx: string | null;
  timestamp: number;
  status: string;
}

interface AoriQueryResponse {
  orders: AoriOrder[];
  pagination: {
    currentPage: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}

/** Unified, venue-tagged entry with numeric chain ids and ms timestamps. */
interface RawHistoryEntry {
  venue: VenueId;
  id: string;
  status: string;
  inputChainId?: number;
  outputChainId?: number;
  inputToken?: string;
  inputAmount?: string;
  outputToken?: string;
  outputAmount?: string;
  srcTx?: string | null;
  dstTx?: string | null;
  timestampMs: number;
  explorerUrl?: string;
}

interface UseWidgetOrderHistoryReturn {
  orders: EnrichedOrderResult[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  totalOrders: number;
}

/** Normalize a timestamp (seconds or ms) to milliseconds. */
function toMs(ts: number): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return ts < 1e12 ? ts * 1000 : ts;
}

function aoriToRaw(order: AoriOrder): RawHistoryEntry {
  return {
    venue: 'aori',
    id: order.orderHash,
    status: (order.status || '').toLowerCase(),
    inputChainId: getChainIdForKey(order.inputChain) ?? undefined,
    outputChainId: getChainIdForKey(order.outputChain) ?? undefined,
    inputToken: order.inputToken,
    inputAmount: order.inputAmount,
    outputToken: order.outputToken,
    outputAmount: order.outputAmount,
    srcTx: order.srcTx,
    dstTx: order.dstTx,
    timestampMs: toMs(Number(order.timestamp) || Number(order.startTime)),
    explorerUrl: `https://aoriscan.io/order/${order.orderHash}`,
  };
}

function relayToRaw(e: VenueHistoryEntry): RawHistoryEntry {
  return {
    venue: 'relay',
    id: e.id,
    status: (e.status || '').toLowerCase(),
    inputChainId: e.srcChainId,
    outputChainId: e.dstChainId,
    inputToken: e.inputToken,
    inputAmount: e.inputAmount,
    outputToken: e.outputToken,
    outputAmount: e.outputAmount,
    srcTx: e.srcTxHash ?? null,
    dstTx: e.dstTxHash ?? null,
    timestampMs: toMs(e.timestampMs),
    explorerUrl: e.explorerUrl,
  };
}

function enrich(
  entry: RawHistoryEntry,
  getToken: (chainId: number, address: string) => Asset | undefined,
): EnrichedOrderResult {
  const base = entry.inputChainId && entry.inputToken ? getToken(entry.inputChainId, entry.inputToken) ?? null : null;
  const quote =
    entry.outputChainId && entry.outputToken ? getToken(entry.outputChainId, entry.outputToken) ?? null : null;

  return {
    orderHash: entry.id,
    quoteId: entry.id,
    venue: entry.venue,
    status: entry.status,
    eventType: entry.status,
    inputToken: entry.inputToken,
    inputAmount: entry.inputAmount,
    outputToken: entry.outputToken,
    outputAmount: entry.outputAmount,
    timestamp: entry.timestampMs,
    createdAt: entry.timestampMs,
    srcTx: entry.srcTx ?? null,
    dstTx: entry.dstTx ?? null,
    explorerUrl: entry.explorerUrl,
    enrichedTokens: { base, quote },
  };
}

export function useWidgetOrderHistory(
  userAddress: string | null | undefined,
  enabled: boolean,
): UseWidgetOrderHistoryReturn {
  const { getToken } = useTokenData();

  const [rawEntries, setRawEntries] = useState<RawHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userAddress) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const sdk = getWidgetSdk();
      const baseParams = { offerer: userAddress, limit: FETCH_LIMIT, page: 0 };

      // Individual venue failures degrade to empty (graceful); aborts propagate.
      const safeQuery = async (
        params: Parameters<typeof sdk.queryOrders>[0],
      ): Promise<AoriQueryResponse | null> => {
        try {
          return (await sdk.queryOrders(params, { signal: controller.signal })) as AoriQueryResponse;
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') throw e;
          return null;
        }
      };

      const safeRelay = async (): Promise<VenueHistoryEntry[]> => {
        try {
          return await sdk.queryRelayHistory(userAddress, { limit: RELAY_LIMIT, signal: controller.signal });
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') throw e;
          return [];
        }
      };

      const [inputData, outputData, relayData] = await Promise.all([
        safeQuery({ ...baseParams, inputChain: MEGAETH_CHAIN, inputToken: USDM_ADDRESS }),
        safeQuery({ ...baseParams, outputChain: MEGAETH_CHAIN, outputToken: USDM_ADDRESS }),
        safeRelay(),
      ]);

      // Dedupe within each venue, then merge and sort newest-first.
      const seen = new Set<string>();
      const merged: RawHistoryEntry[] = [];
      const push = (entry: RawHistoryEntry) => {
        const key = `${entry.venue}:${entry.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(entry);
        }
      };
      for (const o of [...(inputData?.orders ?? []), ...(outputData?.orders ?? [])]) push(aoriToRaw(o));
      for (const e of relayData) push(relayToRaw(e));
      merged.sort((a, b) => b.timestampMs - a.timestampMs);

      setRawEntries(merged);
      setVisibleCount(PAGE_SIZE);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setError((e as { message?: string })?.message ?? 'Failed to load order history');
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    if (!enabled || !userAddress) {
      setRawEntries([]);
      setVisibleCount(PAGE_SIZE);
      return;
    }
    fetchAll();
    return () => abortRef.current?.abort();
  }, [enabled, userAddress, fetchAll]);

  const hasMore = visibleCount < rawEntries.length;

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, rawEntries.length));
  }, [hasMore, rawEntries.length]);

  const orders = useMemo(
    () => rawEntries.slice(0, visibleCount).map((e) => enrich(e, getToken)),
    [rawEntries, visibleCount, getToken],
  );

  return {
    orders,
    isLoading,
    error,
    hasMore,
    loadMore,
    totalOrders: rawEntries.length,
  };
}
