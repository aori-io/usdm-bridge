'use client';

import {
  type Asset,
  type ReviewOrderStep,
  type SupportedChainId,
  getChainConfig,
  getNextReviewStep,
  sleep,
} from '../../internal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChainId } from 'wagmi';
import { useWidgetConfig } from '../../context/WidgetConfigContext';
import { useRfq } from '../../providers/RfqProvider';
import { useSwapFormContext } from '../../providers/SwapFormProvider';
import type { ToastStatus } from '../../stores/swapUIStore';
import { useWidgetSwapUIStore } from '../../stores/swapUIStore';
import ReviewActionApprovalRow from './ReviewActionApprovalRow';
import ReviewActionChainSwitchRow from './ReviewActionChainSwitchRow';
import ReviewActionSignAndSubmitOrderRow from './ReviewActionSignAndSubmitOrderRow';
import ReviewActionTxRow from './ReviewActionTxRow';
import ReviewActionUnwrapGasToken from './ReviewActionUnwrapGasToken';
import ReviewActionWrapGasToken from './ReviewActionWrapGasToken';

interface ReviewActionProps {
  base: Asset;
  quote: Asset;
  baseAmount: number;
  quoteAmount: number;
  userAddress: string;
}

interface SwapButtonProps {
  // Core swap data
  base: Asset;
  baseAmount: number;
  quote: Asset;
  quoteAmount: number;
  userAddress: string;
  isWrappingPair: boolean;
  isUnwrappingPair: boolean;
  isBaseGasToken: boolean;
  isQuoteGasToken: boolean;
  isBaseTrueNative: boolean;
  needsApproval: boolean;
  currentAllowance: number;
  // Review flow state (owned by parent form)
  reviewActionProps: ReviewActionProps | null;
  reviewState: ReviewOrderStep | null;
  setReviewState: (state: ReviewOrderStep | null) => void;
  // Order tracking (owned by parent form)
  trackedOrderHash: string | null;
  setTrackedOrderHash: (hash: string | null) => void;
  txStatus: ToastStatus;
  // Callbacks from parent
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapInitiated?: () => void;
  onOrderSubmitted?: (orderHash: string) => void;
  onStaleQuoteRestart?: () => void;
  setExitHandler?: (handler: () => void) => void;
  setRetryHandler?: (handler: () => void) => void;
  // Lifted from SwapContainerInner
  startPolling: (quoteId: string, metadata?: { baseToken?: Asset; quoteToken?: Asset }) => void;
  trackNativeTransaction: (txHash: string, description: string) => void;
}

