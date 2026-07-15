'use client';

import type { SupportedChainId } from '../internal/types';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useBalanceEventSubscription } from '../hooks/useBalanceEventListener';
import { useEnabledChainIds } from '../hooks/useEnabledChainIds';
import { useOrderStatusPolling } from '../hooks/useOrderStatusPolling';
import { useRelayChainRegistration } from '../hooks/useRelayChainRegistration';
import { getWidgetSdk } from '../internal';
import { useBulkBalances } from '../internal/queries/balances/hooks';
import { RfqProvider, useRfq } from '../providers/RfqProvider';
import { QuotesProvider } from '../providers/QuotesProvider';
import { useTransactionTracker } from '../wallet/useTransactionTracker';
import {
  SwapFormProvider,
  useSwapFormContext,
} from '../providers/SwapFormProvider';
import {
  type TransitionType,
  type WidgetView,
  useWidgetSwapUIStore,
} from '../stores/swapUIStore';
import { useWalletState } from '../wallet/useWalletState';
import SwapForm from './SwapForm';
import { SwapFormSkeleton } from './SwapFormSkeleton';
import SwapHeader from './SwapHeader';

const AssetSelectionMenu = lazy(() => import('./AssetSelectionMenu'));
const ChainSelectionMenu = lazy(() => import('./ChainSelectionMenu'));
const SwapFormHorizontal = lazy(() => import('./SwapFormHorizontal'));
const SwapFormSplit = lazy(() => import('./SwapFormSplit'));
const AggregatorSwapForm = lazy(() => import('./quotes/AggregatorSwapForm'));
const AggregatorSwapFormHorizontal = lazy(() => import('./quotes/AggregatorSwapFormHorizontal'));
const WidgetWalletPanel = lazy(() => import('./WidgetWalletPanel').then(m => ({ default: m.WidgetWalletPanel })));
const WalletPlaceholderPanel = lazy(() => import('./WalletPlaceholderPanel').then(m => ({ default: m.WalletPlaceholderPanel })));
const WidgetWalletTradeHistory = lazy(() => import('./wallet/WidgetWalletTradeHistory').then(m => ({ default: m.WidgetWalletTradeHistory })));

interface SwapContainerProps {
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapComplete?: (data: import('../lib/parseExplorerHash').SwapCompleteData) => void;
  defaultBaseToken?: { chainId: number; address: string };
  defaultQuoteToken?: { chainId: number; address: string };
  onBaseTokenChange?: (token: import('../internal/types').Asset) => void;
  onQuoteTokenChange?: (token: import('../internal/types').Asset) => void;
  // Passed from SwapWidget when isSplitSideBySide — each card renders its own styling
  cardStyles?: React.CSSProperties;
  cardWidth?: string;
}

