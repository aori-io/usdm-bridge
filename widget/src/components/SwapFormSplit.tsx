'use client';

import { type Asset, type SupportedChainId, type ReviewOrderStep, ThreeDots, TokenImage, NATIVE_ASSET_ADDRESS, useAori } from '../internal';
import { useAllowance } from '../queries/useAllowance';
import { useWalletModal } from '../wallet/WalletModalContext';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useEffectiveTokenConfig } from '../hooks/useEffectiveTokenConfig';
import { estimateGasBuffer } from '../lib/estimateGasBuffer';
import { useRfq } from '../providers/RfqProvider';
import { useSwapFormContext } from '../providers/SwapFormProvider';

import { useWidgetSwapUIStore } from '../stores/swapUIStore';
import { useWalletState } from '../wallet/useWalletState';
import { useWalletScreening } from '../context/WalletScreeningContext';
import { WalletBlockedBanner } from './WalletBlockedBanner';
import { useShallow } from 'zustand/react/shallow';
import AssetAmountInput from './AssetAmountInput';
import AssetSelection from './AssetSelection';
import AssetSelectionMenu from './AssetSelectionMenu';
import ChainSelectionMenu from './ChainSelectionMenu';
import RecipientForm from './RecipientForm';
import { SwapIcon } from '../internal/icons/SwapIcon';
import TxStatusDisplay from './states/TxStatusDisplay';
import { SwapButton } from './states/SwapButton';

const NOOP = () => {};

interface ReviewActionProps {
  base: Asset;
  quote: Asset;
  baseAmount: number;
  quoteAmount: number;
  userAddress: string;
}

interface SwapFormSplitProps {
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapInitiated?: () => void;
  onBackToSwap?: () => void;
  onMoreChainsClick?: () => void;
  startPolling: (quoteId: string, metadata?: { baseToken?: Asset; quoteToken?: Asset }) => void;
  trackNativeTransaction: (txHash: string, description: string) => void;
}