export const SwapButton: React.FC<SwapButtonProps> = ({
  base,
  baseAmount,
  quote,
  quoteAmount,
  userAddress,
  isWrappingPair,
  isUnwrappingPair,
  isBaseGasToken,
  isQuoteGasToken,
  isBaseTrueNative,
  needsApproval,
  currentAllowance,
  reviewActionProps,
  reviewState,
  setReviewState,
  trackedOrderHash,
  setTrackedOrderHash,
  txStatus,
  onSwapSubmitted,
  onSwapInitiated,
  onOrderSubmitted,
  onStaleQuoteRestart,
  setExitHandler,
  setRetryHandler,
  startPolling,
  trackNativeTransaction,
}) => {
  const {
    rfqQuote,
    status: rfqStatus,
    liquidityError,
    routingError,
    sizeCapError,
    stop,
    clear,
  } = useRfq();
  const { clearForm } = useSwapFormContext();
  const currentChainId = useChainId();
  const { swapButtonVariant, widgetType } = useWidgetConfig();
  const isCompact = widgetType === 'compact';


  // Local state
  const [isRestarting, setIsRestarting] = useState(false);
  const awaitingAutoResumeRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived booleans — computed internally
  const needsToWrap = isWrappingPair;
  const needsToUnwrap = isUnwrappingPair;
  const needsSignature = !isWrappingPair && !isUnwrappingPair;
  const needsChainSwitch =
    currentChainId !== base?.chainId &&
    (needsToWrap || needsToUnwrap || needsSignature);

  // Inline chain info for ChainSwitchRow
  const chainConfig = getChainConfig(base.chainId);
  const requiredChain = {
    chainId: base.chainId as SupportedChainId,
    name: chainConfig?.displayName ?? `Chain ${base.chainId}`,
  };

  // ── Step machine ────────────────────────────────────────────────────────────

  const goToNextStep = useCallback(
    (componentStep: ReviewOrderStep, currentStep: ReviewOrderStep | null) => {
      // Guard: only advance if this component IS the current review step
      if (currentStep !== componentStep) return;

      // Do NOT fall through to getNextReviewStep() for these steps —
      // its generic array lookup returns 'submittingOrder' / 'sendingTx'
      // which the widget never renders, causing the "Processing..." fallback.
      if (componentStep === 'chain') {
        if (needsToWrap) {
          setReviewState('wrapping');
          return;
        }
        if (needsToUnwrap) {
          setReviewState('unwrapping');
          return;
        }
        if (needsApproval) {
          setReviewState('approval');
          return;
        }
        setReviewState('signingOrder');
        return;
      }
      if (componentStep === 'approval') {
        setReviewState('signingOrder');
        return;
      }
      if (componentStep === 'signingOrder') {
        setReviewState('trackingTx');
        return;
      }
      if (componentStep === 'wrapping') {
        if (!isWrappingPair) {
          setReviewState(needsApproval ? 'approval' : 'signingOrder');
          return;
        }
        setReviewState('wrapSuccess');
        return;
      }
      if (componentStep === 'unwrapping') {
        setReviewState('wrapSuccess');
        return;
      }
      const nextStep = getNextReviewStep(componentStep);
      if (nextStep) setReviewState(nextStep);
    },
    [
      setReviewState,
      isWrappingPair,
      needsToWrap,
      needsToUnwrap,
      needsApproval,
      needsSignature,
    ],
  );

  const determineInitialStep = useCallback((): ReviewOrderStep | null => {
    if (needsChainSwitch) return 'chain';
    if (needsToWrap) return 'wrapping';
    if (needsToUnwrap) return 'unwrapping';
    if (needsApproval) return 'approval';
    if (needsSignature) return 'signingOrder';
    return null;
  }, [
    needsChainSwitch,
    needsToWrap,
    needsToUnwrap,
    needsApproval,
    needsSignature,
  ]);

  const resetState = useCallback(() => {
    setReviewState(null);
    clearForm();
  }, [clearForm, setReviewState]);

  const delayedClose = useCallback(async () => {
    setReviewState('wrapSuccess');
    for (let i = 0; i < 3; i++) {
      await sleep(700);
    }
    resetState();
  }, [resetState, setReviewState]);

  const cancel = useCallback(async () => {
    clear();
    setReviewState('cancelled');
    for (let i = 0; i < 3; i++) {
      await sleep(500);
    }
    resetState();
  }, [clear, resetState, setReviewState]);

  const handleNewSwap = useCallback(() => {
    if (!trackedOrderHash) return;
    useWidgetSwapUIStore.getState().stopTracking();
    clear();
    setReviewState(null);
    setTrackedOrderHash(null);
    clearForm();
  }, [trackedOrderHash, clear, setReviewState, setTrackedOrderHash, clearForm]);

  const handleRetrySwap = useCallback(() => {
    useWidgetSwapUIStore.getState().stopTracking();
    setReviewState(null);
    setTrackedOrderHash(null);
    awaitingAutoResumeRef.current = true;
    onStaleQuoteRestart?.();
  }, [setReviewState, setTrackedOrderHash, onStaleQuoteRestart]);

  const handleReview = useCallback(() => {
    if (reviewActionProps) {
      setReviewState(determineInitialStep());
    }
  }, [determineInitialStep, reviewActionProps, setReviewState]);

  const restartSigningFlow = useCallback(
    (isFromStaleState = false) => {
      if (isFromStaleState) {
        awaitingAutoResumeRef.current = true;
        setReviewState(null);
        onStaleQuoteRestart?.();
      } else {
        setReviewState(null);
        restartTimerRef.current = setTimeout(() => {
          if (reviewActionProps) {
            setReviewState(determineInitialStep());
            setIsRestarting(false);
          }
        }, 100);
      }
    },
    [
      setReviewState,
      reviewActionProps,
      determineInitialStep,
      onStaleQuoteRestart,
    ],
  );

  // ── useEffects ──────────────────────────────────────────────────────────────

  // Stop RFQ polling the moment any review step becomes active
  useEffect(() => {
    if (reviewState !== null) stop();
  }, [reviewState, stop]);

  // Clear isRestarting when a review step resumes
  useEffect(() => {
    if (reviewState !== null && isRestarting) setIsRestarting(false);
  }, [reviewState, isRestarting]);

  // Register handleNewSwap with parent (header X button)
  useEffect(() => {
    setExitHandler?.(handleNewSwap);
  }, [setExitHandler, handleNewSwap]);

  useEffect(() => {
    useWidgetSwapUIStore.getState().setExitHandler(handleNewSwap);
    return () => useWidgetSwapUIStore.getState().setExitHandler(null);
  }, [handleNewSwap]);

  // Register handleRetrySwap with parent (TxStatusDisplay retry)
  useEffect(() => {
    setRetryHandler?.(handleRetrySwap);
  }, [setRetryHandler, handleRetrySwap]);

  useEffect(() => {
    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, []);

  // Auto-resume to signing when a fresh quote arrives after stale restart
  useEffect(() => {
    if (
      awaitingAutoResumeRef.current &&
      rfqStatus === 'fresh' &&
      rfqQuote?.orderHash
    ) {
      awaitingAutoResumeRef.current = false;
      setReviewState('signingOrder');
    }
  }, [rfqStatus, rfqQuote?.orderHash, setReviewState]);

  // ── Render helpers ──────────────────────────────────────────────────────────

  // Button style generator (widget theming — swapButtonVariant)
  const getIdleButtonStyle = (active: boolean): React.CSSProperties => {
    if (!active) {
      return {
        backgroundColor:
          swapButtonVariant === 'default'
            ? 'var(--widget-muted)'
            : 'transparent',
        color: 'var(--widget-muted-foreground)',
        border:
          swapButtonVariant !== 'default'
            ? '1px solid var(--widget-border)'
            : 'none',
        borderRadius: 'var(--widget-radius)',
      };
    }
    switch (swapButtonVariant) {
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--widget-primary)',
          border: '1px solid var(--widget-primary)',
          borderRadius: 'var(--widget-radius)',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--widget-primary)',
          border: 'none',
          borderRadius: 'var(--widget-radius)',
        };
      default:
        return {
          backgroundColor: 'var(--widget-primary)',
          color: 'var(--widget-primary-foreground)',
          borderRadius: 'var(--widget-radius)',
        };
    }
  };

  const idleButtonClass = `w-full ${isCompact ? 'py-2' : 'py-3'} text-sm font-sans font-medium transition-colors cursor-pointer mt-1`;

  // ── Render ──────────────────────────────────────────────────────────────────

  // ── Idle state: no review in progress ──────────────────────────────────────

  if (reviewState === null && !isWrappingPair && !isUnwrappingPair) {
    if (isRestarting) {
      return (
        <button
          className={idleButtonClass}
          disabled
          style={{
            ...getIdleButtonStyle(false),
            opacity: 0.6,
            cursor: 'not-allowed',
          }}
        >
          Getting fresh quote...
        </button>
      );
    }
    const getIdleText = () => {
      if (liquidityError) return 'Insufficient Liquidity';
      if (routingError) return 'Route Not Available';
      if (sizeCapError) return 'Size Cap Exceeded';
      if (!rfqQuote && rfqStatus === 'polling') return 'Getting Quote...';
      if (!rfqQuote) return 'Enter Amount';
      return 'Swap';
    };
    const isActive = !!reviewActionProps;
    return (
      <button
        onClick={isActive ? handleReview : undefined}
        disabled={!isActive}
        className={`${idleButtonClass} disabled:opacity-40 disabled:cursor-not-allowed`}
        style={getIdleButtonStyle(isActive)}
      >
        {getIdleText()}
      </button>
    );
  }

  if (reviewState === null && isUnwrappingPair) {
    return (
      <button
        onClick={reviewActionProps ? handleReview : undefined}
        disabled={!reviewActionProps}
        className={`${idleButtonClass} disabled:opacity-40 disabled:cursor-not-allowed`}
        style={getIdleButtonStyle(!!reviewActionProps)}
      >
        Unwrap
      </button>
    );
  }

  if (reviewState === null && isWrappingPair) {
    return (
      <button
        onClick={reviewActionProps ? handleReview : undefined}
        disabled={!reviewActionProps}
        className={`${idleButtonClass} disabled:opacity-40 disabled:cursor-not-allowed`}
        style={getIdleButtonStyle(!!reviewActionProps)}
      >
        Wrap
      </button>
    );
  }

  // ── Terminal review states ──────────────────────────────────────────────────

  if (reviewState === 'success') {
    return (
      <div className="flex flex-col gap-2 w-full">
        <button
          className={`w-full ${isCompact ? 'py-2' : 'py-3'} text-sm font-sans font-medium cursor-default`}
          style={{
            backgroundColor: 'color-mix(in srgb, var(--widget-status-completed) 15%, transparent)',
            color: 'var(--widget-status-completed)',
            border: '1px solid color-mix(in srgb, var(--widget-status-completed) 20%, transparent)',
            borderRadius: 'var(--widget-radius)',
          }}
        >
          Order Placed
        </button>
      </div>
    );
  }

  if (reviewState === 'wrapSuccess') {
    return (
      <div className="flex flex-col gap-2 w-full">
        <button
          className={`w-full ${isCompact ? 'py-2' : 'py-3'} text-sm font-sans font-medium cursor-default`}
          style={{
            backgroundColor: 'color-mix(in srgb, var(--widget-status-completed) 15%, transparent)',
            color: 'var(--widget-status-completed)',
            border: '1px solid color-mix(in srgb, var(--widget-status-completed) 20%, transparent)',
            borderRadius: 'var(--widget-radius)',
          }}
        >
          {isWrappingPair ? 'Wrapped Successfully' : 'Unwrapped Successfully'}
        </button>
      </div>
    );
  }

  if (reviewState === 'cancelled') {
    return (
      <div className="flex flex-col gap-2 w-full">
        <button
          onClick={resetState}
          className={`w-full ${isCompact ? 'py-2' : 'py-3'} text-sm font-sans font-medium cursor-pointer`}
          style={{
            backgroundColor: 'color-mix(in srgb, var(--widget-status-failed) 15%, transparent)',
            color: 'var(--widget-status-failed)',
            border: '1px solid color-mix(in srgb, var(--widget-status-failed) 20%, transparent)',
            borderRadius: 'var(--widget-radius)',
          }}
        >
          Order Cancelled
        </button>
      </div>
    );
  }

  // ── Per-step review rows ─────────────────────────────────────────────────────

  return (
    <div className="flex w-full">
      {reviewState === 'chain' && needsChainSwitch && (
        <ReviewActionChainSwitchRow
          requiredChain={requiredChain}
          needsChainSwitch={needsChainSwitch && currentChainId !== base.chainId}
          reviewState={reviewState}
          goToNextStep={goToNextStep}
          cancel={cancel}
        />
      )}
      {reviewState === 'wrapping' && needsToWrap && (
        <ReviewActionWrapGasToken
          needsToWrap={needsToWrap}
          amount={baseAmount}
          chainId={base.chainId as SupportedChainId}
          token={base}
          reviewState={reviewState}
          setReviewState={setReviewState}
          goToNextStep={goToNextStep}
          cancel={cancel}
          delayedClose={delayedClose}
          isWrappingPair={isWrappingPair}
        />
      )}
      {reviewState === 'unwrapping' && needsToUnwrap && (
        <ReviewActionUnwrapGasToken
          needsToUnwrap={needsToUnwrap}
          amount={baseAmount}
          chainId={base.chainId as SupportedChainId}
          token={base}
          reviewState={reviewState}
          setReviewState={setReviewState}
          goToNextStep={goToNextStep}
          cancel={cancel}
          delayedClose={delayedClose}
        />
      )}
      {reviewState === 'approval' && needsApproval && (
        <ReviewActionApprovalRow
          needsApproval={needsApproval}
          accountAddress={userAddress as `0x${string}`}
          token={base}
          reviewState={reviewState}
          goToNextStep={goToNextStep}
          baseAmount={baseAmount}
          currentAllowance={currentAllowance}
          cancel={cancel}
        />
      )}
      {reviewState === 'signingOrder' && needsSignature && (
        <ReviewActionSignAndSubmitOrderRow
          base={base}
          baseAmount={baseAmount}
          quote={quote}
          quoteAmount={quoteAmount}
          userAddress={userAddress}
          reviewState={reviewState}
          goToNextStep={goToNextStep}
          cancel={cancel}
          restartSigningFlow={restartSigningFlow}
          onSwapInitiated={onSwapInitiated}
          onOrderSubmitted={onOrderSubmitted}
          isWrappingPair={isWrappingPair}
          isUnwrappingPair={isUnwrappingPair}
          onSwapSubmitted={onSwapSubmitted}
          startPolling={startPolling}
          trackNativeTransaction={trackNativeTransaction}
        />
      )}
      {reviewState === 'trackingTx' && trackedOrderHash && (
        <ReviewActionTxRow
          orderHash={trackedOrderHash}
          base={base}
          quote={quote}
          baseAmount={baseAmount}
          quoteAmount={quoteAmount}
          reviewState={reviewState}
          status={txStatus}
          onNewSwap={handleNewSwap}
          onRetry={handleRetrySwap}
        />
      )}
      {/* Fallback for unhandled transitional states */}
      {reviewState &&
        ![
          'chain',
          'wrapping',
          'unwrapping',
          'approval',
          'signingOrder',
          'trackingTx',
          'success',
          'wrapSuccess',
          'cancelled',
        ].includes(reviewState) && (
          <button
            disabled
            className={`w-full ${isCompact ? 'py-2' : 'py-3'} text-sm font-sans font-medium`}
            style={{
              backgroundColor: 'var(--widget-muted)',
              color: 'var(--widget-muted-foreground)',
              borderRadius: 'var(--widget-radius)',
            }}
          >
            Processing...
          </button>
        )}
    </div>
  );
};