const SwapContainerInner: React.FC<SwapContainerProps> = ({
  onSwapSubmitted,
  onSwapComplete,
  cardStyles,
  cardWidth,
}) => {
  const {
    baseToken,
    quoteToken,
    baseAmount,
    quoteAmount,
    baseBalance,
    isWrappingPair,
    isUnwrappingPair,
    isRegistryLoading,
  } = useSwapFormContext();
  const { liquidityError, routingError, sizeCapError, stop, clear } = useRfq();

  const hasInsufficientBalance = !!(
    baseAmount &&
    baseBalance.formatted &&
    parseFloat(baseBalance.formatted) < baseAmount
  );

  const view = useWidgetSwapUIStore((state) => state.view);
  const {
    isTransitioning,
    isRecipientInputOpen,
    recipient,
    selectedChainFilterChainId,
  } = useWidgetSwapUIStore(
    useShallow((state) => ({
      isTransitioning: state.isTransitioning,
      isRecipientInputOpen: state.isRecipientInputOpen,
      recipient: state.recipient,
      selectedChainFilterChainId: state.selectedChainFilter?.chainId ?? null,
    })),
  );

  const enterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [exitingOverlay, setExitingOverlay] = useState<WidgetView | null>(null);

  const { address: userAddress } = useWalletState();
  useRelayChainRegistration();
  const availableChainIds = useEnabledChainIds();
  useBulkBalances(userAddress, availableChainIds);

  useBalanceEventSubscription();

  const { trackOrderTransaction, trackNativeTransaction } = useTransactionTracker();

  const baseTokenRef = useRef(baseToken);
  const quoteTokenRef = useRef(quoteToken);
  const onSwapCompleteRef = useRef(onSwapComplete);
  useEffect(() => { baseTokenRef.current = baseToken; }, [baseToken]);
  useEffect(() => { quoteTokenRef.current = quoteToken; }, [quoteToken]);
  useEffect(() => { onSwapCompleteRef.current = onSwapComplete; }, [onSwapComplete]);

  const { startPolling } = useOrderStatusPolling((orderHash, status) => {
    useWidgetSwapUIStore.getState().setTxStatus(status);
    const explorerUrl = `https://aoriscan.io/order/${orderHash}`;
    useWidgetSwapUIStore.getState().setExplorerUrl(explorerUrl);
    if (status === 'completed') {
      const base = baseTokenRef.current;
      const quote = quoteTokenRef.current;
      trackOrderTransaction(orderHash, `Swap ${base?.symbol ?? '?'} → ${quote?.symbol ?? '?'}`);
      getWidgetSdk()
        .getOrderDetails(orderHash)
        .then((details) =>
          onSwapCompleteRef.current?.({
            quoteId: orderHash,
            aoriOrderHash: orderHash,
            explorerUrl,
            // Aori's OrderDetails is the same runtime payload the widget's
            // AoriOrderDetails describes (passed straight through to consumers).
            details: details as unknown as import('../lib/parseExplorerHash').AoriOrderDetails,
          }),
        )
        .catch(() => {});
    }
  });

  useEffect(() => {
    return () => {
      if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    useWidgetSwapUIStore.getState().resetUI();
  }, []);

  useEffect(() => {
    if (!isTransitioning) return;

    enterTimeoutRef.current = setTimeout(() => {
      useWidgetSwapUIStore.getState().setIsTransitioning(false);
      enterTimeoutRef.current = null;
    }, 20);

    return () => {
      if (enterTimeoutRef.current) {
        clearTimeout(enterTimeoutRef.current);
        enterTimeoutRef.current = null;
      }
    };
  }, [isTransitioning]);

  const transitionToView = useCallback(
    (newView: WidgetView, type: TransitionType = 'navigation') => {
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = null;
        setExitingOverlay(null);
      }

      const currentView = useWidgetSwapUIStore.getState().view;
      if (currentView !== 'swap' && newView !== 'swap') {
        useWidgetSwapUIStore.getState().setView(newView);
        useWidgetSwapUIStore.getState().setIsTransitioning(false);
      } else {
        useWidgetSwapUIStore.getState().transitionToView(newView, type);
      }
    },
    [],
  );

  const handleBackToSwap = useCallback(() => {
    if (enterTimeoutRef.current) {
      clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }

    const currentView = useWidgetSwapUIStore.getState().view;
    setExitingOverlay(currentView);

    useWidgetSwapUIStore.getState().setChainFilter(null);
    useWidgetSwapUIStore.getState().setView('swap');
    useWidgetSwapUIStore.getState().setIsTransitioning(false);
    useWidgetSwapUIStore.getState().resetAssetSelection();

    exitTimeoutRef.current = setTimeout(() => {
      setExitingOverlay(null);
      exitTimeoutRef.current = null;
    }, 200);
  }, []);

  const handleChainFilterSelect = useCallback(
    (chainId: SupportedChainId) => {
      const previousView = view;
      const side = previousView === 'baseChainSelection' ? 'base' : 'quote';
      useWidgetSwapUIStore.getState().setChainFilter({ chainId, side });
      useWidgetSwapUIStore.getState().pushRecentChain(chainId);
      transitionToView(
        side === 'base' ? 'baseSelection' : 'quoteSelection',
        'chainSelection',
      );
    },
    [view, transitionToView],
  );

  const handleMoreChainsClick = useCallback(() => {
    const currentView = useWidgetSwapUIStore.getState().view;
    if (currentView === 'baseSelection') {
      transitionToView('baseChainSelection', 'chainSelection');
    } else if (currentView === 'quoteSelection') {
      transitionToView('quoteChainSelection', 'chainSelection');
    }
  }, [transitionToView]);

  // Called by ReviewActionSignAndSubmitOrderRow after a swap is submitted.
  // Stops and fully clears the RFQ so no stale quote lingers post-submission.
  const handleSwapInitiated = useCallback(() => {
    stop();
    clear();
  }, [stop, clear]);

  const isSameChain =
    baseToken && quoteToken ? baseToken.chainId === quoteToken.chainId : true;

  const getHeaderText = () => {
    switch (view) {
      case 'wallet':
        return 'Wallet';
      case 'baseSelection':
        return 'Select Input Token';
      case 'quoteSelection':
        return 'Select Output Token';
      case 'baseChainSelection':
      case 'quoteChainSelection':
        return 'Select Chain';
      default:
        return 'Swap';
    }
  };

  const { assetMenuVariant, widgetType, customWalletUI, aggregatorEnabled } = useWidgetConfig();

  const isTokenSelection =
    view === 'baseSelection' || view === 'quoteSelection';
  const isChainSelection =
    view === 'baseChainSelection' || view === 'quoteChainSelection';

  const isSideBySide =
    assetMenuVariant === 'split' &&
    (widgetType === 'default' || widgetType === 'compact');
  const isInlineMenu =
    assetMenuVariant === 'split' &&
    (widgetType === 'horizontal' || widgetType === 'split');

  const isPanelMode = assetMenuVariant === 'default';
  const showSwapForm =
    view === 'swap' ||
    isTokenSelection ||
    isChainSelection ||
    view === 'wallet' ||
    view === 'activity';

  const isTokenSelectionExiting =
    exitingOverlay === 'baseSelection' || exitingOverlay === 'quoteSelection';
  const isChainSelectionExiting =
    exitingOverlay === 'baseChainSelection' ||
    exitingOverlay === 'quoteChainSelection';

  const showTokenOverlay = isTokenSelection || isTokenSelectionExiting;
  const showChainOverlay = isChainSelection || isChainSelectionExiting;

  const isTokenOverlayActive = isTokenSelection && !isTransitioning;
  const isChainOverlayActive = isChainSelection && !isTransitioning;

  const effectiveTokenView = isTokenSelection ? view : exitingOverlay;
  const menuSide = effectiveTokenView === 'baseSelection' ? 'base' : 'quote';
  const menuOtherAsset =
    effectiveTokenView === 'baseSelection' ? quoteToken : baseToken;

  const effectiveChainView = isChainSelection ? view : exitingOverlay;
  const chainMenuSide =
    effectiveChainView === 'baseChainSelection' ? 'base' : 'quote';

  const overlayStyle = (isActive: boolean): React.CSSProperties => ({
    backgroundColor: 'var(--widget-background)',
    opacity: isActive ? 1 : 0,
    transform: isActive ? 'translateY(0)' : 'translateY(6px)',
    transition: 'opacity 200ms ease-in-out, transform 200ms ease-in-out',
  });

  const hasActiveOverlay =
    isPanelMode &&
    (isTokenSelection ||
      isChainSelection ||
      view === 'wallet' ||
      view === 'activity' ||
      exitingOverlay != null);

  const formContent = isRegistryLoading ? (
    <SwapFormSkeleton />
  ) : aggregatorEnabled ? (
    widgetType === 'horizontal' || widgetType === 'split' ? (
      <Suspense fallback={<SwapFormSkeleton />}>
        <AggregatorSwapFormHorizontal
          onSwapSubmitted={onSwapSubmitted}
          onSwapComplete={onSwapComplete}
          onSwapInitiated={handleSwapInitiated}
          onBackToSwap={isInlineMenu ? handleBackToSwap : undefined}
        />
      </Suspense>
    ) : (
      <Suspense fallback={<SwapFormSkeleton />}>
        <AggregatorSwapForm
          onSwapSubmitted={onSwapSubmitted}
          onSwapComplete={onSwapComplete}
          onSwapInitiated={handleSwapInitiated}
        />
      </Suspense>
    )
  ) : widgetType === 'horizontal' ? (
    <Suspense fallback={<SwapFormSkeleton />}>
      <SwapFormHorizontal
        onSwapSubmitted={onSwapSubmitted}
        onSwapInitiated={handleSwapInitiated}
        onBackToSwap={isInlineMenu ? handleBackToSwap : undefined}
        onMoreChainsClick={isInlineMenu ? handleMoreChainsClick : undefined}
        startPolling={startPolling}
        trackNativeTransaction={trackNativeTransaction}
      />
    </Suspense>
  ) : widgetType === 'split' ? (
    <Suspense fallback={<SwapFormSkeleton />}>
      <SwapFormSplit
        onSwapSubmitted={onSwapSubmitted}
        onSwapInitiated={handleSwapInitiated}
        onBackToSwap={isInlineMenu ? handleBackToSwap : undefined}
        onMoreChainsClick={isInlineMenu ? handleMoreChainsClick : undefined}
        startPolling={startPolling}
        trackNativeTransaction={trackNativeTransaction}
      />
    </Suspense>
  ) : (
    <SwapForm onSwapSubmitted={onSwapSubmitted} onSwapInitiated={handleSwapInitiated} startPolling={startPolling} trackNativeTransaction={trackNativeTransaction} />
  );

  // When isSideBySide, cardStyles/cardWidth are passed from SwapWidget.
  // Each card renders its own border/bg/radius; the outer widget div is transparent.
  const cs = cardStyles ?? {};

  // Measure the left (form) card height so the right (selection) card matches exactly.
  const leftCardRef = useRef<HTMLDivElement>(null);
  const [leftCardHeight, setLeftCardHeight] = useState<number>(420);

  useEffect(() => {
    if (!isSideBySide) return;
    const el = leftCardRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLeftCardHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isSideBySide]);

  if (isSideBySide) {
    return (
      <>
        {/* ── Left card: the swap form ─────────────────── */}
        <div
          ref={leftCardRef}
          className="flex flex-col w-full overflow-hidden transition-colors duration-300"
          style={{
            flex: '1 1 0',
            minWidth: 0,
            ...cs,
          }}
        >
          <SwapHeader
            headerText="Swap"
            onBackClick={handleBackToSwap}
            isSameChain={isSameChain}
            isWrappingPair={isWrappingPair}
            isUnwrappingPair={isUnwrappingPair}
            hasLowLiquidity={liquidityError}
            hasInsufficientLiquidity={liquidityError}
            hasRoutingError={routingError}
            hasSizeCapError={sizeCapError}
            hasInsufficientBalance={hasInsufficientBalance}
          />
          <div className="overflow-hidden">{formContent}</div>
        </div>

        {/* ── Right card: selection panel, height explicitly matched to the form card ─── */}
        {(showTokenOverlay || showChainOverlay) && (
          <div
            className="flex flex-col overflow-hidden shrink-0"
            style={{
              width: cardWidth,
              height: `${leftCardHeight}px`,
              ...cs,
              ...(overlayStyle(
                (isTokenSelection || isChainSelection) && !isTransitioning,
              )),
            }}
          >
            {(isTokenSelection || isTokenSelectionExiting) ? (
            <Suspense fallback={null}>
              <AssetSelectionMenu
                toggle={handleBackToSwap}
                side={menuSide}
                otherAsset={menuOtherAsset}
                onMoreChainsClick={handleMoreChainsClick}
                selectedChainFilter={selectedChainFilterChainId}
              />
            </Suspense>
            ) : (
            <Suspense fallback={null}>
              <ChainSelectionMenu
                toggle={handleBackToSwap}
                side={chainMenuSide}
                onChainSelect={handleChainFilterSelect}
              />
            </Suspense>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="flex flex-col w-full"
      style={{
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <SwapHeader
        headerText={getHeaderText()}
        onBackClick={handleBackToSwap}
        isSameChain={isSameChain}
        isWrappingPair={isWrappingPair}
        isUnwrappingPair={isUnwrappingPair}
        hasLowLiquidity={liquidityError}
        hasInsufficientLiquidity={liquidityError}
        hasRoutingError={routingError}
        hasSizeCapError={sizeCapError}
        hasInsufficientBalance={hasInsufficientBalance}
      />

      <div className="relative overflow-hidden">
        {showSwapForm && (
          <div
            className="overflow-hidden"
            style={hasActiveOverlay ? { pointerEvents: 'none' } : undefined}
          >
            {formContent}
          </div>
        )}

        {(view === 'wallet' || exitingOverlay === 'wallet') && (
          <div
            className="absolute inset-0 overflow-hidden z-20"
            style={overlayStyle(view === 'wallet' && !isTransitioning)}
          >
            <Suspense fallback={null}>
              {customWalletUI === 'none' ? <WalletPlaceholderPanel /> : <WidgetWalletPanel />}
            </Suspense>
          </div>
        )}

        {(view === 'activity' || exitingOverlay === 'activity') && (
          <div
            className="absolute inset-0 overflow-y-auto z-20"
            style={overlayStyle(view === 'activity' && !isTransitioning)}
          >
            <Suspense fallback={null}>
              <WidgetWalletTradeHistory isActive={view === 'activity'} />
            </Suspense>
          </div>
        )}

        {isPanelMode && showTokenOverlay && (
          <div
            className="absolute inset-0 overflow-hidden z-20"
            style={overlayStyle(isTokenOverlayActive)}
          >
            <Suspense fallback={null}>
              <AssetSelectionMenu
                toggle={handleBackToSwap}
                side={menuSide}
                otherAsset={menuOtherAsset}
                onMoreChainsClick={handleMoreChainsClick}
                selectedChainFilter={selectedChainFilterChainId}
              />
            </Suspense>
          </div>
        )}

        {isPanelMode && showChainOverlay && (
          <div
            className="absolute inset-0 overflow-hidden z-20"
            style={overlayStyle(isChainOverlayActive)}
          >
            <Suspense fallback={null}>
              <ChainSelectionMenu
                toggle={handleBackToSwap}
                side={chainMenuSide}
                onChainSelect={handleChainFilterSelect}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
};

export const SwapContainer: React.FC<SwapContainerProps> = ({
  onSwapSubmitted,
  onSwapComplete,
  defaultBaseToken,
  defaultQuoteToken,
  onBaseTokenChange,
  onQuoteTokenChange,
  cardStyles,
  cardWidth,
}) => {
  const recipient = useWidgetSwapUIStore((s) => s.recipient);
  const { aggregatorEnabled } = useWidgetConfig();

  const inner = (
    <SwapContainerInner
      onSwapSubmitted={onSwapSubmitted}
      onSwapComplete={onSwapComplete}
      cardStyles={cardStyles}
      cardWidth={cardWidth}
    />
  );

  return (
    <SwapFormProvider
      defaultBaseToken={defaultBaseToken}
      defaultQuoteToken={defaultQuoteToken}
      onBaseTokenChange={onBaseTokenChange}
      onQuoteTokenChange={onQuoteTokenChange}
    >
      {/* RfqProvider stays mounted for header state + the classic Aori path.
          QuotesProvider is layered on only when aggregator mode is active. */}
      <RfqProvider recipient={recipient}>
        {aggregatorEnabled ? <QuotesProvider recipient={recipient}>{inner}</QuotesProvider> : inner}
      </RfqProvider>
    </SwapFormProvider>
  );
};
