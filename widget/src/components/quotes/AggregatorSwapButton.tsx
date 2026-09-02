'use client';

import { type AggregatedStatus, type NormalizedQuote, isSolanaChain, isUserRejectionError } from 'usdm-bridge-sdk';
import React, { useCallback, useState } from 'react';
import { useAccount, useConfig, useSwitchChain, useWalletClient } from 'wagmi';
import { type Asset, type ReviewOrderStep, getWidgetSdk } from '../../internal';
import type { SwapCompleteData } from '../../lib/parseExplorerHash';
import { buildWalletClientForChain, ensureWalletOnChain } from '../../lib/ensureWalletChain';
import { type ToastStatus, useWidgetSwapUIStore } from '../../stores/swapUIStore';
import { useWidgetConfig } from '../../context/WidgetConfigContext';
import { useSolanaWallet } from '../../wallet/SolanaWalletContext';

function mapToToast(status: AggregatedStatus['status']): ToastStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'received':
      return 'received';
    default:
      return 'pending';
  }
}

function explorerUrlFor(quote: NormalizedQuote, status?: AggregatedStatus): string {
  if (status?.txUrl) return status.txUrl;
  if (quote.venue === 'aori') return `https://aoriscan.io/order/${quote.quoteId}`;
  // Relay's canonical deep link is keyed by the requestId (quote.quoteId).
  if (quote.venue === 'relay') return `https://relay.link/transaction/${quote.quoteId}`;
  return '';
}

interface AggregatorSwapButtonProps {
  base: Asset;
  quote: Asset;
  baseAmount: number;
  quoteAmount: number;
  userAddress: string;
  selectedQuote: NormalizedQuote | null;
  reviewState: ReviewOrderStep | null;
  setReviewState: (s: ReviewOrderStep | null) => void;
  setTrackedOrderHash: (hash: string | null) => void;
  setTrackedVenue: (venue: string | null) => void;
  onSwapSubmitted?: (quoteId: string) => void;
  onSwapComplete?: (data: SwapCompleteData) => void;
  onSwapInitiated?: () => void;
  txStatus: ToastStatus;
  onReset: () => void;
}

