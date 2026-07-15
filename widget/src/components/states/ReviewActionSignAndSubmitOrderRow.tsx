'use client';

import { SignSwap } from '../../lib/signSwap';
import { canSubmitOrder, cleanupOldSubmissions, markOrderAsSubmitted } from '../../lib/submitTracker';
import { useRfq } from '../../providers/RfqProvider';
import {
  Checkmark, LoadingSpinner, RedoIcon, TokenImage,
  getViemChainById, getChainConfig, getClient,
  getWidgetSdk, useAori,
  isReviewStepPast,
  type Asset, type ReviewOrderStep,
} from '../../internal';
import type { QuoteResponse } from '@aori/aori-ts';
import { waitForTransactionReceipt } from '@wagmi/core';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useAccount, useConfig, useSendTransaction, useSwitchChain, useWalletClient } from 'wagmi';
import { useWalletScreening } from '../../context/WalletScreeningContext';
import CountDown from '../CountDown';

type SignState = 'idle' | 'signing' | 'submitting' | 'success' | 'error' | 'refreshingQuote' | 'stale';

function isUserRejectionError(error: Error): boolean {
  return (
    error.name === 'UserRejectedRequestError' ||
    error.message.includes('User rejected') ||
    error.message.includes('rejected') ||
    error.message.includes('denied') ||
    error.message.includes('cancelled') ||
    error.message.includes('canceled')
  );
}

const STALE_WINDOW_MS = 30_000;
const STALE_WINDOW_SECONDS = STALE_WINDOW_MS / 1000;

interface ReviewActionSignAndSubmitOrderRowProps {
  base: Asset;
  baseAmount: number;
  quote: Asset;
  quoteAmount: number;
  userAddress: string;
  reviewState: ReviewOrderStep | null;
  goToNextStep: (componentStep: ReviewOrderStep, currentStep: ReviewOrderStep | null) => void;
  cancel: () => Promise<void>;
  isWrappingPair: boolean;
  isUnwrappingPair: boolean;
  restartSigningFlow?: (isFromStaleState?: boolean) => void;
  onSwapInitiated?: () => void;
  onOrderSubmitted?: (orderHash: string) => void;
  onSwapSubmitted?: (orderHash: string) => void;
  startPolling: (orderHash: string, metadata?: { baseToken?: Asset; quoteToken?: Asset }) => void;
  trackNativeTransaction: (txHash: string, description: string) => void;
}

const ComponentStep: ReviewOrderStep = 'signingOrder';

