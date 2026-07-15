'use client';

import { useTextScramble } from '../internal/hooks/useTextScramble';
import { useWalletState } from '../wallet/useWalletState';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useWidgetSwapUIStore } from '../stores/swapUIStore';
import { useWalletScreening } from '../context/WalletScreeningContext';

interface SwapHeaderProps {
  headerText: string;
  onBackClick?: () => void;
  isSameChain?: boolean;
  isWrappingPair?: boolean;
  isUnwrappingPair?: boolean;
  hasLowLiquidity?: boolean;
  hasInsufficientLiquidity?: boolean;
  hasRoutingError?: boolean;
  hasSizeCapError?: boolean;
  hasInsufficientBalance?: boolean;
}

const TextScrambleDisplay = ({
  targetText,
  isError,
}: {
  targetText: string;
  isError: boolean;
}) => {
  const { displayText, suffix, characterColors } = useTextScramble(
    targetText,
    isError,
  );

  return (
    <>
      {displayText.split('').map((char, index) => (
        <span
          key={index}
          style={
            characterColors[index]
              ? { color: 'var(--widget-destructive)' }
              : undefined
          }
        >
          {char}
        </span>
      ))}
      <span
        style={{
          color: isError
            ? 'var(--widget-destructive)'
            : 'var(--widget-muted-foreground)',
          opacity: isError ? 0.5 : 1,
        }}
      >
        {suffix}
      </span>
    </>
  );
};