export const AggregatorSwapButton: React.FC<AggregatorSwapButtonProps> = ({
  base: _base,
  quote: _quote,
  userAddress,
  selectedQuote,
  reviewState,
  setReviewState,
  setTrackedOrderHash,
  setTrackedVenue,
  onSwapSubmitted,
  onSwapComplete,
  onSwapInitiated,
  txStatus,
  onReset,
}) => {
  const { widgetType } = useWidgetConfig();
  const isCompactMode = widgetType === 'compact';
  const solanaWallet = useSolanaWallet();
  const { chainId: currentChainId, connector } = useAccount();
  const wagmiConfig = useConfig();
  const { switchChainAsync } = useSwitchChain();
  // Bound to the quote's source chain; `refetch` gives a fresh client after we
  // switch chains at execution time. The button does NOT gate on this — the
  // wallet may be on a different chain until the user clicks Swap.
  const { refetch: refetchWalletClient } = useWalletClient(
    selectedQuote?.srcChainId ? { chainId: selectedQuote.srcChainId } : undefined,
  );
  const [busy, setBusy] = useState(false);

  const handleSwap = useCallback(async () => {
    if (!selectedQuote || busy) return;
    setBusy(true);
    useWidgetSwapUIStore.getState().setSwapError(null);

    let trackingStarted = false;
    const startTrack = () => {
      if (trackingStarted) return;
      trackingStarted = true;
      setTrackedOrderHash(selectedQuote.quoteId);
      setTrackedVenue(selectedQuote.venue);
      useWidgetSwapUIStore.getState().startTracking(selectedQuote.quoteId);
      setReviewState('trackingTx');
      onSwapSubmitted?.(selectedQuote.quoteId);
      onSwapInitiated?.();
    };

    try {
      const srcChainId = selectedQuote.srcChainId;
      const isWagmiChain = wagmiConfig.chains.some((c) => c.id === srcChainId);

      let walletClient: unknown;
      if (isWagmiChain) {
        // Curated chain in wagmi's config: use wagmi's switch + client.
        if (currentChainId !== srcChainId) {
          await switchChainAsync({ chainId: srcChainId });
        }
        const { data } = await refetchWalletClient();
        walletClient = data;
      } else {
        // Relay-derived chain not in wagmi's frozen config: drive the wallet's
        // provider directly (add/switch chain) and build a client for it.
        const provider = (await connector?.getProvider()) as
          | { request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown> }
          | undefined;
        if (!provider) {
          throw new Error('Wallet unavailable — please make sure your wallet is connected.');
        }
        await ensureWalletOnChain(provider, srcChainId);
        walletClient = buildWalletClientForChain(provider, userAddress, srcChainId);
      }

      if (!walletClient) {
        throw new Error('Wallet unavailable — please make sure your wallet is connected.');
      }

      const sdk = getWidgetSdk();
      const needsSolana = isSolanaChain(selectedQuote.srcChainId);
      if (needsSolana && !solanaWallet) {
        throw new Error('Solana wallet not connected. Connect a Solana wallet to swap from Solana.');
      }

      await sdk.bridgeQuote(selectedQuote, {
        walletClient: walletClient as never,
        ...(solanaWallet ? { solanaWallet } : {}),
        onStep: (step) => {
          if (step.kind === 'submitted' || step.kind === 'transaction-sent' || step.kind === 'done') {
            startTrack();
          }
        },
        onStatusChange: (s) => {
          useWidgetSwapUIStore.getState().setTxStatus(mapToToast(s.status));
          const url = explorerUrlFor(selectedQuote, s);
          if (url) useWidgetSwapUIStore.getState().setExplorerUrl(url);
        },
        onSuccess: (r) => {
          useWidgetSwapUIStore.getState().setTxStatus('completed');
          const url = explorerUrlFor(selectedQuote, r.status);
          if (url) useWidgetSwapUIStore.getState().setExplorerUrl(url);
          onSwapComplete?.({
            quoteId: r.quoteId,
            aoriOrderHash: r.quoteId,
            explorerUrl: url,
            details: r.status.raw as unknown as SwapCompleteData['details'],
          });
        },
        onFailure: () => {
          useWidgetSwapUIStore.getState().setTxStatus('failed');
        },
      });
    } catch (e) {
      if (!isUserRejectionError(e)) {
        console.error('[usdm-bridge] aggregator swap execution failed', e);
      }
      if (trackingStarted) {
        // Already executing/tracking — reflect the failure in the status UI.
        useWidgetSwapUIStore.getState().setTxStatus('failed');
      } else if (!isUserRejectionError(e)) {
        // Unhandled pre-submit error: show a simple header message + reset.
        useWidgetSwapUIStore.getState().setSwapError('Something went wrong');
        onReset();
      }
      // User rejection before submit: no-op — the button simply re-enables.
    } finally {
      setBusy(false);
    }
  }, [
    selectedQuote,
    busy,
    currentChainId,
    connector,
    wagmiConfig,
    userAddress,
    switchChainAsync,
    refetchWalletClient,
    solanaWallet,
    setReviewState,
    setTrackedOrderHash,
    setTrackedVenue,
    onSwapSubmitted,
    onSwapComplete,
    onSwapInitiated,
    onReset,
  ]);

  const buttonBase = `w-full ${isCompactMode ? 'py-2' : 'py-3'} text-sm font-sans font-medium transition-colors`;
  const buttonStyle: React.CSSProperties = {
    backgroundColor: 'var(--widget-primary)',
    color: 'var(--widget-primary-foreground)',
    borderRadius: 'var(--widget-radius)',
  };

  // ── Tracking / terminal states ──────────────────────────────────────────
  if (reviewState === 'trackingTx') {
    const isTerminal = txStatus === 'completed' || txStatus === 'failed' || txStatus === 'cancelled' || txStatus === 'expired';
    if (isTerminal) {
      return (
        <button type="button" onClick={onReset} className={`${buttonBase} cursor-pointer hover:opacity-80`} style={buttonStyle}>
          {txStatus === 'completed' ? 'Done' : 'Try Again'}
        </button>
      );
    }
    return (
      <button type="button" disabled className={`${buttonBase} opacity-60 cursor-not-allowed`} style={buttonStyle}>
        {txStatus === 'received' ? 'Filling…' : 'Bridging…'}
      </button>
    );
  }

  // ── Idle / execute ──────────────────────────────────────────────────────
  // Enabled once a quote is selected; the wallet client is fetched (and the
  // chain switched if needed) on click, not as a precondition.
  const disabled = !selectedQuote || busy;
  return (
    <button
      type="button"
      onClick={handleSwap}
      disabled={disabled}
      className={`${buttonBase} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
      style={buttonStyle}
    >
      {busy ? 'Confirm in Wallet…' : selectedQuote ? 'Swap' : 'Getting Quotes…'}
    </button>
  );
};
