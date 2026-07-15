'use client';

import {
  type Asset,
  getWidgetSdk,
  toBigInt,
} from '../internal';
import type { QuoteResponse } from '@aori/aori-ts';
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
import { useWalletState } from '../wallet/useWalletState';
import { useWalletScreening } from '../context/WalletScreeningContext';

// ── Provider Types ─────────────────────────────────────────────────────────

type RfqStatus = 'idle' | 'polling' | 'fresh' | 'stale' | 'refreshing';
type InputState = 'idle' | 'typing' | 'settled';

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

interface RfqContextType {
  status: RfqStatus;
  inputState: InputState;
  rfqQuote: QuoteResponse | null;
  error: string | null;
  liquidityError: boolean;
  routingError: boolean;
  sizeCapError: boolean;

  ensureForParams: (params: PollingParams) => void;
  stop: () => void;
  refresh: () => void;
  clear: () => void;
  handleInputChange: (params: InputChangeParams) => void;
}

const RfqContext = createContext<RfqContextType | undefined>(undefined);

const POLLING_INTERVAL_MS = 10_000;
const STALE_WINDOW_MS = 30_000;
const TYPING_SETTLE_DELAY_MS = 1_000;
const ROUTING_ERROR_THRESHOLD = 2;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface RfqProviderProps {
  children: React.ReactNode;
  recipient?: string | null;
}

