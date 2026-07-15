'use client';

import type { NormalizedQuote, VenueId } from 'usdm-bridge-sdk';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { formatUnits } from 'viem';
import { type Asset, getWidgetSdk, toBigInt } from '../internal';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useWalletScreening } from '../context/WalletScreeningContext';
import { useWalletState } from '../wallet/useWalletState';

export type QuotesStatus = 'idle' | 'polling' | 'fresh' | 'stale' | 'refreshing';
type InputState = 'idle' | 'typing' | 'settled';
export type VenueStatus = 'idle' | 'loading' | 'ok' | 'error';

interface PollingParams {
  inputToken: Asset;
  outputToken: Asset;
  inputAmount: string;
  setOutputAmount?: (amount: number | null) => void;
}

interface InputChangeParams {
  amount: number | null;
  inputToken: Asset;
  outputToken: Asset;
  setOutputAmount: (amount: number | null) => void;
}

export interface VenueQuoteError {
  venue: VenueId;
  error: string;
}

interface QuotesContextType {
  status: QuotesStatus;
  inputState: InputState;
  quotes: NormalizedQuote[];
  errors: VenueQuoteError[];
  venueStatus: Record<string, VenueStatus>;
  selectedQuoteId: string | null;
  selectedQuote: NormalizedQuote | null;
  bestQuoteId: string | null;
  error: string | null;
  /** True once all venues have settled with zero quotes. */
  noQuotes: boolean;
  /** True while a fetch is in-flight and not every venue has responded yet. */
  awaitingQuotes: boolean;

  setSelectedQuote: (quoteId: string) => void;
  ensureForParams: (params: PollingParams) => void;
  stop: () => void;
  refresh: () => void;
  clear: () => void;
  handleInputChange: (params: InputChangeParams) => void;
}

const QuotesContext = createContext<QuotesContextType | undefined>(undefined);

const POLLING_INTERVAL_MS = 20_000;
const STALE_WINDOW_MS = 45_000;
const TYPING_SETTLE_DELAY_MS = 1_000;

/** Best-first ordering: highest gross output, tie-broken by faster ETA. */
const sortByGrossOutputDesc = (a: NormalizedQuote, b: NormalizedQuote): number => {
  try {
    const av = BigInt(a.outputAmount);
    const bv = BigInt(b.outputAmount);
    if (av > bv) return -1;
    if (av < bv) return 1;
  } catch {
    /* fall through to ETA tie-break */
  }
  const at = a.estimatedTimeSec ?? Number.POSITIVE_INFINITY;
  const bt = b.estimatedTimeSec ?? Number.POSITIVE_INFINITY;
  return at - bt;
};

interface QuotesProviderProps {
  children: React.ReactNode;
  recipient?: string | null;
}

