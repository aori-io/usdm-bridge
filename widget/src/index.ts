import './widget.css';

// ===========================
// PUBLIC API — stable exports for external consumers
// ===========================

export { SwapWidget } from './SwapWidget';
export type { SwapWidgetProps } from './SwapWidget';
export type { AoriSwapWidgetConfig } from './config/types';
export { ConnectButton } from './wallet/ConnectButton';
export { useWalletModal } from './wallet/WalletModalContext';
export { useSolanaWallet, SolanaWalletProvider } from './wallet/SolanaWalletContext';
export { useTransactionRegistry } from './wallet/TransactionRegistryContext';
export { WidgetThemeProvider, useWidgetTheme } from './theme/ThemeContext';
export {
  type WidgetTheme,
  defaultLightTheme,
  defaultDarkTheme,
  themeToCSS,
} from './theme/types';
export { buildTransports, wagmiChains } from './wallet/shared/transports';

// ===========================
// ADVANCED API — for power users building custom UIs around the widget.
// These may change in future versions.
// ===========================

// Types used by advanced hooks and components
export type { Asset, SupportedChainId, TokenRegistryAsset } from './internal';
export type { EnrichedBalance } from './internal/queries/balances/hooks';
export type { ReviewOrderStep } from './internal';
export type { PollOrderStatusOptions } from './lib/pollOrderStatus';

export { useWalletState } from './wallet/useWalletState';
export {
  useWalletScreening,
  WalletScreeningProvider,
} from './context/WalletScreeningContext';
export type {
  BlockedWalletEvent,
  WalletScreeningState,
} from './context/WalletScreeningContext';
// Headless screening for SSR / API routes / custom flows. Bypasses the in-widget
// cache; caller is responsible for any caching they need.
export { screenWallet } from './lib/walletScreening';
export type {
  ScreeningResult,
  WalletScreeningConfig,
} from './lib/walletScreening';
export { RfqProvider, useRfq } from './providers/RfqProvider';
export { SwapFormProvider, useSwapFormContext } from './providers/SwapFormProvider';

// Multi-venue aggregation (advanced) — provider, hook, and UI for building
// custom aggregator experiences. The public `SwapWidget` surface is unchanged.
export { QuotesProvider, useQuotes } from './providers/QuotesProvider';
export type { QuotesStatus, VenueStatus, VenueQuoteError } from './providers/QuotesProvider';
export { QuoteList } from './components/quotes/QuoteList';
export { QuoteRow } from './components/quotes/QuoteRow';
export { venueIcons, getVenueIcon, getVenueLabel } from './internal/assets/venueIcons';
export type { VenueId, NormalizedQuote, QuoteRequestInput } from 'usdm-bridge-sdk';
export { useWidgetSwapUIStore } from './stores/swapUIStore';
export type { WidgetView, ToastStatus, TransitionType } from './stores/swapUIStore';

export { useTokenSelection, useTokenSelectionStore } from './hooks/useTokenSelection';
export { useSwapForm } from './hooks/useSwapForm';
export { useOrderStatusPolling } from './hooks/useOrderStatusPolling';
export { useBalanceEventListener, useEmitBalanceEvent, useBalanceEventSubscription } from './hooks/useBalanceEventListener';
export { useTokensForChain, useIsTokenSupported, useTokenByAddress } from './hooks/useTokenHelpers';

export { SignSwap, ChainSwitch } from './lib/signSwap';
export { canSubmitOrder, markOrderAsSubmitted, isQuoteFresh, cleanupOldSubmissions } from './lib/submitTracker';
export { pollOrderStatus } from './lib/pollOrderStatus';
export type { SwapCompleteData, AoriOrderDetails } from './lib/parseExplorerHash';

export { useWrapToken } from './queries/useWrapToken';
export { useUnwrapToken } from './queries/useUnwrapToken';
