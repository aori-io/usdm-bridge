'use client';

import { create } from 'zustand';
import type {
  SupportedChainId,
  TokenSelectCategory,
} from '../internal';

export type ToastStatus =
  | 'pending'
  | 'received'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type WidgetView =
  | 'swap'
  | 'wallet'
  | 'activity'
  | 'baseSelection'
  | 'quoteSelection'
  | 'baseChainSelection'
  | 'quoteChainSelection';

export type TransitionType =
  | 'navigation'
  | 'tokenSelection'
  | 'chainSelection';

interface WidgetSwapUIState {
  view: WidgetView;
  isTransitioning: boolean;
  transitionType: TransitionType;

  isInverted: boolean;

  selectedChainFilter: {
    chainId: SupportedChainId;
    side: 'base' | 'quote';
  } | null;
  hoveredChainName: string | null;

  isRecipientInputOpen: boolean;
  recipient: string | null;

  baseAmount: number | null;
  quoteAmount: number | null;

  hasAllowanceError: boolean;
  /** Transient, user-facing error shown in the swap header (auto-cleared). */
  swapError: string | null;

  isTrackingTx: boolean;
  trackingOrderHash: string | null;
  txStatus: ToastStatus;
  explorerUrl: string | null;
  exitHandler: (() => void) | null;

  walletTab: 'wallet' | 'activity';

  assetSelectionSearch: string;
  assetSelectionChain: SupportedChainId | 'all';
  assetSelectionCategory: TokenSelectCategory;
  assetSelectionAddressInput: string;
  recentChainIds: SupportedChainId[];

  toggleInverted: () => void;
  setView: (view: WidgetView) => void;
  setWalletTab: (tab: 'wallet' | 'activity') => void;
  setIsTransitioning: (isTransitioning: boolean) => void;
  transitionToView: (view: WidgetView, type?: TransitionType) => void;
  setChainFilter: (
    filter: { chainId: SupportedChainId; side: 'base' | 'quote' } | null,
  ) => void;
  setHoveredChainName: (name: string | null) => void;
  toggleRecipientInput: () => void;
  setRecipient: (recipient: string | null) => void;
  setHasAllowanceError: (hasError: boolean) => void;
  setSwapError: (message: string | null) => void;

  setBaseAmount: (amount: number | null) => void;
  setQuoteAmount: (amount: number | null) => void;
  clearAmounts: () => void;

  setIsTrackingTx: (isTracking: boolean) => void;
  setTrackingOrderHash: (orderHash: string | null) => void;
  setTxStatus: (status: ToastStatus) => void;
  setExplorerUrl: (url: string | null) => void;
  startTracking: (orderHash: string) => void;
  stopTracking: () => void;
  setExitHandler: (handler: (() => void) | null) => void;

  setAssetSelectionSearch: (query: string) => void;
  setAssetSelectionChain: (chain: SupportedChainId | 'all') => void;
  setAssetSelectionCategory: (category: TokenSelectCategory) => void;
  setAssetSelectionAddressInput: (input: string) => void;
  pushRecentChain: (chainId: SupportedChainId) => void;
  resetAssetSelection: () => void;

  resetUI: () => void;
}

export const useWidgetSwapUIStore = create<WidgetSwapUIState>()((set) => ({
  view: 'swap',
  isTransitioning: false,
  transitionType: 'navigation',
  isInverted: false,
  selectedChainFilter: null,
  hoveredChainName: null,
  isRecipientInputOpen: false,
  recipient: null,
  hasAllowanceError: false,
  swapError: null,
  baseAmount: null,
  quoteAmount: null,
  isTrackingTx: false,
  trackingOrderHash: null,
  txStatus: 'pending',
  explorerUrl: null,
  exitHandler: null,
  walletTab: 'wallet',
  assetSelectionSearch: '',
  assetSelectionChain: 'all',
  assetSelectionCategory: 'all',
  assetSelectionAddressInput: '',
  recentChainIds: [],

  toggleInverted: () => set((state) => ({ isInverted: !state.isInverted })),
  setView: (view) => set({ view, isTransitioning: true, ...(view !== 'wallet' && { walletTab: 'wallet' }) }),
  setWalletTab: (tab) => set({ walletTab: tab }),
  setIsTransitioning: (isTransitioning) => set({ isTransitioning }),
  transitionToView: (view, type = 'navigation') =>
    set({ isTransitioning: true, transitionType: type, view, ...(view !== 'wallet' && { walletTab: 'wallet' }) }),

  setChainFilter: (filter) => set({ selectedChainFilter: filter }),
  setHoveredChainName: (name) => set({ hoveredChainName: name }),

  toggleRecipientInput: () =>
    set((state) => ({
      isRecipientInputOpen: !state.isRecipientInputOpen,
      recipient: !state.isRecipientInputOpen ? state.recipient : null,
    })),

  setRecipient: (recipient) => set({ recipient }),
  setHasAllowanceError: (hasError) => set({ hasAllowanceError: hasError }),
  setSwapError: (message) => set({ swapError: message }),

  setBaseAmount: (amount) => set({ baseAmount: amount }),
  setQuoteAmount: (amount) => set({ quoteAmount: amount }),
  clearAmounts: () => set({ baseAmount: null, quoteAmount: null }),

  setIsTrackingTx: (isTracking) => set({ isTrackingTx: isTracking }),
  setTrackingOrderHash: (orderHash) => set({ trackingOrderHash: orderHash }),
  setTxStatus: (status) => set({ txStatus: status }),
  setExplorerUrl: (url) => set({ explorerUrl: url }),
  startTracking: (orderHash) =>
    set({ isTrackingTx: true, trackingOrderHash: orderHash, txStatus: 'pending', explorerUrl: null }),
  stopTracking: () =>
    set({ isTrackingTx: false, trackingOrderHash: null, txStatus: 'pending', explorerUrl: null, exitHandler: null }),
  setExitHandler: (handler) => set({ exitHandler: handler }),

  setAssetSelectionSearch: (query) => set({ assetSelectionSearch: query }),
  setAssetSelectionChain: (chain) => set({ assetSelectionChain: chain }),
  setAssetSelectionCategory: (category) => set({ assetSelectionCategory: category }),
  setAssetSelectionAddressInput: (input) => set({ assetSelectionAddressInput: input }),

  pushRecentChain: (chainId) =>
    set((state) => {
      const filtered = state.recentChainIds.filter((id) => id !== chainId);
      return { recentChainIds: [chainId, ...filtered].slice(0, 3) };
    }),

  resetAssetSelection: () =>
    set({
      assetSelectionSearch: '',
      assetSelectionChain: 'all',
      assetSelectionCategory: 'all',
      assetSelectionAddressInput: '',
    }),

  resetUI: () =>
    set({
      view: 'swap',
      isTransitioning: false,
      isInverted: false,
      selectedChainFilter: null,
      hoveredChainName: null,
      isRecipientInputOpen: false,
      recipient: null,
      hasAllowanceError: false,
      swapError: null,
      baseAmount: null,
      quoteAmount: null,
      isTrackingTx: false,
      trackingOrderHash: null,
      txStatus: 'pending',
      explorerUrl: null,
      exitHandler: null,
      walletTab: 'wallet',
      assetSelectionSearch: '',
      assetSelectionChain: 'all',
      assetSelectionCategory: 'all',
      assetSelectionAddressInput: '',
    }),
}));
