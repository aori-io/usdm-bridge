'use client';

import { type Asset, type ReviewOrderStep, type SupportedChainId, NATIVE_ASSET_ADDRESS, useAori } from '../internal';
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
import AssetSelectionMenu from './AssetSelectionMenu';
import ChainSelectionMenu from './ChainSelectionMenu';
import QuoteLoader from './QuoteLoader';
import RecipientForm from './RecipientForm';
import { SwapIcon } from '../internal/icons/SwapIcon';
import { SwapButton } from './states/SwapButton';
import TxStatusDisplay from './states/TxStatusDisplay';

const NOOP = () => {};

interface ReviewActionProps {
  base: Asset;
  quote: Asset;
  baseAmount: number;
  quoteAmount: number;
  userAddress: string;
}

interface SwapFormHorizontalProps {
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapInitiated?: () => void;
  onBackToSwap?: () => void;
  onMoreChainsClick?: () => void;
  startPolling: (quoteId: string, metadata?: { baseToken?: Asset; quoteToken?: Asset }) => void;
  trackNativeTransaction: (txHash: string, description: string) => void;
}

const SwapFormHorizontal: React.FC<SwapFormHorizontalProps> = ({
  onSwapSubmitted,
  onSwapInitiated,
  onBackToSwap,
  onMoreChainsClick,
  startPolling,
  trackNativeTransaction,
}) => {
  const {
    web3ConnectionType,
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
  const {
    isRecipientInputOpen,
    txStatus,
    view,
    selectedChainFilterChainId,
  } = useWidgetSwapUIStore(
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

  // Inline selection (split assetMenuVariant): the respective column renders the menu
  const isSplitMenuMode = assetMenuVariant === 'split';
  const isBaseSelecting =
    isSplitMenuMode &&
    (view === 'baseSelection' || view === 'baseChainSelection');
  const isQuoteSelecting =
    isSplitMenuMode &&
    (view === 'quoteSelection' || view === 'quoteChainSelection');

  const handleInlineChainSelect = useCallback((chainId: SupportedChainId) => {
    const currentView = useWidgetSwapUIStore.getState().view;
    const side = currentView === 'baseChainSelection' ? 'base' : 'quote';
    useWidgetSwapUIStore.getState().setChainFilter({ chainId, side });
    useWidgetSwapUIStore.getState().pushRecentChain(chainId);
    useWidgetSwapUIStore
      .getState()
      .transitionToView(
        side === 'base' ? 'baseSelection' : 'quoteSelection',
        'chainSelection',
      );
  }, []);

  const handleInlineMoreChainsBase = useCallback(() => {
    useWidgetSwapUIStore
      .getState()
      .transitionToView('baseChainSelection', 'chainSelection');
  }, []);

  const handleInlineMoreChainsQuote = useCallback(() => {
    useWidgetSwapUIStore
      .getState()
      .transitionToView('quoteChainSelection', 'chainSelection');
  }, []);

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

  const connectButtonStyle: React.CSSProperties = {
    backgroundColor:
      swapButtonVariant === 'default' ? 'var(--widget-primary)' : 'transparent',
    color:
      swapButtonVariant === 'default'
        ? 'var(--widget-primary-foreground)'
        : 'var(--widget-primary)',
    border:
      swapButtonVariant !== 'default'
        ? '1px solid var(--widget-primary)'
        : 'none',
    borderRadius: 'var(--widget-radius)',
  };

  return (
    <div className="flex flex-col w-full">
      {/* ── TX STATUS or TWO-COLUMN TOKEN SECTIONS ─────────── */}
      {isShowingTxStatus &&
      trackedOrderHash &&
      baseToken &&
      quoteToken &&
      baseAmount &&
      quoteAmount ? (
        <div className="flex-1 min-h-0 overflow-hidden">
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
        <div
          className={`grid grid-cols-[1fr_auto_1fr] items-stretch px-4 ${isCompactMode ? 'pt-3 pb-1' : 'pt-4 pb-2'} gap-2`}
        >
          {/* BASE column */}
          <div
            className={`relative flex flex-col gap-1 p-3 rounded-lg overflow-hidden ${isBaseSelecting ? 'h-[380px]' : ''}`}
            style={{
              border: '1px solid var(--widget-border)',
              backgroundColor: 'var(--widget-card)',
            }}
          >
            {isBaseSelecting ? (
              view === 'baseChainSelection' ? (
                <ChainSelectionMenu
                  toggle={onBackToSwap ?? NOOP}
                  side="base"
                  onChainSelect={handleInlineChainSelect}
                />
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
                {isOverlayToken ? (
                  isCompactMode ? (
                    <div
                      className={`flex items-center gap-2 ${tokenBadgeOrientation === 'right' ? 'flex-row-reverse' : 'flex-row'}`}
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
                <div className="flex items-center justify-between">
                  <span
                    className="font-sans text-xs"
                    style={{ color: 'var(--widget-muted-foreground)' }}
                  >
                    {baseUsd}
                  </span>
                  {userAddress &&
                    baseBalanceNum !== null &&
                    baseBalanceNum > 0 && (
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
                <span
                  className="text-sm"
                  style={{ color: 'var(--widget-muted-foreground)' }}
                >
                  →
                </span>
              </div>
            )}
          </div>

          {/* QUOTE column */}
          <div
            className={`relative flex flex-col gap-1 p-3 rounded-lg overflow-hidden ${isQuoteSelecting ? 'h-[380px]' : ''}`}
            style={{
              border: '1px solid var(--widget-border)',
              backgroundColor: 'var(--widget-card)',
            }}
          >
            {isQuoteSelecting ? (
              view === 'quoteChainSelection' ? (
                <ChainSelectionMenu
                  toggle={onBackToSwap ?? NOOP}
                  side="quote"
                  onChainSelect={handleInlineChainSelect}
                />
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
                <div className="flex items-center justify-between">
                  <span
                    className="font-sans text-xs"
                    style={{ color: 'var(--widget-muted-foreground)' }}
                  >
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

      {/* ── RECIPIENT FORM ─────────────────────────────────── */}
      <div
        className="flex flex-row items-center w-full overflow-hidden px-4"
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

      {/* ── QUOTE LOADER ───────────────────────────────────── */}
      <div
        className="px-4"
        style={{
          borderTop: '1px solid var(--widget-border)',
          borderBottom: '1px solid var(--widget-border)',
        }}
      >
        <QuoteLoader />
      </div>

      {/* ── SWAP / CONNECT BUTTON ──────────────────────────── */}
      <div className={`relative ${isShowingTxStatus ? 'px-0' : 'px-4'} py-4`}>
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

export default SwapFormHorizontal;