const ReviewActionSignAndSubmitOrderRow: React.FC<ReviewActionSignAndSubmitOrderRowProps> = ({
  base, baseAmount, quote, quoteAmount, userAddress, reviewState, goToNextStep, cancel,
  isWrappingPair, isUnwrappingPair, restartSigningFlow, onSwapInitiated, onOrderSubmitted, onSwapSubmitted,
  startPolling, trackNativeTransaction,
}) => {
  const hasSucceeded = isReviewStepPast(ComponentStep, reviewState);
  const [signState, setSignState] = useState<SignState>('idle');
  const [isInWarningZone, setIsInWarningZone] = useState(false);
  const isProcessing = useRef(false);
  const hasAutoStartedRef = useRef<string | null>(null);

  const wagmiConfig = useConfig();
  const { isReconnecting } = useAccount();
  const { isBlocked: isWalletBlocked } = useWalletScreening();
  const { rfqQuote, stop: stopRfq, refresh } = useRfq();
  const aori = useAori();
  const { data: walletClient } = useWalletClient({ chainId: base.chainId });
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const quoteStartTime = rfqQuote?.startTime ?? 0;
  const srcEstimatedTimeMs = (getChainConfig(base.chainId)?.estimatedTimeMs ?? 12_000) + 5_000;

  const isQuoteStale = useCallback(() => {
    if (!quoteStartTime) return false;
    const startTimeMs = quoteStartTime > 9_999_999_999 ? quoteStartTime : quoteStartTime * 1000;
    return Date.now() >= startTimeMs + STALE_WINDOW_MS;
  }, [quoteStartTime]);

  const handleSignAndSubmit = useCallback(async () => {
    if (isWalletBlocked) return;
    if (isProcessing.current || signState !== 'idle') return;
    if (!rfqQuote?.orderHash || !rfqQuote?.startTime) {
      setSignState('error');
      return;
    }

    const validation = canSubmitOrder(rfqQuote.orderHash, rfqQuote.startTime, STALE_WINDOW_MS);
    if (!validation.canSubmit) {
      setSignState('stale');
      return;
    }

    isProcessing.current = true;

    try {
      if (!walletClient) throw new Error('Wallet client not available');
      if (!aori) throw new Error('Aori client not available');
      cleanupOldSubmissions();

      const quoteResponse: QuoteResponse = rfqQuote;
      const finalOrderHash = quoteResponse.orderHash;

      // ── Native swap branch ──────────────────────────────────────────────
      if (aori.isNativeSwap(quoteResponse)) {
        setSignState('submitting');
        markOrderAsSubmitted(finalOrderHash, quoteResponse.startTime);

        if ((walletClient as any).chain?.id !== base.chainId) {
          await switchChain({ chainId: base.chainId });
          await new Promise((r) => setTimeout(r, 800));
        }

        // Advance to the tracking step as soon as the deposit tx is broadcast
        // (hash in hand) rather than waiting for the on-chain receipt — the
        // status poll tolerates 404 and shows "Trade Pending" until it mines.
        let advanced = false;
        const advanceToTracking = (txHash?: string) => {
          if (advanced) return;
          advanced = true;
          if (txHash) trackNativeTransaction(txHash, `Deposit on ${quoteResponse.inputChain}`);
          onOrderSubmitted?.(finalOrderHash);
          startPolling(finalOrderHash, { baseToken: base, quoteToken: quote });
          onSwapInitiated?.();
          stopRfq();
          setSignState('success');
          goToNextStep(ComponentStep, reviewState);
          onSwapSubmitted?.(finalOrderHash);
        };

        const txExecutor = {
          sendTransaction: async (request: any) => {
            const hash = await sendTransactionAsync({
              account: userAddress as `0x${string}`,
              chain: getViemChainById()[base.chainId],
              to: request.to as `0x${string}`,
              data: request.data as `0x${string}`,
              value: BigInt(request.value || 0),
            } as any);
            advanceToTracking(hash);
            return {
              hash,
              wait: async () =>
                await waitForTransactionReceipt(wagmiConfig, { hash, chainId: base.chainId }),
            };
          },
          estimateGas: async (request: any) => {
            const client = getClient(base.chainId);
            return await (client as any).estimateGas({
              account: userAddress as `0x${string}`,
              to: request.to as `0x${string}`,
              data: request.data as `0x${string}`,
              value: BigInt(request.value || 0),
            });
          },
        };

        try {
          await aori.executeSwap(quoteResponse, { type: 'native', txExecutor });
        } catch (execErr) {
          // If the deposit was already broadcast, let polling reflect the real
          // on-chain status instead of flipping the UI back to an error.
          if (!advanced) throw execErr;
        }

        // Fallback in case the SDK resolved without surfacing the tx hash.
        advanceToTracking();
        return;
      }

      // ── ERC20 branch ────────────────────────────────────────────────────
      setSignState('signing');
      const signed = await SignSwap({ quoteResponse, userAddress, walletClient });
      if (!signed?.signature) {
        setSignState('error');
        return;
      }

      setSignState('submitting');

      const finalValidation = canSubmitOrder(finalOrderHash, quoteResponse.startTime, STALE_WINDOW_MS);
      if (!finalValidation.canSubmit) {
        setSignState('stale');
        return;
      }
      markOrderAsSubmitted(finalOrderHash, quoteResponse.startTime);

      const swapResponse = await getWidgetSdk().submitSwap({
        orderHash: signed.orderHash,
        signature: signed.signature,
      });
      const submittedHash = swapResponse.orderHash || finalOrderHash;

      onOrderSubmitted?.(submittedHash);
      startPolling(submittedHash, { baseToken: base, quoteToken: quote });
      onSwapInitiated?.();
      stopRfq();

      setSignState('success');
      goToNextStep(ComponentStep, reviewState);
      onSwapSubmitted?.(submittedHash);
    } catch (error) {
      if (error instanceof Error && isUserRejectionError(error)) {
        setSignState('error');
      } else if (isQuoteStale() && restartSigningFlow) {
        isProcessing.current = false;
        restartSigningFlow(true);
        return;
      } else {
        setSignState('error');
      }
    } finally {
      isProcessing.current = false;
    }
  }, [isWalletBlocked, signState, rfqQuote, walletClient, aori, base, quote, userAddress, stopRfq, startPolling, goToNextStep, reviewState, onSwapSubmitted, switchChain, sendTransactionAsync, onSwapInitiated, onOrderSubmitted, trackNativeTransaction, wagmiConfig, restartSigningFlow, isQuoteStale]);

  useEffect(() => {
    if (reviewState === ComponentStep) stopRfq();

    if (hasSucceeded && signState !== 'success') {
      setSignState('success');
      goToNextStep(ComponentStep, reviewState);
      return;
    }
    if (signState === 'success') {
      goToNextStep(ComponentStep, reviewState);
      return;
    }
    if (reviewState === ComponentStep && signState === 'idle' && !rfqQuote?.orderHash) {
      setSignState('refreshingQuote');
      refresh();
      return;
    }
    if (reviewState === ComponentStep && signState === 'idle' && walletClient && !isProcessing.current && !isReconnecting) {
      const currentId = rfqQuote?.orderHash || null;
      if (currentId && hasAutoStartedRef.current !== currentId) {
        hasAutoStartedRef.current = currentId;
        handleSignAndSubmit();
      }
    }
  }, [hasSucceeded, reviewState, signState, walletClient, isReconnecting, handleSignAndSubmit, goToNextStep, rfqQuote?.orderHash, refresh, stopRfq]);

  useEffect(() => {
    if (signState === 'refreshingQuote' && rfqQuote?.orderHash) {
      setSignState('idle');
    }
  }, [signState, rfqQuote?.orderHash]);

  useEffect(() => {
    if (reviewState !== ComponentStep) hasAutoStartedRef.current = null;
  }, [reviewState]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (signState === 'success' || signState === 'refreshingQuote' || signState === 'error') return;
      // Once a sign/submit/native-deposit is in flight the order is already
      // committed (signature obtained or deposit tx sent) — never flip it to
      // stale, even if the quote's 30s window lapses mid-confirmation.
      if (isProcessing.current) return;
      if (!quoteStartTime) return;

      const startTimeMs = quoteStartTime > 9_999_999_999 ? quoteStartTime : quoteStartTime * 1000;
      const elapsed = Date.now() - startTimeMs;

      if (elapsed >= STALE_WINDOW_MS) {
        setSignState('stale');
        setIsInWarningZone(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [signState, quoteStartTime, srcEstimatedTimeMs]);

  useEffect(() => {
    if (signState !== 'submitting' && signState !== 'signing') {
      setIsInWarningZone(false);
    }
  }, [signState]);

  const handleRetry = () => {
    if (signState === 'error' && !isProcessing.current) {
      hasAutoStartedRef.current = null;
      setSignState('idle');
    }
  };

  const handleCloseWalletAndRestart = useCallback(() => {
    if (isProcessing.current) return;
    if (restartSigningFlow) {
      restartSigningFlow(true);
    } else {
      cancel();
    }
  }, [restartSigningFlow, cancel]);

  const buttonText = () => {
    if (signState === 'error') return 'Retry swap';
    if (signState === 'signing') return 'Sign Swap Order';
    if (signState === 'submitting') return isInWarningZone ? 'Quote likely to expire' : 'Submitting...';
    if (signState === 'refreshingQuote') return 'Refreshing Quote...';
    if (signState === 'stale') return 'Quote Stale';
    return 'Sign & Submit';
  };

  const isErrorOrStale = !hasSucceeded && (signState === 'error' || signState === 'stale');
  const isWarning = isInWarningZone && !isErrorOrStale;
  const statusVar = isErrorOrStale
    ? 'var(--widget-status-failed)'
    : isWarning
      ? 'var(--widget-status-failed)'
      : 'var(--widget-primary)';

  return (
    <div className="flex w-full flex-row justify-between space-x-3">
      <button
        type="button"
        className={`inline-flex h-12 w-full items-center justify-center text-sm font-sans font-medium transition duration-150 ${isErrorOrStale ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        style={{
          backgroundColor: `color-mix(in srgb, ${statusVar} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${statusVar} 20%, transparent)`,
          color: statusVar,
          borderRadius: 'var(--widget-radius)',
        }}
        onClick={
          !hasSucceeded && signState === 'error'
            ? handleRetry
            : signState === 'stale'
              ? handleCloseWalletAndRestart
              : undefined
        }
      >
        <div className="flex h-10 w-full flex-row items-center space-x-3 px-4">
          <TokenImage asset={base} size="xs" noChain />
          <p className="whitespace-nowrap">{buttonText()}</p>
          <div className="flex flex-1 border-t" style={{ borderColor: 'var(--widget-border)' }} />
          {quoteStartTime > 0 && signState !== 'success' && signState !== 'error' && signState !== 'stale' && (
            <CountDown startTime={quoteStartTime} durationSeconds={STALE_WINDOW_SECONDS} onExpired={() => { if (!isProcessing.current) setSignState('stale'); }} />
          )}
          <div className="flex h-6 w-3 items-center justify-center rounded-full">
            {!hasSucceeded && (signState === 'idle' || signState === 'signing' || signState === 'submitting' || signState === 'refreshingQuote') && <LoadingSpinner size="5" />}
            {(hasSucceeded || signState === 'success') && <Checkmark className="h-8 w-8" />}
            {!hasSucceeded && (signState === 'error' || signState === 'stale') && <RedoIcon className="h-[12px] w-[12px]" />}
          </div>
        </div>
      </button>
      {!hasSucceeded && (signState === 'error' || signState === 'stale') && (
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center px-8 text-sm font-sans font-medium transition duration-150 cursor-pointer"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--widget-status-failed) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--widget-status-failed) 20%, transparent)',
            color: 'var(--widget-status-failed)',
            borderRadius: 'var(--widget-radius)',
          }}
          onClick={cancel}
        >
          Cancel
        </button>
      )}
    </div>
  );
};

export default ReviewActionSignAndSubmitOrderRow;
