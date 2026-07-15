'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useShallow } from 'zustand/react/shallow';
import { type ReviewOrderStep, type SupportedChainId, toBigInt } from '../../internal';
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
import AssetSelectionMenu from '../AssetSelectionMenu';
import ChainSelectionMenu from '../ChainSelectionMenu';
import RecipientForm from '../RecipientForm';
import { WalletBlockedBanner } from '../WalletBlockedBanner';
import TxStatusDisplay from '../states/TxStatusDisplay';
import { AggregatorSwapButton } from './AggregatorSwapButton';
import QuoteList from './QuoteList';
import { SwapTokenControls } from './SwapTokenControls';

const NOOP = () => {};

interface AggregatorSwapFormHorizontalProps {
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapComplete?: (data: import('../../lib/parseExplorerHash').SwapCompleteData) => void;
  onSwapInitiated?: () => void;
  onBackToSwap?: () => void;
}

/**
 * Two-column aggregator form for the `horizontal` and `split` widget types.
 * Mirrors `SwapFormHorizontal`'s layout (honoring `tokenDisplay` + inline
 * selection menus when `assetMenuVariant: 'split'`), but sources quotes from the
 * aggregator and executes the selected `NormalizedQuote`.
 */
const AggregatorSwapFormHorizontal: React.FC<AggregatorSwapFormHorizontalProps> = ({
  onSwapSubmitted,
  onSwapComplete,
  onSwapInitiated,
  onBackToSwap,
}) => {
  const {
    hasConnectHandler,
    lockBase,
    lockQuote,
    disableInverting,
    swapButtonVariant,
    tokenDisplay,
    tokenBadgeOrientation,
    widgetType,
    assetMenuVariant,
  } = useWidgetConfig();
  const { effectiveInputTokens, effectiveOutputTokens } = useEffectiveTokenConfig();
  const isBaseLocked = effectiveInputTokens.length === 1;
  const isQuoteLocked = effectiveOutputTokens.length === 1;
  const isOverlayToken = tokenDisplay === 'pill' || tokenDisplay === 'ghost';
  const isCompactMode = widgetType === 'compact';

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

  const { isRecipientInputOpen, txStatus, view, selectedChainFilterChainId } = useWidgetSwapUIStore(
    useShallow((state) => ({
      isRecipientInputOpen: state.isRecipientInputOpen,
      txStatus: state.txStatus,
      view: state.view,
      selectedChainFilterChainId: state.selectedChainFilter?.chainId ?? null,
    })),
  );

  const [reviewState, setReviewState] = useState<ReviewOrderStep | null>(null);
  const [trackedOrderHash, setTrackedOrderHash] = useState<string | null>(null);
  const [trackedVenue, setTrackedVenue] = useState<string | null>(null);
  const isPlacingOrder = isWalletBlocked || reviewState === 'trackingTx';

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

  // Reflect the selected venue's output into the quote amount.
  useEffect(() => {
    if (reviewState !== null) return;
    if (!selectedQuote || quoteToken?.decimals == null) return;
    try {
      setQuoteAmount(Number(formatUnits(toBigInt(selectedQuote.outputAmount), quoteToken.decimals)));
    } catch {
      /* ignore */
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

  // Inline selection (assetMenuVariant: 'split') — the selecting column shows the menu.
  const isSplitMenuMode = assetMenuVariant === 'split';
  const isBaseSelecting = isSplitMenuMode && (view === 'baseSelection' || view === 'baseChainSelection');
  const isQuoteSelecting = isSplitMenuMode && (view === 'quoteSelection' || view === 'quoteChainSelection');

  const handleInlineChainSelect = useCallback((chainId: SupportedChainId) => {
    const currentView = useWidgetSwapUIStore.getState().view;
    const side = currentView === 'baseChainSelection' ? 'base' : 'quote';
    useWidgetSwapUIStore.getState().setChainFilter({ chainId, side });
    useWidgetSwapUIStore.getState().pushRecentChain(chainId);
    useWidgetSwapUIStore
      .getState()
      .transitionToView(side === 'base' ? 'baseSelection' : 'quoteSelection', 'chainSelection');
  }, []);
  const handleInlineMoreChainsBase = useCallback(() => {
    useWidgetSwapUIStore.getState().transitionToView('baseChainSelection', 'chainSelection');
  }, []);
  const handleInlineMoreChainsQuote = useCallback(() => {
    useWidgetSwapUIStore.getState().transitionToView('quoteChainSelection', 'chainSelection');
  }, []);

  const connectButtonStyle: React.CSSProperties = {
    backgroundColor: swapButtonVariant === 'default' ? 'var(--widget-primary)' : 'transparent',
    color: swapButtonVariant === 'default' ? 'var(--widget-primary-foreground)' : 'var(--widget-primary)',
    border: swapButtonVariant !== 'default' ? '1px solid var(--widget-primary)' : 'none',
    borderRadius: 'var(--widget-radius)',
  };

  const columnClass = 'relative flex flex-col gap-1 p-3 rounded-lg overflow-hidden';
  const columnStyle: React.CSSProperties = {
    border: '1px solid var(--widget-border)',
    backgroundColor: 'var(--widget-card)',
  };

  return (
    <div
      className="flex flex-col w-full"
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.2s ease-out' }}
    >
      {isShowingTxStatus && trackedOrderHash && baseToken && quoteToken && baseAmount && quoteAmount ? (
        <div className="flex-1 min-h-0 overflow-hidden">
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
        <div className={`grid grid-cols-[1fr_auto_1fr] items-stretch px-4 ${isCompactMode ? 'pt-3 pb-1' : 'pt-4 pb-2'} gap-2`}>
          {/* BASE column */}
          <div className={`${columnClass} ${isBaseSelecting ? 'h-[380px]' : ''}`} style={columnStyle}>
            {isBaseSelecting ? (
              view === 'baseChainSelection' ? (
                <ChainSelectionMenu toggle={onBackToSwap ?? NOOP} side="base" onChainSelect={handleInlineChainSelect} />
              ) : (
                <AssetSelectionMenu
                  toggle={onBackToSwap ?? NOOP}
                  side="base"
                  otherAsset={quoteToken}
                  onMoreChainsClick={handleInlineMoreChainsBase}
                  selectedChainFilter={selectedChainFilterChainId}
                />
              )
            ) : (
              <>
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
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
                    {baseUsd}
                  </span>
                  {userAddress && baseBalanceNum !== null && baseBalanceNum > 0 && (
                    <button
                      type="button"
                      onClick={handleMax}
                      disabled={isPlacingOrder}
                      className="flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase cursor-pointer disabled:opacity-40 transition-colors bg-(--widget-primary) text-(--widget-primary-foreground) hover:bg-(--widget-foreground) hover:text-(--widget-card)"
                    >
                      Max
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Center invert button */}
          <div className="flex items-center justify-center px-1">
            {!disableInverting ? (
              <button
                type="button"
                onClick={handleInvert}
                disabled={isWalletBlocked}
                aria-label="Swap input and output tokens"
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors bg-(--widget-card) ${isWalletBlocked ? 'cursor-not-allowed opacity-40 pointer-events-none' : 'cursor-pointer text-(--widget-muted-foreground) hover:bg-(--widget-secondary) hover:text-(--widget-foreground)'}`}
                style={{ border: '1px solid var(--widget-border)' }}
              >
                <SwapIcon className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center opacity-20">
                <span className="text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>
                  →
                </span>
              </div>
            )}
          </div>

          {/* QUOTE column */}
          <div className={`${columnClass} ${isQuoteSelecting ? 'h-[380px]' : ''}`} style={columnStyle}>
            {isQuoteSelecting ? (
              view === 'quoteChainSelection' ? (
                <ChainSelectionMenu toggle={onBackToSwap ?? NOOP} side="quote" onChainSelect={handleInlineChainSelect} />
              ) : (
                <AssetSelectionMenu
                  toggle={onBackToSwap ?? NOOP}
                  side="quote"
                  otherAsset={baseToken}
                  onMoreChainsClick={handleInlineMoreChainsQuote}
                  selectedChainFilter={selectedChainFilterChainId}
                />
              )
            ) : (
              <>
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
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
                    {quoteUsd}
                  </span>
                  {hasAmount && (
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={isPlacingOrder}
                      className="flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase cursor-pointer disabled:opacity-40 transition-colors text-(--widget-muted-foreground) hover:bg-(--widget-secondary)"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── RECIPIENT FORM ── */}
      {!isShowingTxStatus && (
        <div
          className="flex flex-row items-center w-full overflow-hidden px-4"
          style={{
            borderTop: isRecipientInputOpen ? '1px solid var(--widget-border)' : 'none',
            maxHeight: isRecipientInputOpen ? '60px' : '0px',
            opacity: isRecipientInputOpen ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.3s ease',
          }}
        >
          <RecipientForm />
        </div>
      )}

      {/* ── QUOTE LIST (shown pre-connect too; quotes requote on connect) ── */}
      {!isShowingTxStatus && baseAmount && baseAmount > 0 ? (
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

      {/* ── SWAP / CONNECT BUTTON ── */}
      <div className={`relative ${isShowingTxStatus ? 'px-4' : 'px-4'} py-4`}>
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
            className="w-full py-3 text-sm font-medium cursor-pointer transition-opacity hover:opacity-80"
            style={connectButtonStyle}
          >
            Connect Wallet
          </button>
        ) : (
          <button
            disabled
            className="w-full py-3 text-sm font-medium transition-colors disabled:opacity-40 cursor-not-allowed"
            style={connectButtonStyle}
          >
            {!userAddress ? 'Connect Wallet' : 'Enter Amount'}
          </button>
        )}
      </div>
    </div>
  );
};

export default AggregatorSwapFormHorizontal;
