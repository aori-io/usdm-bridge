'use client';

import { type Asset, type ReviewOrderStep, NATIVE_ASSET_ADDRESS, useAori } from '../internal';
import { useAllowance } from '../queries/useAllowance';
import { useWalletModal } from '../wallet/WalletModalContext';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useShallow } from 'zustand/react/shallow';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useEffectiveTokenConfig } from '../hooks/useEffectiveTokenConfig';
import { estimateGasBuffer } from '../lib/estimateGasBuffer';
import { useRfq } from '../providers/RfqProvider';
import { useSwapFormContext } from '../providers/SwapFormProvider';
import { useWidgetSwapUIStore } from '../stores/swapUIStore';
import { useWalletState } from '../wallet/useWalletState';
import { useWalletScreening } from '../context/WalletScreeningContext';
import { WalletBlockedBanner } from './WalletBlockedBanner';
import AssetAmountInput from './AssetAmountInput';
import AssetSelection from './AssetSelection';
import QuoteLoader from './QuoteLoader';
import RecipientForm from './RecipientForm';
import { SwapIcon } from '../internal/icons/SwapIcon';
import { SwapButton } from './states/SwapButton';
import TxStatusDisplay from './states/TxStatusDisplay';

interface ReviewActionProps {
  base: Asset;
  quote: Asset;
  baseAmount: number;
  quoteAmount: number;
  userAddress: string;
}

interface SwapFormProps {
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapInitiated?: () => void;
  startPolling: (quoteId: string, metadata?: { baseToken?: Asset; quoteToken?: Asset }) => void;
  trackNativeTransaction: (txHash: string, description: string) => void;
}