const SwapFormSplit: React.FC<SwapFormSplitProps> = ({ onSwapSubmitted, onSwapInitiated, onBackToSwap, onMoreChainsClick, startPolling, trackNativeTransaction }) => {
  const { web3ConnectionType, hasConnectHandler, lockBase, lockQuote, disableInverting, swapButtonVariant, tokenDisplay, tokenBadgeOrientation, widgetType, assetMenuVariant } = useWidgetConfig();
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
    isQuoteGasToken,
    isWrappingPair,
    isUnwrappingPair,
    baseBalance,
    setBaseAmount,
    setQuoteAmount,
    swapTokens,
    clearForm,
  } = useSwapFormContext();

  const {
    rfqQuote,
    handleInputChange,
    ensureForParams,
    clear,
    refresh,
    liquidityError,
    routingError,
  } = useRfq();
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
  const isHandlingStaleRestart = useRef(false);
  const isPlacingOrder = isWalletBlocked;

  const aori = useAori();
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
    if (!isWrappingPair && !isUnwrappingPair && !isBaseTrueNative && currentAllowance === null) {
      return null;
    }
    return { base: baseToken, quote: quoteToken, baseAmount, quoteAmount, userAddress };
  }, [baseToken, quoteToken, baseAmount, quoteAmount, userAddress, baseBalance.formatted, isWrappingPair, isUnwrappingPair, isBaseTrueNative, currentAllowance]);

  const onOrderSubmitted = useCallback((orderHash: string) => {
    setTrackedOrderHash(orderHash);
    useWidgetSwapUIStore.getState().startTracking(orderHash);
  }, []);

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
  }, [reviewState, baseAmount, baseToken, quoteToken, isWrappingPair, isUnwrappingPair, handleInputChange, setQuoteAmount]);

  const exchangeRate =
    baseAmount && quoteAmount && parseFloat(quoteAmount.toString())
      ? parseFloat(baseAmount.toString()) / parseFloat(quoteAmount.toString())
      : 0;

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
  }, [baseBalance.formatted, baseBalance.raw, baseToken, quoteToken, userAddress, isBaseGasToken, isWrappingPair, isUnwrappingPair, setBaseAmount, setQuoteAmount, clear, ensureForParams]);

  const handleClear = useCallback(() => {
    clear();
    clearForm();
  }, [clear, clearForm]);

  const baseBalanceNum = baseBalance.formatted ? parseFloat(baseBalance.formatted) : null;
  const hasAmount = !!(baseAmount || quoteAmount);

  const base = baseToken;
  const quote = quoteToken;
  const baseUsd = base?.price && baseAmount ? `$${(base.price * baseAmount).toFixed(2)}` : '$0.00';
  const quoteUsd = quote?.price && quoteAmount ? `$${(quote.price * quoteAmount).toFixed(2)}` : '$0.00';
  const hasValidQuote = !!(base && quote && baseAmount && quoteAmount);
  const hasQuoteError = liquidityError || routingError;

  const isShowingTxStatus =
    reviewState === 'trackingTx' && !!trackedOrderHash && !!base && !!quote && !!baseAmount && !!quoteAmount;

  // Inline selection: right panel becomes AssetSelectionMenu when split assetMenuVariant
  const isSplitMenuMode = assetMenuVariant === 'split';
  const isSelecting = isSplitMenuMode && (
    view === 'baseSelection' || view === 'quoteSelection' ||
    view === 'baseChainSelection' || view === 'quoteChainSelection'
  );
  const menuSide = view === 'baseSelection' || view === 'baseChainSelection' ? 'base' : 'quote';
  const menuOtherAsset = menuSide === 'base' ? quote : base;

  // Measure left column height so the right panel (selection menu) matches exactly.
  const leftColRef = useRef<HTMLDivElement>(null);
  const [leftColHeight, setLeftColHeight] = useState<number>(380);

  useEffect(() => {
    if (!isSplitMenuMode) return;
    const el = leftColRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLeftColHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isSplitMenuMode]);

  const handleInlineChainSelect = useCallback((chainId: SupportedChainId) => {
    const currentView = useWidgetSwapUIStore.getState().view;
    const side = currentView === 'baseChainSelection' ? 'base' : 'quote';
    useWidgetSwapUIStore.getState().setChainFilter({ chainId, side });
    useWidgetSwapUIStore.getState().pushRecentChain(chainId);
    useWidgetSwapUIStore.getState().transitionToView(
      side === 'base' ? 'baseSelection' : 'quoteSelection',
      'chainSelection',
    );
  }, []);

  const handleInlineMoreChains = useCallback(() => {
    const currentView = useWidgetSwapUIStore.getState().view;
    if (currentView === 'baseSelection') {
      useWidgetSwapUIStore.getState().transitionToView('baseChainSelection', 'chainSelection');
    } else if (currentView === 'quoteSelection') {
      useWidgetSwapUIStore.getState().transitionToView('quoteChainSelection', 'chainSelection');
    }
  }, []);

  const connectButtonStyle: React.CSSProperties = {
    backgroundColor: swapButtonVariant === 'default' ? 'var(--widget-primary)' : 'transparent',
    color: swapButtonVariant === 'default' ? 'var(--widget-primary-foreground)' : 'var(--widget-primary)',
    border: swapButtonVariant !== 'default' ? '1px solid var(--widget-primary)' : 'none',
    borderRadius: 'var(--widget-radius)',
  };

  return (
    <div className="flex flex-row w-full">
      {/* ── LEFT: Swap Form (or TxStatus during tracking) ──── */}
      <div
        ref={leftColRef}
        className="flex flex-col flex-1 min-w-0"
        style={{ borderRight: '1px solid var(--widget-border)' }}
      >
        {isShowingTxStatus && trackedOrderHash && base && quote && baseAmount && quoteAmount ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <TxStatusDisplay
              orderHash={trackedOrderHash}
              base={base}
              quote={quote}
              baseAmount={baseAmount}
              quoteAmount={quoteAmount}
              status={txStatus}
            />
          </div>
        ) : (
        <>
        {/* BASE TOKEN SECTION */}
        <div
          className={`relative ${isCompactMode ? 'px-4 pt-3 pb-1' : 'px-4 pt-4 pb-2'}`}
          style={{ borderBottom: '1px solid var(--widget-border)' }}
        >
          {isOverlayToken ? (
            isCompactMode ? (
              <div className={`flex items-center gap-2 ${tokenBadgeOrientation === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                <AssetSelection toggle={handleToggleBaseSelection} side="base" asset={base} isPlacingOrder={isPlacingOrder || lockBase || isBaseLocked} hideDropdown={isBaseLocked} />
                <div className="flex-1 min-w-0">
                  <AssetAmountInput side="base" asset={base ?? null} otherAsset={quote ?? null} isPlacingOrder={isPlacingOrder} isWrappingPair={isWrappingPair} isUnwrappingPair={isUnwrappingPair} />
                </div>
              </div>
            ) : (
              <div className={`flex flex-col ${tokenBadgeOrientation === 'right' ? 'items-end' : 'items-start'}`}>
                <AssetSelection toggle={handleToggleBaseSelection} side="base" asset={base} isPlacingOrder={isPlacingOrder || lockBase || isBaseLocked} hideDropdown={isBaseLocked} />
                <AssetAmountInput side="base" asset={base ?? null} otherAsset={quote ?? null} isPlacingOrder={isPlacingOrder} isWrappingPair={isWrappingPair} isUnwrappingPair={isUnwrappingPair} />
              </div>
            )
          ) : (
            <>
              <AssetSelection toggle={handleToggleBaseSelection} side="base" asset={base} isPlacingOrder={isPlacingOrder || lockBase || isBaseLocked} hideDropdown={isBaseLocked} />
              <AssetAmountInput side="base" asset={base ?? null} otherAsset={quote ?? null} isPlacingOrder={isPlacingOrder} isWrappingPair={isWrappingPair} isUnwrappingPair={isUnwrappingPair} />
            </>
          )}
          <div className="mb-1 flex w-full flex-row items-center justify-between">
            <p className="font-sans text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>{baseUsd}</p>
            {userAddress && baseBalanceNum !== null && baseBalanceNum > 0 && (
              <button
                type="button"
                onClick={handleMax}
                disabled={isPlacingOrder}
                className="absolute bottom-3 right-4 flex items-center rounded-full px-3 py-0.5 text-xs font-medium uppercase cursor-pointer disabled:opacity-40 bg-(--widget-primary) text-(--widget-primary-foreground) hover:bg-(--widget-foreground) hover:text-(--widget-card) transition-colors"
              >
                Max
              </button>
            )}
          </div>
        </div>

        {/* INVERT BUTTON */}
        {!disableInverting && (
          <div className="flex justify-center -my-4 relative z-10">
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
          </div>
        )}

        {/* QUOTE TOKEN SECTION */}
        <div className={`relative ${isCompactMode ? 'px-4 pt-4 pb-1' : 'px-4 pt-6 pb-2'}`}>
          {isOverlayToken ? (
            isCompactMode ? (
              <div className={`flex items-center gap-2 ${tokenBadgeOrientation === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                <AssetSelection toggle={handleToggleQuoteSelection} side="quote" asset={quote} isPlacingOrder={isPlacingOrder || lockQuote || isQuoteLocked} hideDropdown={isQuoteLocked} />
                <div className="flex-1 min-w-0">
                  <AssetAmountInput side="quote" asset={quote ?? null} otherAsset={base ?? null} isPlacingOrder={isPlacingOrder} isWrappingPair={isWrappingPair} isUnwrappingPair={isUnwrappingPair} />
                </div>
              </div>
            ) : (
              <div className={`flex flex-col ${tokenBadgeOrientation === 'right' ? 'items-end' : 'items-start'}`}>
                <AssetSelection toggle={handleToggleQuoteSelection} side="quote" asset={quote} isPlacingOrder={isPlacingOrder || lockQuote || isQuoteLocked} hideDropdown={isQuoteLocked} />
                <AssetAmountInput side="quote" asset={quote ?? null} otherAsset={base ?? null} isPlacingOrder={isPlacingOrder} isWrappingPair={isWrappingPair} isUnwrappingPair={isUnwrappingPair} />
              </div>
            )
          ) : (
            <>
              <AssetSelection toggle={handleToggleQuoteSelection} side="quote" asset={quote} isPlacingOrder={isPlacingOrder || lockQuote || isQuoteLocked} hideDropdown={isQuoteLocked} />
              <AssetAmountInput side="quote" asset={quote ?? null} otherAsset={base ?? null} isPlacingOrder={isPlacingOrder} isWrappingPair={isWrappingPair} isUnwrappingPair={isUnwrappingPair} />
            </>
          )}
          <div className="flex w-full flex-row items-center justify-between">
            <p className="font-sans text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>{quoteUsd}</p>
            {hasAmount && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isPlacingOrder}
                className="absolute bottom-2 right-4 flex items-center rounded-full px-3 py-0.5 text-xs font-medium uppercase cursor-pointer disabled:opacity-40 text-(--widget-muted-foreground) hover:bg-(--widget-secondary) transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        </>
        )}

        {/* RECIPIENT FORM */}
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

        {/* SWAP BUTTON */}
        <div className={`relative ${isShowingTxStatus ? 'px-0' : 'px-4'} py-4`}>
          {userAddress && isWalletBlocked ? (
            <WalletBlockedBanner />
          ) : userAddress && base && quote && baseAmount && baseAmount > 0 ? (
            <SwapButton
              base={base}
              baseAmount={baseAmount}
              quote={quote}
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

      {/* ── RIGHT: Selection menu (when open) or Live Details Panel ──────────── */}
      <div
        className={`flex flex-col transition-all duration-300 ${isSelecting ? 'flex-1 min-w-0' : 'w-48 shrink-0'}`}
        style={{ backgroundColor: 'var(--widget-background)', ...(isSelecting ? { height: `${leftColHeight}px` } : {}) }}
      >
        {isSelecting ? (
          <div className="flex flex-col overflow-hidden p-2" style={{ height: '100%' }}>
            {view === 'baseChainSelection' || view === 'quoteChainSelection' ? (
              <ChainSelectionMenu
                toggle={onBackToSwap ?? NOOP}
                side={menuSide}
                onChainSelect={handleInlineChainSelect}
              />
            ) : (
              <AssetSelectionMenu
                toggle={onBackToSwap ?? NOOP}
                side={menuSide}
                otherAsset={menuOtherAsset}
                onMoreChainsClick={handleInlineMoreChains}
                selectedChainFilter={selectedChainFilterChainId}
              />
            )}
          </div>
        ) : (
        <div className="flex flex-col gap-3 px-4 py-4">
        <span
          className="text-2xs uppercase tracking-wider font-medium"
          style={{ color: 'var(--widget-muted-foreground)' }}
        >
          Quote Details
        </span>

        {hasValidQuote && base && quote ? (
          <>
            {/* Exchange rate */}
            <div className="flex flex-col gap-0.5">
              <span className="text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>Rate</span>
              <div className="flex items-center gap-1">
                <TokenImage asset={quote} size="3xs" noChain />
                <span className="font-sans text-xs uppercase">
                  1 {quote.symbol}
                </span>
              </div>
              <div className="flex items-center gap-1 pl-4">
                <span className="text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>= {exchangeRate.toFixed(6)}</span>
              </div>
              <div className="flex items-center gap-1 pl-4">
                <TokenImage asset={base} size="3xs" noChain />
                <span className="font-sans text-xs uppercase">{base.symbol}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2" style={{ borderTop: '1px solid var(--widget-border)', paddingTop: '0.5rem' }}>
              {/* USD value */}
              <div className="flex justify-between items-center">
                <span className="text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>USD Value</span>
                <span className="font-sans text-xs">
                  ${base.price ? (base.price * exchangeRate * parseFloat(quoteAmount!.toString())).toFixed(2) : '—'}
                </span>
              </div>

              {/* Order type */}
              <div className="flex justify-between items-center">
                <span className="text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>Order Type</span>
                <span className="text-2xs font-sans" style={{ color: 'var(--widget-foreground)' }}>RFQ</span>
              </div>

              {/* Fill guarantee */}
              <div className="flex justify-between items-center">
                <span className="text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>Fill</span>
                <span className="text-2xs" style={{ color: 'var(--widget-primary)' }}>Exact</span>
              </div>

              {/* Base chain */}
              {base.chainId !== quote.chainId && (
                <div className="flex justify-between items-center">
                  <span className="text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>Route</span>
                  <span className="text-2xs font-sans">Cross-chain</span>
                </div>
              )}
            </div>
          </>
        ) : hasQuoteError ? (
          <div className="flex flex-col gap-1">
            <ThreeDots className="h-6 w-6" style={{ color: 'var(--widget-destructive)' }} />
            <span className="text-2xs" style={{ color: 'var(--widget-destructive)' }}>Quote not found</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-3 rounded animate-pulse"
                style={{
                  backgroundColor: 'var(--widget-muted)',
                  width: i % 2 === 0 ? '80%' : '60%',
                  opacity: 0.5,
                }}
              />
            ))}
            <span className="text-2xs mt-1" style={{ color: 'var(--widget-muted-foreground)', opacity: 0.5 }}>
              Enter an amount
            </span>
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  );
};

export default SwapFormSplit;