export const RfqProvider: React.FC<RfqProviderProps> = ({
  children,
  recipient: recipientProp,
}) => {
  const { address: userAddress } = useWalletState();
  const { isBlocked: isWalletBlocked } = useWalletScreening();
  const recipient = recipientProp || userAddress;

  const [status, setStatus] = useState<RfqStatus>('idle');
  const [inputState, setInputState] = useState<InputState>('idle');
  const [rfqQuote, setRfqQuote] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liquidityError, setLiquidityError] = useState(false);
  const [routingError, setRoutingError] = useState(false);
  const [sizeCapError, setSizeCapError] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const lastParamsRef = useRef<PollingParams | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRequestId = useRef(0);
  const lastRequestAtRef = useRef(0);
  const lastStartAtRef = useRef(0);
  const hasQuoteRef = useRef(false);
  const routingErrorsRef = useRef<Map<string, number>>(new Map());

  const clearTimers = useCallback(() => {
    if (pollingIntervalRef.current) clearTimeout(pollingIntervalRef.current);
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    pollingIntervalRef.current = null;
    staleTimerRef.current = null;
    typingTimerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    sessionIdRef.current = null;
    latestRequestId.current = 0;
    setStatus(() => (hasQuoteRef.current ? 'fresh' : 'idle'));
  }, [clearTimers]);

  const clear = useCallback(() => {
    stop();
    lastParamsRef.current = null;
    setRfqQuote(null);
    setError(null);
    setLiquidityError(false);
    setRoutingError(false);
    setSizeCapError(false);
    routingErrorsRef.current.clear();
    setStatus('idle');
    setInputState('idle');
  }, [stop]);

  const scheduleStaleFrom = useCallback((startTimestampSec: number) => {
    if (!startTimestampSec) return;
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    const startMs =
      startTimestampSec > 9_999_999_999
        ? startTimestampSec
        : startTimestampSec * 1000;
    const delay = Math.max(0, startMs + STALE_WINDOW_MS - Date.now());
    staleTimerRef.current = setTimeout(() => {
      setStatus((prev) => (prev === 'idle' ? 'idle' : 'stale'));
    }, delay);
  }, []);

  const requestQuoteOnce = useCallback(
    async (params: PollingParams, sessionId: string) => {
      const { inputToken, outputToken, inputAmount, setOutputAmount } = params;
      if (!inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) <= 0)
        return;

      const now = Date.now();
      if (now - (lastRequestAtRef.current || 0) < POLLING_INTERVAL_MS - 10)
        return;

      const requestId = ++latestRequestId.current;

      try {
        if (!inputToken?.decimals || !outputToken?.decimals) return;

        lastRequestAtRef.current = Date.now();

        // Quotes go through the shared usdm-bridge-sdk instance — the single
        // source of truth for the Aori integration. The SDK resolves chain keys
        // and normalizes the amount (parseUnits) internally.
        const raw: QuoteResponse = await getWidgetSdk().getQuote({
          srcChainId: inputToken.chainId,
          dstChainId: outputToken.chainId,
          srcTokenAddress: inputToken.address,
          dstTokenAddress: outputToken.address,
          amount: inputAmount.toString(),
          srcTokenDecimals: inputToken.decimals,
          srcWalletAddress: (userAddress as string) || ZERO_ADDRESS,
          dstWalletAddress:
            (recipient as string) || (userAddress as string) || ZERO_ADDRESS,
          timeoutMs: 15000,
        });
        if (requestId !== latestRequestId.current || sessionIdRef.current !== sessionId)
          return;

        if (!raw?.orderHash) {
          throw Object.assign(new Error('No quote returned'), { emptyQuotes: true });
        }

        // The Aori API returns startTime/endTime as numeric strings. Coerce to
        // numbers so downstream freshness checks (submitTracker) and countdowns
        // don't choke on `new Date("<seconds-string>")`.
        const quoteResponse: QuoteResponse = {
          ...raw,
          startTime: Number(raw.startTime),
          endTime: Number(raw.endTime),
        };

        const formattedOutput = Number(
          formatUnits(toBigInt(quoteResponse.outputAmount), outputToken.decimals),
        );
        if (typeof setOutputAmount === 'function') setOutputAmount(formattedOutput);

        setRfqQuote(quoteResponse);
        setError(null);
        setLiquidityError(false);
        setStatus('fresh');
        scheduleStaleFrom(quoteResponse.startTime ?? 0);
        if (sessionId) routingErrorsRef.current.delete(sessionId);
      } catch (e: unknown) {
        if (requestId !== latestRequestId.current || sessionIdRef.current !== sessionId)
          return;

        const statusCode = (e as any)?.status as number | undefined;
        const errorMessage = e instanceof Error ? e.message : '';
        const isEmptyQuotes = !!(e as any)?.emptyQuotes;

        if ((statusCode === 400 || isEmptyQuotes || errorMessage.includes('Quote request failed')) && sessionId) {
          const current = routingErrorsRef.current.get(sessionId) || 0;
          const newCount = current + 1;
          routingErrorsRef.current.set(sessionId, newCount);
          if (newCount >= ROUTING_ERROR_THRESHOLD) {
            setRoutingError(true);
            clearTimers();
            sessionIdRef.current = null;
            return;
          }
        }

        if (errorMessage.toLowerCase().includes('order cap exceeded')) {
          setSizeCapError(true);
          clearTimers();
          sessionIdRef.current = null;
          return;
        }

        if (errorMessage.toLowerCase().includes('insufficient executor balance')) {
          setLiquidityError(true);
          clearTimers();
          sessionIdRef.current = null;
          return;
        }

        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    },
    [userAddress, recipient, scheduleStaleFrom, clearTimers],
  );

  const startPolling = useCallback(
    (params: PollingParams, sessionId: string) => {
      clearTimers();
      lastParamsRef.current = params;
      lastRequestAtRef.current = 0;
      routingErrorsRef.current.delete(sessionId);
      setLiquidityError(false);
      setRoutingError(false);
      setSizeCapError(false);
      setError(null);
      setStatus('polling');

      const poll = async () => {
        if (sessionIdRef.current !== sessionId) return;
        await requestQuoteOnce(params, sessionId);
        if (sessionIdRef.current !== sessionId) return;
        pollingIntervalRef.current = setTimeout(poll, POLLING_INTERVAL_MS);
      };
      poll();
    },
    [clearTimers, requestQuoteOnce],
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
        setRfqQuote(null);
        setError(null);
        setLiquidityError(false);
        setRoutingError(false);
        setSizeCapError(false);
      } else {
        setInputState('typing');
        stop();
        setRfqQuote(null);
        setLiquidityError(false);
        setRoutingError(false);
        setSizeCapError(false);
        setError(null);
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
    setRfqQuote(null);
    const newSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = newSessionId;
    setStatus('refreshing');
    if (typeof params.setOutputAmount === 'function')
      params.setOutputAmount(null);
    startPolling(params, newSessionId);
  }, [startPolling]);

  useEffect(() => {
    if (isWalletBlocked) clear();
  }, [isWalletBlocked, clear]);

  useEffect(() => {
    hasQuoteRef.current = !!rfqQuote;
  }, [rfqQuote]);

  // Re-arm the stale timer for an existing fresh quote.
  useEffect(() => {
    if (status === 'fresh' && rfqQuote?.startTime) {
      scheduleStaleFrom(rfqQuote.startTime);
    }
  }, [status, rfqQuote?.startTime, scheduleStaleFrom]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const contextValue = useMemo<RfqContextType>(
    () => ({
      status,
      inputState,
      rfqQuote,
      error,
      liquidityError,
      routingError,
      sizeCapError,
      ensureForParams,
      stop,
      refresh,
      clear,
      handleInputChange,
    }),
    [
      status,
      inputState,
      rfqQuote,
      error,
      liquidityError,
      routingError,
      sizeCapError,
      ensureForParams,
      stop,
      refresh,
      clear,
      handleInputChange,
    ],
  );

  return (
    <RfqContext.Provider value={contextValue}>{children}</RfqContext.Provider>
  );
};

export const useRfq = (): RfqContextType => {
  const context = useContext(RfqContext);
  if (context === undefined)
    throw new Error('useRfq must be used within an RfqProvider');
  return context;
};
