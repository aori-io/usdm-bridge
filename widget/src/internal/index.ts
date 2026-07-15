// Types
export type {
  Asset,
  TokenRegistryAsset,
  TokenSelectCategory,
  ReviewOrderStep,
  GetNotificationsParams,
  WalletBalanceItem,
  WalletBalanceResponse,
  SupportedChainId,
} from './types';
export { Categories, CategoryData, ReviewOrderSteps, reviewOrderStepToIndex } from './types';

// Chain config
export {
  NATIVE_ASSET_ADDRESS,
  staticChainsConfig,
  chainsConfig,
  getChainConfig,
  getChainIdByKey,
  getAllChainConfigs,
  getActiveChainConfigs,
  getAvailableChainConfigs,
  getAvailableActiveChainConfigs,
  getChainNames,
  getChainKeyToIdMapping,
  getChainIdToKeyMapping,
  getViemChainById,
  getChainColors,
  isGasToken,
  isNativeAssetAddress,
  isWrappedAssetAddress,
  isWrappingPair,
  isUnwrappingPair,
  getActiveChainIds,
  getTokenLogoFallback,
  registerDynamicChains,
  getDynamicChainIds,
  SUPPORTED_CHAIN_IDS,
  SUPPORTED_CHAIN_CONFIGS,
} from './chainsConfig';
export type { ChainConfig, StaticChainConfig, DynamicChainInput } from './chainsConfig';

// Environment
export { getAoriApiUrl, getAoriApiBaseUrl, getAoriSdkBaseUrl, getAoriSdkApiKey, setAoriApiBaseUrl, setApiKey, getApiKey, getAoriHeaders, setRpcOverrides, getRpcOverrides, getRpcUrlsForChain } from './environment';

// Helpers
export {
  formatNumber,
  TruncateString,
  toBigInt,
  isAddress,
  isReviewStepPast,
  getNextReviewStep,
  sleep,
  calculateDollarizedBalance,
  checkedAddress,
} from './helpers';

// Hooks
export { useDebounce } from './hooks/useDebounce';
export { useTextScramble } from './hooks/useTextScramble';
export { useTokenWithLazyLoad } from './hooks/useTokenWithLazyLoad';
export type { UseTokenWithLazyLoadResult } from './hooks/useTokenWithLazyLoad';

// Query hooks — chains
export { useChainData, useChainRegistry } from './queries/chains/hooks';
export type { AvailableChain } from './queries/chains/getAvailableChains';
export { getChainIdForKey, getKeyForChainId, clearAvailableChainsCache } from './queries/chains/getAvailableChains';
export { chainKeys } from './queries/chains/queryKeys';

// Query hooks — tokens
export {
  useTokenRegistry,
  useTokenPrice,
  useTokenPriceWithRefetch,
  useTokenWithFallback,
  useTokenData,
  useSupportedTokensWithPricing,
  useRelayTokensForChain,
  useInvalidateTokens,
} from './queries/tokens/hooks';
export { tokenKeys } from './queries/tokens/queryKeys';

// Query hooks — balances
export {
  useBulkBalances,
  useTokenBalance,
  useSwapBalances,
  useInvalidateBalances,
} from './queries/balances/hooks';
export type { EnrichedBalance } from './queries/balances/hooks';
export { balanceKeys } from './queries/balances/queryKeys';
export { fetchSwapBalances, getClient } from './queries/balances/queryFunctions';

// Query hooks — orders
export { fetchOrdersPaginated } from './queries/orders/queryFunctions';
export { orderKeys } from './queries/orders/queryKeys';

// Client
export { getAoriClient } from './client/aoriClient';
export { getWidgetSdk } from './client/sdk';
export { useAori, AoriClientProvider, AoriContext } from './client/AoriProvider';

// UI Components
export { default as TokenImage } from './components/TokenImage';
export { default as ChainIcon } from './components/ChainIcon';
export { default as CopyText } from './components/CopyText';
export { default as Skeleton } from './components/Skeleton';

// Bundled assets
export { chainIcons, getChainIcon } from './assets/chainIcons';
export { tokenIcons, getTokenIcon, MISSING_TOKEN_SVG } from './assets/tokenIcons';
export { venueIcons, getVenueIcon, getVenueLabel, VENUE_LABELS } from './assets/venueIcons';

// Icons
export { RedoIcon } from './icons/RedoIcon';
export { UserIcon } from './icons/UserIcon';
export { DropdownIcon } from './icons/DropdownIcon';
export { ClipboardIcon } from './icons/ClipboardIcon';

// Animations
export { default as Checkmark } from './animations/Checkmark';
export { default as LoadingSpinner } from './animations/LoadingSpinner';
export { default as ThreeDots } from './animations/ThreeDots';
export { default as RedoAnimation } from './animations/RedoAnimation';
export { default as XAnimation } from './animations/XAnimation';