const SwapHeader: React.FC<SwapHeaderProps> = ({
  headerText,
  onBackClick,
  isSameChain,
  isWrappingPair,
  isUnwrappingPair,
  hasLowLiquidity,
  hasInsufficientLiquidity,
  hasRoutingError,
  hasSizeCapError,
  hasInsufficientBalance,
}) => {
  const view = useWidgetSwapUIStore((state) => state.view);

  const {
    isRecipientInputOpen,
    hasAllowanceError,
    hoveredChainName,
    isTrackingTx,
    txStatus,
    walletTab,
    swapError,
  } = useWidgetSwapUIStore(
    useShallow((state) => ({
      isRecipientInputOpen: state.isRecipientInputOpen,
      hasAllowanceError: state.hasAllowanceError,
      hoveredChainName: state.hoveredChainName,
      isTrackingTx: state.isTrackingTx,
      txStatus: state.txStatus,
      walletTab: state.walletTab,
      swapError: state.swapError,
    })),
  );

  // Auto-clear a transient swap error after a few seconds.
  useEffect(() => {
    if (!swapError) return;
    const t = setTimeout(() => useWidgetSwapUIStore.getState().setSwapError(null), 5000);
    return () => clearTimeout(t);
  }, [swapError]);

  const { swapHeaderVariant, walletButtonEnabled } = useWidgetConfig();
  const { isConnected } = useWalletState();
  const { isBlocked: isWalletBlocked } = useWalletScreening();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [isRecipientButtonHovered, setIsRecipientButtonHovered] =
    useState(false);
  const [isActivityButtonHovered, setIsActivityButtonHovered] =
    useState(false);

  const scrambleKey = `${view}-${isRecipientButtonHovered}-${isActivityButtonHovered}-${isRecipientInputOpen}-${hoveredChainName || 'none'}`;

  const getHeaderText = () => {
    if (isTrackingTx && txStatus) {
      switch (txStatus) {
        case 'pending':
          return 'Trade Pending';
        case 'received':
          return 'Trade Received';
        case 'completed':
          return 'Trade Filled';
        case 'failed':
          return 'Trade Failed';
        case 'cancelled':
          return 'Trade Cancelled';
        case 'expired':
          return 'Trade Expired';
        default:
          return 'Processing Trade';
      }
    }

    if (
      hoveredChainName &&
      (view === 'baseSelection' ||
        view === 'quoteSelection' ||
        view === 'baseChainSelection' ||
        view === 'quoteChainSelection')
    ) {
      return hoveredChainName;
    }

    if (view === 'swap' && isActivityButtonHovered) {
      return 'View Transaction History';
    }

    if (view === 'swap' && isRecipientButtonHovered) {
      return isRecipientInputOpen
        ? 'Remove Custom Recipient'
        : 'Add Custom Recipient';
    }

    switch (view) {
      case 'wallet':
        return 'Wallet';
      case 'activity':
        return 'Activity';
      case 'baseSelection':
        return 'Select Source Token';
      case 'quoteSelection':
        return 'Select Destination Token';
      case 'baseChainSelection':
        return 'Select Source Chain';
      case 'quoteChainSelection':
        return 'Select Destination Chain';
      default:
        if (view === 'swap') {
          if (swapError) return swapError;
          if (hasAllowanceError && !isWrappingPair && !isUnwrappingPair)
            return 'Allowance check failed';
          if (hasSizeCapError && !isWrappingPair && !isUnwrappingPair)
            return 'Size limit exceeded';
          if (hasInsufficientLiquidity && !isWrappingPair && !isUnwrappingPair)
            return 'Insufficient Liquidity';
          if (hasRoutingError && !isWrappingPair && !isUnwrappingPair)
            return 'Route Not Found';
          if (hasLowLiquidity && !isWrappingPair && !isUnwrappingPair)
            return 'High Price Impact';
          if (hasInsufficientBalance && !isWrappingPair && !isUnwrappingPair)
            return 'Insufficient Balance';
        }
        if (isSameChain && !isWrappingPair && !isUnwrappingPair) return 'Swap';
        if (isWrappingPair) return 'Wrap';
        if (isUnwrappingPair) return 'Unwrap';
        return headerText;
    }
  };

  const targetHeaderText = getHeaderText();

  const isErrorMessage =
    !isTrackingTx &&
    view === 'swap' &&
    !isRecipientButtonHovered &&
    (!!swapError ||
      (hasAllowanceError && !isWrappingPair && !isUnwrappingPair) ||
      (hasSizeCapError && !isWrappingPair && !isUnwrappingPair) ||
      (hasInsufficientLiquidity && !isWrappingPair && !isUnwrappingPair) ||
      (hasRoutingError && !isWrappingPair && !isUnwrappingPair) ||
      (hasLowLiquidity && !isWrappingPair && !isUnwrappingPair) ||
      (hasInsufficientBalance && !isWrappingPair && !isUnwrappingPair));

  const statusVarMap: Record<string, string> = {
    pending: 'var(--widget-primary)',
    received: 'var(--widget-primary)',
    completed: 'var(--widget-status-completed)',
    failed: 'var(--widget-status-failed)',
    cancelled: 'var(--widget-status-failed)',
    expired: 'var(--widget-status-failed)',
  };

  const getHeaderTextColor = () => {
    if (!isTrackingTx || !txStatus) return null;
    return statusVarMap[txStatus] ?? null;
  };

  const renderRightComponent = () => {
    if (isTrackingTx) {
      return (
        <button
          onClick={() => {
            const { exitHandler, stopTracking } = useWidgetSwapUIStore.getState();
            // Fall back to stopTracking when the SwapButton (which owns the
            // exit handler) has unmounted — prevents a stuck "Trade Filled"
            // header with no way to dismiss it.
            if (exitHandler) exitHandler();
            else stopTracking();
          }}
          aria-label="Close trade status"
          className="size-4 -translate-y-0.5 flex cursor-pointer items-center justify-center transition-colors text-(--widget-muted-foreground) opacity-60 hover:text-(--widget-foreground) hover:opacity-100"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      );
    }

    if (view === 'swap') {
      return (
        <div className="flex items-center gap-2">
          {walletButtonEnabled && mounted && isConnected && (
            <button
              onClick={() => useWidgetSwapUIStore.getState().setView('activity')}
              onMouseEnter={() => setIsActivityButtonHovered(true)}
              onMouseLeave={() => setIsActivityButtonHovered(false)}
              disabled={isWalletBlocked}
              aria-label="Open activity"
              className={`size-4 -translate-y-0.5 flex items-center justify-center rounded-full transition-colors text-(--widget-muted-foreground) ${isWalletBlocked ? 'opacity-20 cursor-not-allowed pointer-events-none' : 'opacity-60 cursor-pointer hover:text-(--widget-foreground) hover:opacity-100'}`}
            >
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 8V12L14.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3.05 11A9 9 0 1 1 3.05 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M1 7.5L3.05 11L6.5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            onClick={() =>
              useWidgetSwapUIStore.getState().toggleRecipientInput()
            }
            onMouseEnter={() => setIsRecipientButtonHovered(true)}
            onMouseLeave={() => setIsRecipientButtonHovered(false)}
            disabled={isWalletBlocked}
            aria-label={
              isRecipientInputOpen
                ? 'Remove custom recipient'
                : 'Add custom recipient'
            }
            className={`size-4 -translate-y-0.5 flex items-center justify-center rounded-full transition-colors ${
              isWalletBlocked
                ? 'opacity-20 cursor-not-allowed pointer-events-none text-(--widget-muted-foreground)'
                : isRecipientInputOpen
                  ? 'cursor-pointer text-(--widget-destructive) opacity-80 hover:text-(--widget-foreground) hover:opacity-100'
                  : 'cursor-pointer text-(--widget-muted-foreground) opacity-60 hover:text-(--widget-foreground) hover:opacity-100'
            }`}
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 7.75C1.58579 7.75 1.25 8.08579 1.25 8.5C1.25 8.91421 1.58579 9.25 2 9.25V7.75ZM2 8.5V9.25H13.5V8.5V7.75H2V8.5Z"
                fill="currentColor"
              />
              <path
                d="M6 16.5H8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeMiterlimit="10"
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
              <path
                d="M10.5 16.5H14.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeMiterlimit="10"
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
              <path
                d="M22 12.03V16.11C22 20.5 22 20.5 17.56 20.5H6.44C2 20.5 2 20.5 2 16.11V7.89C2 3.5 2 3.5 6.44 3.5H13.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="miter"
              />
              <g
                style={{
                  transform: `rotate(${isRecipientInputOpen ? '45deg' : '0deg'})`,
                  transformOrigin: '18.75px 6.75px',
                  transition: 'transform 150ms ease-out',
                }}
              >
                <path
                  d="M15 6.75H22.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M18.75 10.5V3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </g>
            </svg>
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() =>
          onBackClick
            ? onBackClick()
            : useWidgetSwapUIStore.getState().setView('swap')
        }
        className="flex cursor-pointer items-center justify-center whitespace-nowrap h-6 transition-colors text-(--widget-muted-foreground) opacity-70 hover:text-(--widget-foreground) hover:opacity-100"
      >
        <span className="pr-1">←</span>
        <span className="text-sm">Back</span>
      </button>
    );
  };

  const headerTextColor = getHeaderTextColor();

  // ── none variant: render nothing ─────────────────────────────────────────
  if (swapHeaderVariant === 'none') return null;

  return (
    <div className="w-full pt-3 px-2 font-sans text-base flex flex-row justify-between h-6 shrink-0">
      {view === 'wallet' ? (
        <div className="flex items-center gap-1 font-sans uppercase -translate-y-0.5 text-xs">
          <button
            type="button"
            onClick={() =>
              useWidgetSwapUIStore.getState().setWalletTab('wallet')
            }
            className="cursor-pointer transition-colors"
            style={{
              color:
                walletTab === 'wallet'
                  ? 'var(--widget-foreground)'
                  : 'var(--widget-muted-foreground)',
            }}
          >
            <span>Wallet</span>
          </button>
          <button
            type="button"
            onClick={() =>
              useWidgetSwapUIStore.getState().setWalletTab('activity')
            }
            className="cursor-pointer transition-colors"
            style={{
              color:
                walletTab === 'activity'
                  ? 'var(--widget-foreground)'
                  : 'var(--widget-muted-foreground)',
            }}
          >
            Activity
          </button>
        </div>
      ) : (
        <div className="font-sans uppercase -translate-y-0.5 text-xs flex items-center">
          <span
            className="relative"
            style={{ color: headerTextColor || 'var(--widget-foreground)' }}
            key={scrambleKey}
          >
            <TextScrambleDisplay
              targetText={targetHeaderText}
              isError={isErrorMessage ?? false}
            />
          </span>
        </div>
      )}
      <div className="flex flex-row items-center">{renderRightComponent()}</div>
    </div>
  );
};

export default SwapHeader;
