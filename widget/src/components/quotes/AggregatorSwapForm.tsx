'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useShallow } from 'zustand/react/shallow';
import { type ReviewOrderStep, toBigInt } from '../../internal';
import { useWidgetConfig } from '../../context/WidgetConfigContext';
import { useWalletScreening } from '../../context/WalletScreeningContext';
import { useEffectiveTokenConfig } from '../../hooks/useEffectiveTokenConfig';
import { estimateGasBuffer } from '../../lib/estimateGasBuffer';
import { useQuotes } from '../../providers/QuotesProvider';
import { useSwapFormContext } from '../../providers/SwapFormProvider';
import { useWidgetSwapUIStore } from '../../stores/swapUIStore';
import { useWalletState } from '../../wallet/useWalletState';
import { useWalletModal } from '../../wallet/WalletModalContext';
import { SwapIcon } from '../../internal/icons/SwapIcon';
import RecipientForm from '../RecipientForm';
import { WalletBlockedBanner } from '../WalletBlockedBanner';
import TxStatusDisplay from '../states/TxStatusDisplay';
import { AggregatorSwapButton } from './AggregatorSwapButton';
import QuoteList from './QuoteList';
import { SwapTokenControls } from './SwapTokenControls';

interface AggregatorSwapFormProps {
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapComplete?: (data: import('../../lib/parseExplorerHash').SwapCompleteData) => void;
  onSwapInitiated?: () => void;
}

/**
 * Aggregator swap form — the multi-venue counterpart to `SwapForm`. Reuses the
 * shared token input sections, but sources quotes from `QuotesProvider`, renders
 * a `QuoteList` for selection, and executes the selected `NormalizedQuote` via
 * `sdk.bridgeQuote` (dispatched to the correct venue). Only mounted when
 * aggregator mode is active; the classic Aori path is untouched.
 */
