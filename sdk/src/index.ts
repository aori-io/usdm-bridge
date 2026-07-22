// ===========================
// Class facade — primary entry point
// ===========================
export { UsdmBridgeSdk } from './client/UsdmBridgeSdk';
export { getAoriClient } from './client/aoriClient';

// ===========================
// Config + error types
// ===========================
export type {
  UsdmBridgeConfig,
  TokenRef,
  VenuesConfig,
  AggregationConfig,
  TokenSourceConfig,
} from './config/types';
export {
  ChainSwitchError,
  QuoteRequestError,
  QuoteStaleError,
  UnsupportedPairError,
  WalletBlockedError,
  isUserRejectionError,
} from './errors';

// ===========================
// Aori API types (re-exported from @aori/aori-ts)
// ===========================
export type {
  QuoteRequest,
  QuoteResponse,
  QuoteResponseBase,
  ERC20QuoteResponse,
  NativeQuoteResponse,
  SwapRequest,
  SwapResponse,
  ERC20SwapResponse,
  NativeSwapResponse,
  OrderStatus,
  OrderDetails,
  OrderEvent,
  OrderQueryResult,
  QueryOrdersParams,
  QueryOrdersResponse,
  PaginationMetadata,
  ChainInfo,
  TokenInfo,
  DomainInfo,
  Order,
  TransactionRequest,
  TransactionResponse,
  TxExecutor,
  TypedDataSigner,
} from './types/aori';

// ===========================
// Environment
// ===========================
export { DEFAULT_AORI_API_URL, SdkEnvironment } from './api/environment';
export type { SdkEnvironmentInit } from './api/environment';

// ===========================
// Standalone API functions (tree-shakable; the class wraps these)
// ===========================
export { requestQuote } from './api/quotes';
export type { RequestQuoteParams, RequestQuoteContext } from './api/quotes';

export { submitSwap } from './api/submit';
export type { SubmitSwapParams } from './api/submit';

export {
  isFailureStatus,
  isSuccessStatus,
  isTerminalStatus,
  pollOrderStatus,
} from './api/status';
export type { PollOrderStatusOptions } from './api/status';

export { trackOrderStatus } from './api/statusTracker';
export type { TrackOrderStatusOptions } from './api/statusTracker';

// ===========================
// Swap primitives
// ===========================
export { ChainSwitch } from './swap/chainSwitch';
export { ensureApproval } from './swap/steps';
export type { EnsureApprovalParams } from './swap/steps';
export { signOrder, toTypedDataSigner } from './swap/sign';
export { executeSwap } from './swap/execute';
export type {
  ExecuteSwapParams,
  ExecuteSwapResult,
  ExecuteSwapContext,
  ExecutionStep,
} from './swap/execute';

export { bridge } from './swap/bridge';
export type { BridgeParams, BridgeResult } from './swap/bridge';

export type { SwapWalletClient } from './swap/walletClient';

// ===========================
// Screening
// ===========================
export { screenWallet } from './screening/walletScreening';
export type { ScreeningResult, WalletScreeningConfig } from './screening/walletScreening';

// ===========================
// Chain registry
// ===========================
export {
  CHAINS,
  SUPPORTED_CHAIN_IDS,
  chainIdToKey,
  getChainConfig,
  keyToChainId,
} from './chains/chainKeys';
export type { SdkChainConfig } from './chains/chainKeys';

// ===========================
// Multi-venue aggregation
// ===========================
export type {
  Venue,
  VenueId,
  QuoteRequestInput,
  NormalizedQuote,
  QuoteExecutionStep,
  AggregatedStatus,
  ExecuteQuoteParams,
  ExecuteQuoteResult,
  PollAggregatedStatusOptions,
  VenueHistoryEntry,
  TokenMetadata,
  TokenSource,
  GetTokensParams,
  GetTokenPriceParams,
} from './venues/types';
export { createTokenSource } from './venues/customSource';
export { AoriVenue } from './venues/aori';
export type { AoriVenueOptions } from './venues/aori';
export { RelayVenue } from './venues/relay';
export type { RelayVenueOptions } from './venues/relay';
export { RelayEnvironment, RelayApiError, DEFAULT_RELAY_API_URL } from './venues/relay/client';
export type { RelayEnvironmentInit } from './venues/relay/client';
export { getRelayHistory } from './venues/relay/requests';
export type { RelayRequest, RelayRequestsResponse, GetRelayHistoryOptions } from './venues/relay/requests';
export { getRelayChains, getRelayCurrencies, getRelayTokenPrice } from './venues/relay/chains';
export type {
  RelayChainInfo,
  RelayCurrencyInfo,
  GetRelayChainsOptions,
  GetRelayCurrenciesOptions,
} from './venues/relay/chains';
export type {
  RelayQuoteResponse,
  RelayStep,
  RelayStepItem,
  RelayStatusResponse,
} from './venues/relay/types';

export {
  getQuotes,
  getBestQuote,
  bridgeQuote,
  byGrossOutputDesc,
  assertComparableOutputs,
  settleWithDeadline,
  withTimeout,
  NoQuotesError,
  QuoteVenueError,
  DEFAULT_PER_VENUE_TIMEOUT_MS,
  DEFAULT_OVERALL_DEADLINE_MS,
} from './aggregator';
export type {
  GetQuotesOptions,
  GetQuotesResult,
  BridgeQuoteParams,
  BridgeQuoteResult,
  QuoteComparator,
  VenueError,
  VenueTask,
  SettleWithDeadlineOptions,
  SettleWithDeadlineResult,
} from './aggregator';