export const QuotesProvider: React.FC<QuotesProviderProps> = ({ children, recipient: recipientProp }) => {
  const { address: userAddress } = useWalletState();
  const { isBlocked: isWalletBlocked } = useWalletScreening();
  const { aggregatorVenues } = useWidgetConfig();
  const recipient = recipientProp || userAddress;

  const [status, setStatus] = useState<QuotesStatus>('idle');
  const [inputState, setInputState] = useState<InputState>('idle');
  const [quotes, setQuotes] = useState<NormalizedQuote[]>([]);
  const [errors, setErrors] = useState<VenueQuoteError[]>([]);
  // Selection is tracked by VENUE (stable), not by quoteId — a venue's native id
  // (Relay requestId / Aori orderHash) changes on every refetch, so tracking by
  // id would churn the selection and force row remounts. `null` = follow best.
  const [selectedVenue, setSelectedVenue] = useState<VenueId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noQuotes, setNoQuotes] = useState(false);
  // True while a getQuotes cycle is in-flight (initial fetch or background poll).
  const [fetching, setFetching] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const lastParamsRef = useRef<PollingParams | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRequestId = useRef(0);
  const lastRequestAtRef = useRef(0);
  const lastStartAtRef = useRef(0);
  const hasQuotesRef = useRef(false);
  // Mirror of the latest committed quotes, used to seed the next poll so a
  // venue that fails/times-out keeps its last-good quote instead of clearing.
  const quotesRef = useRef<NormalizedQuote[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror of `selectedVenue` so the poll loop can reflect the right quote's
  // output amount without adding a hook dependency.
  const selectedVenueRef = useRef<VenueId | null>(null);

  const clearTimers = useCallback(() => {
    if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    pollingTimerRef.current = null;
    staleTimerRef.current = null;
    typingTimerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    latestRequestId.current = 0;
    setFetching(false);
    setStatus(() => (hasQuotesRef.current ? 'fresh' : 'idle'));
  }, [clearTimers]);

  const clear = useCallback(() => {
    stop();
    lastParamsRef.current = null;
    setQuotes([]);
    setErrors([]);
    setSelectedVenue(null);
    setError(null);
    setNoQuotes(false);
    setStatus('idle');
    setInputState('idle');
  }, [stop]);

  const scheduleStaleFrom = useCallback((receivedAtMs: number) => {
    if (!receivedAtMs) return;
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    const delay = Math.max(0, receivedAtMs + STALE_WINDOW_MS - Date.now());
    staleTimerRef.current = setTimeout(() => {
      setStatus((prev) => (prev === 'idle' ? 'idle' : 'stale'));
    }, delay);
  }, []);

  const requestQuotesOnce = useCallback(
    async (params: PollingParams, sessionId: string) => {
      const { inputToken, outputToken, inputAmount, setOutputAmount } = params;
      if (!inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) <= 0) return;
      if (inputToken.decimals == null || outputToken.decimals == null) return;

      const now = Date.now();
      if (now - (lastRequestAtRef.current || 0) < POLLING_INTERVAL_MS - 10) return;

      const requestId = ++latestRequestId.current;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const isCurrent = () => requestId === latestRequestId.current && sessionIdRef.current === sessionId;

      // Seed from the last-good quotes so a venue that fails or is slow this
      // cycle keeps its previous quote rather than being cleared. Rows only ever
      // appear once a real quote is received (no empty placeholders), and a
      // failed venue is silently retried on the next poll.
      const merged = new Map<VenueId, NormalizedQuote>(
        quotesRef.current.map((q) => [q.venue, q] as const),
      );

      setFetching(true);
      try {
        lastRequestAtRef.current = Date.now();
        const sdk = getWidgetSdk();
        const { quotes: finalQuotes, errors: venueErrors } = await sdk.getQuotes(
          {
            srcChainId: inputToken.chainId,
            dstChainId: outputToken.chainId,
            srcTokenAddress: inputToken.address,
            dstTokenAddress: outputToken.address,
            amount: inputAmount,
            srcTokenDecimals: inputToken.decimals,
            srcWalletAddress: (userAddress as string) || '0x0000000000000000000000000000000000000000',
            ...(recipient ? { dstWalletAddress: recipient as string } : {}),
          },
          {
            signal: abort.signal,
            // Render/update a venue's row the moment its fresh quote arrives.
            onQuote: (q) => {
              if (!isCurrent()) return;
              merged.set(q.venue, q);
              setQuotes([...merged.values()].sort(sortByGrossOutputDesc));
            },
          },
        );

        if (!isCurrent()) return;

        // Capture every successful quote (defensive if a stream callback was
        // skipped); venues that failed keep their prior last-good quote.
        for (const q of finalQuotes) merged.set(q.venue, q);
        const finalList = [...merged.values()].sort(sortByGrossOutputDesc);

        setQuotes(finalList);
        // Errors kept for programmatic consumers, but never rendered as rows.
        setErrors(venueErrors.map((e) => ({ venue: e.venue, error: e.error.message })));
        setStatus('fresh');

        if (finalList.length === 0) {
          // Nothing has ever come back for this pair — surface "no routes".
          setNoQuotes(true);
          if (typeof setOutputAmount === 'function') setOutputAmount(null);
          return;
        }

        setNoQuotes(false);
        setError(null);
        scheduleStaleFrom(finalList[0]?.receivedAt ?? Date.now());

        // Reflect the selected (or best) quote's output into the form.
        const override = selectedVenueRef.current;
        const chosen = (override && finalList.find((q) => q.venue === override)) || finalList[0];
        if (chosen && typeof setOutputAmount === 'function') {
          setOutputAmount(Number(formatUnits(toBigInt(chosen.outputAmount), outputToken.decimals)));
        }
      } catch (e: unknown) {
        // Transient failure (timeout/network): keep the last-good quotes and
        // retry next poll. Never clears rows or surfaces an error to the user.
        if (e instanceof Error && e.name === 'AbortError') return;
        if (!isCurrent()) return;
        setStatus('fresh');
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        // Only the current cycle clears the flag (a newer cycle owns it).
        if (isCurrent()) setFetching(false);
      }
    },
    [userAddress, recipient, scheduleStaleFrom],
  );

  const startPolling = useCallback(
    (params: PollingParams, sessionId: string) => {
      clearTimers();
      lastParamsRef.current = params;
      lastRequestAtRef.current = 0;
      setErrors([]);
      setError(null);
      setNoQuotes(false);
      setStatus('polling');

      const poll = async () => {
        if (sessionIdRef.current !== sessionId) return;
        await requestQuotesOnce(params, sessionId);
        if (sessionIdRef.current !== sessionId) return;
        pollingTimerRef.current = setTimeout(poll, POLLING_INTERVAL_MS);
      };
      void poll();
    },
    [clearTimers, requestQuotesOnce],
  );

  const ensureForParams = useCallback(
    (params: PollingParams) => {
      if (
        !params?.inputToken ||
        !params?.outputToken ||
        !params?.inputAmount ||
        parseFloat(params.inputAmount) <= 0
      ) {
        stop();
        return;
      }

      const prev = lastParamsRef.current;
      const sameParams =
        prev &&
        prev.inputToken?.address === params.inputToken?.address &&
        prev.inputToken?.chainId === params.inputToken?.chainId &&
        prev.outputToken?.address === params.outputToken?.address &&
        prev.outputToken?.chainId === params.outputToken?.chainId &&
        prev.inputAmount === params.inputAmount;
      if (sameParams && sessionIdRef.current) return;

      const now = Date.now();
      if (now - lastStartAtRef.current < 100) return;
      lastStartAtRef.current = now;

      const newSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionIdRef.current = newSessionId;
      startPolling(params, newSessionId);
    },
    [startPolling, stop],
  );

  const handleInputChange = useCallback(
    ({ amount, inputToken, outputToken, setOutputAmount }: InputChangeParams) => {
      if (isWalletBlocked) return;

      setOutputAmount(null);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

      if (!amount || amount === 0) {
        setInputState('idle');
        stop();
        setQuotes([]);
        setErrors([]);
        setError(null);
        setNoQuotes(false);
      } else {
        setInputState('typing');
        stop();
        setQuotes([]);
        setErrors([]);
        setError(null);
        setNoQuotes(false);
        typingTimerRef.current = setTimeout(() => {
          setInputState('settled');
          if (inputToken && outputToken && amount > 0) {
            ensureForParams({
              inputToken,
              outputToken,
              inputAmount: amount.toString(),
              setOutputAmount,
            });
          }
        }, TYPING_SETTLE_DELAY_MS);
      }
    },
    [stop, ensureForParams, isWalletBlocked],
  );

  const refresh = useCallback(() => {
    const params = lastParamsRef.current;
    if (!params) return;
    const newSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = newSessionId;
    setStatus('refreshing');
    startPolling(params, newSessionId);
  }, [startPolling]);

  const setSelectedQuote = useCallback((quoteId: string) => {
    const match = quotesRef.current.find((q) => q.quoteId === quoteId);
    if (match) setSelectedVenue(match.venue);
  }, []);

  useEffect(() => {
    if (isWalletBlocked) clear();
  }, [isWalletBlocked, clear]);

  useEffect(() => {
    hasQuotesRef.current = quotes.length > 0;
    quotesRef.current = quotes;
  }, [quotes]);

  useEffect(() => {
    selectedVenueRef.current = selectedVenue;
  }, [selectedVenue]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // Selection derived from the stable venue: follows the pinned venue if the
  // user picked one, otherwise the best (first) quote. Stable across refetches.
  const bestQuoteId = quotes[0]?.quoteId ?? null;
  const selectedQuote = useMemo(
    () => (selectedVenue ? (quotes.find((q) => q.venue === selectedVenue) ?? quotes[0]) : quotes[0]) ?? null,
    [quotes, selectedVenue],
  );
  const selectedQuoteId = selectedQuote?.quoteId ?? null;

  // Loading signal: a fetch is in-flight and not every configured venue has a
  // quote yet (used to show a spinner while later venues are still responding).
  const distinctVenueCount = useMemo(() => new Set(quotes.map((q) => q.venue)).size, [quotes]);
  const awaitingQuotes = fetching && distinctVenueCount < aggregatorVenues.length;

  const venueStatus = useMemo<Record<string, VenueStatus>>(() => {
    const map: Record<string, VenueStatus> = {};
    const polling = status === 'polling' || status === 'refreshing';
    for (const venue of aggregatorVenues) {
      if (quotes.some((q) => q.venue === venue)) map[venue] = 'ok';
      else if (errors.some((e) => e.venue === venue)) map[venue] = 'error';
      else if (polling) map[venue] = 'loading';
      else map[venue] = 'idle';
    }
    return map;
  }, [aggregatorVenues, quotes, errors, status]);

  const contextValue = useMemo<QuotesContextType>(
    () => ({
      status,
      inputState,
      quotes,
      errors,
      venueStatus,
      selectedQuoteId,
      selectedQuote,
      bestQuoteId,
      error,
      noQuotes,
      awaitingQuotes,
      setSelectedQuote,
      ensureForParams,
      stop,
      refresh,
      clear,
      handleInputChange,
    }),
    [
      status,
      inputState,
      quotes,
      errors,
      venueStatus,
      selectedQuoteId,
      selectedQuote,
      bestQuoteId,
      error,
      noQuotes,
      awaitingQuotes,
      setSelectedQuote,
      ensureForParams,
      stop,
      refresh,
      clear,
      handleInputChange,
    ],
  );

  return <QuotesContext.Provider value={contextValue}>{children}</QuotesContext.Provider>;
};

export const useQuotes = (): QuotesContextType => {
  const context = useContext(QuotesContext);
  if (context === undefined) throw new Error('useQuotes must be used within a QuotesProvider');
  return context;
};