const AggregatorSwapForm: React.FC<AggregatorSwapFormProps> = ({
  onSwapSubmitted,
  onSwapComplete,
  onSwapInitiated,
}) => {
  const { lockBase, lockQuote, disableInverting, widgetType, tokenDisplay, tokenBadgeOrientation } =
    useWidgetConfig();
  const { effectiveInputTokens, effectiveOutputTokens } = useEffectiveTokenConfig();
  const isBaseLocked = effectiveInputTokens.length === 1;
  const isQuoteLocked = effectiveOutputTokens.length === 1;
  const isCompactMode = widgetType === 'compact';
  const isOverlayToken = tokenDisplay === 'pill' || tokenDisplay === 'ghost';
  const basePadding = isCompactMode ? 'px-4 pt-3 pb-1' : 'px-4 pt-4 pb-2';
  const quotePadding = isCompactMode ? 'px-4 pt-4 pb-1' : 'px-4 pt-6 pb-2';

  const {
    baseToken,
    quoteToken,
    baseAmount,
    quoteAmount,
    isBaseGasToken,
    isWrappingPair,
    isUnwrappingPair,
    baseBalance,
    setBaseAmount,
    setQuoteAmount,
    swapTokens,
    clearForm,
  } = useSwapFormContext();

  const { selectedQuote, handleInputChange, ensureForParams, clear } = useQuotes();
  const { address: userAddress } = useWalletState();
  const { isBlocked: isWalletBlocked } = useWalletScreening();
  const { openConnectModal: openWalletModal } = useWalletModal();
  const { hasConnectHandler } = useWidgetConfig();

  const { isRecipientInputOpen, txStatus } = useWidgetSwapUIStore(
    useShallow((state) => ({
      isRecipientInputOpen: state.isRecipientInputOpen,
      txStatus: state.txStatus,
    })),
  );

  const [reviewState, setReviewState] = useState<ReviewOrderStep | null>(null);
  const [trackedOrderHash, setTrackedOrderHash] = useState<string | null>(null);
  const [trackedVenue, setTrackedVenue] = useState<string | null>(null);
  const isPlacingOrder = isWalletBlocked || reviewState === 'trackingTx';
  const isQuotingOrReview = reviewState !== null;

  // Gentle fade-in when the (lazy) form mounts over the skeleton — avoids a hard
  // pop-in. Height is already stable because the token sections render at once.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reset when the token pair changes.
  const prevTokenKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${baseToken?.address}-${baseToken?.chainId}|${quoteToken?.address}-${quoteToken?.chainId}`;
    if (prevTokenKeyRef.current && prevTokenKeyRef.current !== key) {
      if (reviewState !== null) {
        setReviewState(null);
        setTrackedOrderHash(null);
      }
      clear();
      clearForm();
    }
    prevTokenKeyRef.current = key;
  }, [baseToken?.address, baseToken?.chainId, quoteToken?.address, quoteToken?.chainId, reviewState, clear, clearForm]);

  // Drive quote fetching from amount/token changes (mirrors SwapForm's RFQ wiring).
  useEffect(() => {
    if (reviewState !== null) return;
    if (!baseToken || !quoteToken) return;
    if (!baseAmount || baseAmount <= 0) {
      handleInputChange({ amount: null, inputToken: baseToken, outputToken: quoteToken, setOutputAmount: setQuoteAmount });
      return;
    }
    handleInputChange({
      amount: baseAmount,
      inputToken: baseToken,
      outputToken: quoteToken,
      setOutputAmount: setQuoteAmount,
    });
  }, [reviewState, baseAmount, baseToken, quoteToken, handleInputChange, setQuoteAmount]);

  // Reflect the selected venue's output into the form's quote amount so the
  // amount field (and the tracking screen) match the pinned quote.
  useEffect(() => {
    if (reviewState !== null) return;
    if (!selectedQuote || quoteToken?.decimals == null) return;
    try {
      setQuoteAmount(Number(formatUnits(toBigInt(selectedQuote.outputAmount), quoteToken.decimals)));
    } catch {
      /* ignore malformed amounts */
    }
  }, [selectedQuote, quoteToken?.decimals, reviewState, setQuoteAmount]);

  const handleToggleBaseSelection = useCallback(() => {
    useWidgetSwapUIStore.getState().setView('baseSelection');
  }, []);
  const handleToggleQuoteSelection = useCallback(() => {
    useWidgetSwapUIStore.getState().setView('quoteSelection');
  }, []);

  const handleInvert = useCallback(() => {
    clear();
    swapTokens();
    setBaseAmount(null);
    setQuoteAmount(null);
  }, [clear, swapTokens, setBaseAmount, setQuoteAmount]);

  const handleMax = useCallback(async () => {
    if (!baseBalance.formatted || !baseToken || !quoteToken) return;
    const balNum = parseFloat(baseBalance.formatted);
    if (!balNum || balNum <= 0) return;

    let adjusted: number;
    if (isBaseGasToken) {
      const gasBuffer = await estimateGasBuffer(baseToken.chainId, userAddress ?? undefined, baseBalance.raw);
      adjusted = Math.max(0, balNum - gasBuffer);
      if (adjusted <= 0) return;
    } else {
      adjusted = balNum * 0.9999999999;
    }

    setBaseAmount(adjusted);
    setQuoteAmount(null);
    ensureForParams({
      inputToken: baseToken,
      outputToken: quoteToken,
      inputAmount: adjusted.toString(),
      setOutputAmount: (amount) => setQuoteAmount(amount),
    });
  }, [baseBalance.formatted, baseBalance.raw, baseToken, quoteToken, userAddress, isBaseGasToken, setBaseAmount, setQuoteAmount, ensureForParams]);

  const handleClear = useCallback(() => {
    clear();
    clearForm();
  }, [clear, clearForm]);

  const handleReset = useCallback(() => {
    useWidgetSwapUIStore.getState().stopTracking();
    setReviewState(null);
    setTrackedOrderHash(null);
    setTrackedVenue(null);
    clear();
    clearForm();
  }, [clear, clearForm]);

  const baseBalanceNum = baseBalance.formatted ? parseFloat(baseBalance.formatted) : null;
  const hasAmount = !!(baseAmount || quoteAmount);

  const baseUsd = baseToken?.price && baseAmount ? `$${(baseToken.price * baseAmount).toFixed(2)}` : '$0.00';
  const quoteUsd = quoteToken?.price && quoteAmount ? `$${(quoteToken.price * quoteAmount).toFixed(2)}` : '$0.00';

  const isShowingTxStatus =
    reviewState === 'trackingTx' && !!trackedOrderHash && !!baseToken && !!quoteToken && !!baseAmount && !!quoteAmount;

  return (
    <div
      className="flex flex-col w-full"
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.2s ease-out' }}
    >
      <div>
        {isShowingTxStatus && trackedOrderHash && baseToken && quoteToken && baseAmount && quoteAmount ? (
          <div className="overflow-hidden">
            <TxStatusDisplay
              orderHash={trackedOrderHash}
              base={baseToken}
              quote={quoteToken}
              baseAmount={baseAmount}
              quoteAmount={quoteAmount}
              status={txStatus}
              venue={trackedVenue ?? selectedQuote?.venue}
            />
          </div>
        ) : (
          <>
            {/* ── BASE TOKEN SECTION ── */}
            <div className={`relative ${basePadding}`} style={{ borderBottom: '1px solid var(--widget-border)' }}>
              <SwapTokenControls
                side="base"
                asset={baseToken}
                otherAsset={quoteToken}
                toggle={handleToggleBaseSelection}
                isPlacingOrder={isPlacingOrder}
                locked={lockBase || isBaseLocked}
                hideDropdown={isBaseLocked}
                isOverlayToken={isOverlayToken}
                isCompactMode={isCompactMode}
                tokenBadgeOrientation={tokenBadgeOrientation}
                isWrappingPair={isWrappingPair}
                isUnwrappingPair={isUnwrappingPair}
              />
              <div className="mb-1 flex w-full flex-row items-center justify-between">
                <p className="font-sans text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>
                  {baseUsd}
                </p>
                {userAddress && baseBalanceNum !== null && baseBalanceNum > 0 && (
                  <button
                    type="button"
                    onClick={handleMax}
                    disabled={isPlacingOrder}
                    className="absolute bottom-3 right-4 flex items-center px-3 py-0.5 text-xs font-medium uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-(--widget-primary) text-(--widget-primary-foreground) hover:bg-(--widget-foreground) hover:text-(--widget-card)"
                    style={{ borderRadius: 'var(--widget-radius)' }}
                  >
                    Max
                  </button>
                )}
              </div>
            </div>

            {/* ── INVERT BUTTON ── */}
            {!disableInverting && (
              <div className="flex justify-center -my-4 relative z-10">
                <button
                  type="button"
                  onClick={handleInvert}
                  disabled={isQuotingOrReview || isWalletBlocked}
                  aria-label="Swap input and output tokens"
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors bg-(--widget-card) ${
                    isQuotingOrReview || isWalletBlocked
                      ? 'cursor-not-allowed opacity-40 pointer-events-none'
                      : 'cursor-pointer text-(--widget-muted-foreground) hover:bg-(--widget-secondary) hover:text-(--widget-foreground)'
                  }`}
                  style={{ border: '1px solid var(--widget-border)' }}
                >
                  <SwapIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ── QUOTE TOKEN SECTION ── */}
            <div className={`relative ${quotePadding}`}>
              <SwapTokenControls
                side="quote"
                asset={quoteToken}
                otherAsset={baseToken}
                toggle={handleToggleQuoteSelection}
                isPlacingOrder={isPlacingOrder}
                locked={lockQuote || isQuoteLocked}
                hideDropdown={isQuoteLocked}
                isOverlayToken={isOverlayToken}
                isCompactMode={isCompactMode}
                tokenBadgeOrientation={tokenBadgeOrientation}
                isWrappingPair={isWrappingPair}
                isUnwrappingPair={isUnwrappingPair}
              />
              <div className="flex w-full flex-row items-center justify-between">
                <p className="font-sans text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>
                  {quoteUsd}
                </p>
                {hasAmount && (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={isPlacingOrder}
                    className="absolute bottom-2 right-4 flex items-center px-3 py-0.5 text-xs font-medium uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-(--widget-muted-foreground) hover:bg-(--widget-secondary)"
                    style={{ borderRadius: 'var(--widget-radius)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* ── RECIPIENT FORM ── */}
            <div
              className="flex flex-row items-center w-full overflow-hidden"
              style={{
                borderTop: isRecipientInputOpen ? '1px solid var(--widget-border)' : 'none',
                maxHeight: isRecipientInputOpen ? '60px' : '0px',
                opacity: isRecipientInputOpen ? 1 : 0,
                transition: 'max-height 0.3s ease, opacity 0.3s ease',
              }}
            >
              <RecipientForm />
            </div>

            {/* ── QUOTE LIST (venue selection) — shown whether or not a wallet is
                connected; quotes are pricing-only and requote on connect. ── */}
            {baseAmount && baseAmount > 0 ? (
              <div
                className="px-4"
                style={{
                  borderTop: '1px solid var(--widget-border)',
                  borderBottom: '1px solid var(--widget-border)',
                }}
              >
                <QuoteList />
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── SWAP / CONNECT BUTTON ── */}
      <div className={`relative ${isShowingTxStatus ? 'px-4 pb-4' : 'px-4'} ${isCompactMode ? 'py-2' : 'py-4'}`}>
        {userAddress && isWalletBlocked ? (
          <WalletBlockedBanner />
        ) : userAddress && baseToken && quoteToken && baseAmount && baseAmount > 0 ? (
          <AggregatorSwapButton
            base={baseToken}
            quote={quoteToken}
            baseAmount={baseAmount}
            quoteAmount={quoteAmount ?? 0}
            userAddress={userAddress}
            selectedQuote={selectedQuote}
            reviewState={reviewState}
            setReviewState={setReviewState}
            setTrackedOrderHash={setTrackedOrderHash}
            setTrackedVenue={setTrackedVenue}
            onSwapSubmitted={onSwapSubmitted}
            onSwapComplete={onSwapComplete}
            onSwapInitiated={onSwapInitiated}
            txStatus={txStatus}
            onReset={handleReset}
          />
        ) : !userAddress && hasConnectHandler ? (
          <button
            onClick={() => openWalletModal()}
            className={`w-full ${isCompactMode ? 'py-2' : 'py-3'} text-sm font-sans font-medium cursor-pointer transition-opacity hover:opacity-80`}
            style={{
              backgroundColor: 'var(--widget-primary)',
              color: 'var(--widget-primary-foreground)',
              borderRadius: 'var(--widget-radius)',
            }}
          >
            Connect Wallet
          </button>
        ) : (
          <button
            disabled
            className={`w-full ${isCompactMode ? 'py-2' : 'py-3'} text-sm font-sans font-medium transition-colors disabled:opacity-40 cursor-not-allowed`}
            style={{
              backgroundColor: 'var(--widget-primary)',
              color: 'var(--widget-primary-foreground)',
              borderRadius: 'var(--widget-radius)',
            }}
          >
            {!userAddress ? 'Connect Wallet' : 'Enter Amount'}
          </button>
        )}
      </div>
    </div>
  );
};

export default AggregatorSwapForm;