const SwapForm: React.FC<SwapFormProps> = ({ onSwapSubmitted, onSwapInitiated, startPolling, trackNativeTransaction }) => {
  const {
    web3ConnectionType,
    hasConnectHandler,
    lockBase,
    lockQuote,
    disableInverting,
    tokenDisplay,
    tokenBadgeOrientation,
    widgetType,
  } = useWidgetConfig();
  const { effectiveInputTokens, effectiveOutputTokens } = useEffectiveTokenConfig();
  const isBaseLocked = effectiveInputTokens.length === 1;
  const isQuoteLocked = effectiveOutputTokens.length === 1;
  const isOverlayToken = tokenDisplay === 'pill' || tokenDisplay === 'ghost';
  const isCompactMode = widgetType === 'compact';
  const basePadding = isCompactMode ? 'px-4 pt-3 pb-1' : 'px-4 pt-4 pb-2';
  const quotePadding = isCompactMode ? 'px-4 pt-4 pb-1' : 'px-4 pt-6 pb-2';
  const {
    baseToken,
    quoteToken,
    baseAmount,
    quoteAmount,
    isBaseGasToken,
    isQuoteGasToken,
    isWrappingPair,
    isUnwrappingPair,
    baseBalance,
    quoteBalance,
    setBaseAmount,
    setQuoteAmount,
    swapTokens,
    clearForm,
  } = useSwapFormContext();

  const {
    rfqQuote,
    status: rfqStatus,
    handleInputChange,
    ensureForParams,
    stop,
    clear,
    refresh,
  } = useRfq();
  const { address: userAddress } = useWalletState();
  const { isBlocked: isWalletBlocked } = useWalletScreening();
  const { openConnectModal: openWalletModal } = useWalletModal();
  const { isRecipientInputOpen, txStatus } =
    useWidgetSwapUIStore(
      useShallow((state) => ({
        isRecipientInputOpen: state.isRecipientInputOpen,
        txStatus: state.txStatus,
      })),
    );

  const [reviewState, setReviewState] = useState<ReviewOrderStep | null>(null);
  const [trackedOrderHash, setTrackedOrderHash] = useState<string | null>(null);
  const isHandlingStaleRestart = useRef(false);
  const isPlacingOrder = isWalletBlocked;
  const isQuotingOrReview = reviewState !== null;

  const prevTokenKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${baseToken?.address}-${baseToken?.chainId}|${quoteToken?.address}-${quoteToken?.chainId}`;
    if (prevTokenKeyRef.current && prevTokenKeyRef.current !== key) {
      if (reviewState !== null || rfqQuote !== null || rfqStatus === 'polling') {
        setReviewState(null);
        setTrackedOrderHash(null);
        clear();
        clearForm();
      }
    }
    prevTokenKeyRef.current = key;
  }, [baseToken?.address, baseToken?.chainId, quoteToken?.address, quoteToken?.chainId, reviewState, rfqQuote, rfqStatus, clear, clearForm]);

  const prevShowingTxRef = useRef(false);
  const [contentOpacity, setContentOpacity] = useState(1);
  useEffect(() => {
    const showing =
      reviewState === 'trackingTx' &&
      !!trackedOrderHash &&
      !!baseToken &&
      !!quoteToken &&
      !!baseAmount &&
      !!quoteAmount;
    if (prevShowingTxRef.current !== showing) {
      setContentOpacity(0);
      const timer = setTimeout(() => setContentOpacity(1), 50);
      prevShowingTxRef.current = showing;
      return () => clearTimeout(timer);
    } else if (contentOpacity === 0) {
      setContentOpacity(1);
    }
  }, [reviewState, trackedOrderHash, baseToken, quoteToken, baseAmount, quoteAmount, contentOpacity]);

  const prevReviewStateRef = useRef(reviewState);
  const [buttonOpacity, setButtonOpacity] = useState(1);
  useEffect(() => {
    if (prevReviewStateRef.current !== reviewState) {
      setButtonOpacity(0);
      const timer = setTimeout(() => setButtonOpacity(1), 50);
      prevReviewStateRef.current = reviewState;
      return () => clearTimeout(timer);
    }
  }, [reviewState]);

  // ── Allowance / approval ──────────────────────────────────────────────────
  const aori = useAori();
  // True native tokens (0xEeee...) can't be approved. Contract-based gas tokens
  // (e.g. USDT0 on Stable) are real ERC20s that still require an allowance check.
  const isBaseTrueNative =
    isBaseGasToken &&
    baseToken?.address?.toLowerCase() === NATIVE_ASSET_ADDRESS.toLowerCase();

  const spenderAddress = baseToken?.chainId
    ? (aori?.getChain(baseToken.chainId)?.address as `0x${string}` | undefined)
    : undefined;

  const { data: allowanceQueryData } = useAllowance({
    accountAddress: userAddress ?? undefined,
    chainId: baseToken?.chainId,
    spenderAddress,
    tokenAddress: baseToken?.address,
    decimals: baseToken?.decimals,
    enabled: !!(
      userAddress &&
      baseToken?.chainId &&
      baseToken?.address &&
      baseToken?.decimals != null &&
      spenderAddress &&
      !isBaseTrueNative &&
      rfqQuote !== null
    ),
    pollingInterval: reviewState ? 30000 : 0,
  });

  const currentAllowance = allowanceQueryData?.allowanceFormatted
    ? parseFloat(allowanceQueryData.allowanceFormatted)
    : null;

  const needsApproval =
    !isBaseTrueNative &&
    !isWrappingPair &&
    !isUnwrappingPair &&
    typeof baseAmount === 'number' &&
    currentAllowance !== null &&
    baseAmount > currentAllowance;

  const reviewActionProps = useMemo((): ReviewActionProps | null => {
    if (!baseToken || !quoteToken || typeof baseAmount !== 'number' || !quoteAmount || !userAddress) return null;
    if (parseFloat(baseBalance.formatted) < baseAmount) return null;
    // For ERC20 swaps the allowance must be loaded before we can decide whether
    // an approval step is needed; wrap/unwrap and true-native skip this gate.
    if (!isWrappingPair && !isUnwrappingPair && !isBaseTrueNative && currentAllowance === null) {
      return null;
    }
    return { base: baseToken, quote: quoteToken, baseAmount, quoteAmount, userAddress };
  }, [baseToken, quoteToken, baseAmount, quoteAmount, userAddress, baseBalance.formatted, isWrappingPair, isUnwrappingPair, isBaseTrueNative, currentAllowance]);

  // Called by ReviewActionSignAndSubmitOrderRow on successful submission.
  const onOrderSubmitted = useCallback((orderHash: string) => {
    setTrackedOrderHash(orderHash);
    useWidgetSwapUIStore.getState().startTracking(orderHash);
  }, []);

  // Called by SwapButton on stale-quote restart — marks the restart so we
  // don't accidentally double-poll and calls refresh() to get a fresh quote.
  const onStaleQuoteRestart = useCallback(() => {
    isHandlingStaleRestart.current = true;
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (reviewState !== null) return;
    if (!baseToken || !quoteToken) return;
    if (!baseAmount || baseAmount <= 0) {
      handleInputChange({ amount: null, inputToken: baseToken, outputToken: quoteToken, setOutputAmount: setQuoteAmount });
      return;
    }
    if (isWrappingPair || isUnwrappingPair) {
      setQuoteAmount(baseAmount);
      return;
    }
    handleInputChange({
      amount: baseAmount,
      inputToken: baseToken,
      outputToken: quoteToken,
      setOutputAmount: setQuoteAmount,
    });
  }, [
    reviewState,
    baseAmount,
    baseToken,
    quoteToken,
    isWrappingPair,
    isUnwrappingPair,
    handleInputChange,
    setQuoteAmount,
  ]);

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

    if (isWrappingPair || isUnwrappingPair) {
      setBaseAmount(adjusted);
      setQuoteAmount(adjusted);
      clear();
    } else {
      setBaseAmount(adjusted);
      setQuoteAmount(null);
      ensureForParams({
        inputToken: baseToken,
        outputToken: quoteToken,
        inputAmount: adjusted.toString(),
        setOutputAmount: (amount) => setQuoteAmount(amount),
      });
    }
  }, [
    baseBalance.formatted,
    baseBalance.raw,
    baseToken,
    quoteToken,
    userAddress,
    isBaseGasToken,
    isWrappingPair,
    isUnwrappingPair,
    setBaseAmount,
    setQuoteAmount,
    clear,
    ensureForParams,
  ]);

  const handleClear = useCallback(() => {
    clear();
    clearForm();
  }, [clear, clearForm]);

  const baseBalanceNum = baseBalance.formatted
    ? parseFloat(baseBalance.formatted)
    : null;
  const hasAmount = !!(baseAmount || quoteAmount);

  const baseUsd =
    baseToken?.price && baseAmount
      ? `$${(baseToken.price * baseAmount).toFixed(2)}`
      : '$0.00';
  const quoteUsd =
    quoteToken?.price && quoteAmount
      ? `$${(quoteToken.price * quoteAmount).toFixed(2)}`
      : '$0.00';

  const isShowingTxStatus =
    reviewState === 'trackingTx' &&
    !!trackedOrderHash &&
    !!baseToken &&
    !!quoteToken &&
    !!baseAmount &&
    !!quoteAmount;

  return (
    <div className="flex flex-col w-full">
      <div style={{ opacity: contentOpacity, transition: 'opacity 0.3s ease-out' }}>
      {isShowingTxStatus &&
      trackedOrderHash &&
      baseToken &&
      quoteToken &&
      baseAmount &&
      quoteAmount ? (
        /* ── TX STATUS (replaces token sections during tracking) ── */
        <div className="overflow-hidden">
          <TxStatusDisplay
            orderHash={trackedOrderHash}
            base={baseToken}
            quote={quoteToken}
            baseAmount={baseAmount}
            quoteAmount={quoteAmount}
            status={txStatus}
          />
        </div>
      ) : (
        <>
          {/* ── BASE TOKEN SECTION ───────────────────────────── */}
          <div
            className={`relative ${basePadding}`}
            style={{ borderBottom: '1px solid var(--widget-border)' }}
          >
            {isOverlayToken ? (
              isCompactMode ? (
                // compact + pill/ghost: side-by-side row, badge on side
                <div
                  className={`flex items-center gap-2 mb-2 ${tokenBadgeOrientation === 'right' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <AssetSelection
                    toggle={handleToggleBaseSelection}
                    side="base"
                    asset={baseToken}
                    isPlacingOrder={isPlacingOrder || lockBase || isBaseLocked}
                    hideDropdown={isBaseLocked}
                  />
                  <div className="flex-1 min-w-0">
                    <AssetAmountInput
                      side="base"
                      asset={baseToken ?? null}
                      otherAsset={quoteToken ?? null}
                      isPlacingOrder={isPlacingOrder}
                      isWrappingPair={isWrappingPair}
                      isUnwrappingPair={isUnwrappingPair}
                    />
                  </div>
                </div>
              ) : (
                // default + pill/ghost: badge stacked above input, aligned to chosen side
                <div
                  className={`flex flex-col ${tokenBadgeOrientation === 'right' ? 'items-end' : 'items-start'}`}
                >
                  <AssetSelection
                    toggle={handleToggleBaseSelection}
                    side="base"
                    asset={baseToken}
                    isPlacingOrder={isPlacingOrder || lockBase || isBaseLocked}
                    hideDropdown={isBaseLocked}
                  />
                  <AssetAmountInput
                    side="base"
                    asset={baseToken ?? null}
                    otherAsset={quoteToken ?? null}
                    isPlacingOrder={isPlacingOrder}
                    isWrappingPair={isWrappingPair}
                    isUnwrappingPair={isUnwrappingPair}
                  />
                </div>
              )
            ) : (
              <>
                <AssetSelection
                  toggle={handleToggleBaseSelection}
                  side="base"
                  asset={baseToken}
                  isPlacingOrder={isPlacingOrder || lockBase || isBaseLocked}
                  hideDropdown={isBaseLocked}
                />
                <AssetAmountInput
                  side="base"
                  asset={baseToken ?? null}
                  otherAsset={quoteToken ?? null}
                  isPlacingOrder={isPlacingOrder}
                  isWrappingPair={isWrappingPair}
                  isUnwrappingPair={isUnwrappingPair}
                />
              </>
            )}

            {/* USD value + MAX button */}
            <div className="mb-1 flex w-full flex-row items-center justify-between">
              <p
                className="font-sans text-sm"
                style={{ color: 'var(--widget-muted-foreground)' }}
              >
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

          {/* ── INVERT BUTTON (centered on border) ───────────── */}
          {!disableInverting && (
            <div className="flex justify-center -my-4 relative z-10">
              <button
                type="button"
                onClick={handleInvert}
                disabled={isQuotingOrReview || isWalletBlocked}
                aria-label="Swap input and output tokens"
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors bg-(--widget-card) ${isQuotingOrReview || isWalletBlocked ? 'cursor-not-allowed opacity-40 pointer-events-none' : 'cursor-pointer text-(--widget-muted-foreground) hover:bg-(--widget-secondary) hover:text-(--widget-foreground)'}`}
                style={{ border: '1px solid var(--widget-border)' }}
              >
                <SwapIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ── QUOTE TOKEN SECTION ──────────────────────────── */}
          <div className={`relative ${quotePadding}`}>
            {isOverlayToken ? (
              isCompactMode ? (
                <div
                  className={`flex items-center gap-2 ${tokenBadgeOrientation === 'right' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <AssetSelection
                    toggle={handleToggleQuoteSelection}
                    side="quote"
                    asset={quoteToken}
                    isPlacingOrder={isPlacingOrder || lockQuote || isQuoteLocked}
                    hideDropdown={isQuoteLocked}
                  />
                  <div className="flex-1 min-w-0">
                    <AssetAmountInput
                      side="quote"
                      asset={quoteToken ?? null}
                      otherAsset={baseToken ?? null}
                      isPlacingOrder={isPlacingOrder}
                      isWrappingPair={isWrappingPair}
                      isUnwrappingPair={isUnwrappingPair}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className={`flex flex-col ${tokenBadgeOrientation === 'right' ? 'items-end' : 'items-start'}`}
                >
                  <AssetSelection
                    toggle={handleToggleQuoteSelection}
                    side="quote"
                    asset={quoteToken}
                    isPlacingOrder={isPlacingOrder || lockQuote || isQuoteLocked}
                    hideDropdown={isQuoteLocked}
                  />
                  <AssetAmountInput
                    side="quote"
                    asset={quoteToken ?? null}
                    otherAsset={baseToken ?? null}
                    isPlacingOrder={isPlacingOrder}
                    isWrappingPair={isWrappingPair}
                    isUnwrappingPair={isUnwrappingPair}
                  />
                </div>
              )
            ) : (
              <>
                <AssetSelection
                  toggle={handleToggleQuoteSelection}
                  side="quote"
                  asset={quoteToken}
                  isPlacingOrder={isPlacingOrder || lockQuote || isQuoteLocked}
                  hideDropdown={isQuoteLocked}
                />
                <AssetAmountInput
                  side="quote"
                  asset={quoteToken ?? null}
                  otherAsset={baseToken ?? null}
                  isPlacingOrder={isPlacingOrder}
                  isWrappingPair={isWrappingPair}
                  isUnwrappingPair={isUnwrappingPair}
                />
              </>
            )}

            {/* USD value + CLEAR button */}
            <div className="flex w-full flex-row items-center justify-between">
              <p
                className="font-sans text-sm"
                style={{ color: 'var(--widget-muted-foreground)' }}
              >
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

          {/* ── RECIPIENT FORM (animated maxHeight, always mounted) ── */}
          <div
            className="flex flex-row items-center w-full overflow-hidden"
            style={{
              borderTop: isRecipientInputOpen
                ? '1px solid var(--widget-border)'
                : 'none',
              maxHeight: isRecipientInputOpen ? '60px' : '0px',
              opacity: isRecipientInputOpen ? 1 : 0,
              transition: 'max-height 0.3s ease, opacity 0.3s ease',
            }}
          >
            <RecipientForm />
          </div>

          {/* ── QUOTE LOADER with borders ── */}
          <div
            className="px-4"
            style={{
              borderTop: '1px solid var(--widget-border)',
              borderBottom: '1px solid var(--widget-border)',
            }}
          >
            <QuoteLoader />
          </div>
        </>
      )}
      </div>

      {/* ── SWAP / CONNECT BUTTON ─────────────────────────── */}
      <div
        className={`relative ${isShowingTxStatus ? 'px-0 pb-4' : 'px-4'} ${isCompactMode ? 'py-2' : 'py-4'}`}
        style={{ opacity: buttonOpacity, transition: 'opacity 0.3s ease-out' }}
      >
        {userAddress && isWalletBlocked ? (
          <WalletBlockedBanner />
        ) : userAddress &&
        baseToken &&
        quoteToken &&
        baseAmount &&
        baseAmount > 0 ? (
          <SwapButton
            base={baseToken}
            baseAmount={baseAmount}
            quote={quoteToken}
            quoteAmount={quoteAmount ?? 0}
            userAddress={userAddress}
            isWrappingPair={isWrappingPair}
            isUnwrappingPair={isUnwrappingPair}
            isBaseGasToken={isBaseGasToken}
            isQuoteGasToken={isQuoteGasToken}
            isBaseTrueNative={isBaseTrueNative}
            needsApproval={needsApproval}
            currentAllowance={currentAllowance ?? 0}
            reviewActionProps={reviewActionProps}
            reviewState={reviewState}
            setReviewState={setReviewState}
            trackedOrderHash={trackedOrderHash}
            setTrackedOrderHash={setTrackedOrderHash}
            onSwapSubmitted={onSwapSubmitted}
            onSwapInitiated={onSwapInitiated}
            onOrderSubmitted={onOrderSubmitted}
            onStaleQuoteRestart={onStaleQuoteRestart}
            txStatus={txStatus}
            startPolling={startPolling}
            trackNativeTransaction={trackNativeTransaction}
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

export default SwapForm;
