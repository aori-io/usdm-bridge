export interface Asset {
  symbol: string;
  address: string;
  logoURI?: string;
  name: string;
  decimals?: number;
  chainId: SupportedChainId;
  price?: number;
  vol24h?: number;
  change24h?: number;
  marketCap?: number;
}

export interface TokenRegistryAsset {
  symbol: string;
  address: string;
  chainId: SupportedChainId;
  chainKey: string;
  name: string;
  decimals: number;
  price: number;
  icon: string;
  marketCap?: number;
}

export const Categories = [
  'all',
  'favorites',
  'popular',
  'stables',
  'defi',
] as const;
export type TokenSelectCategory = (typeof Categories)[number];
export const CategoryData = {
  all: 'All Tokens',
  favorites: 'Watching',
  popular: 'Popular',
  stables: 'Stables',
  defi: 'DeFi',
} as const;

export const ReviewOrderSteps = [
  'chain',
  'approval',
  'signingOrder',
  'submittingOrder',
  'sendingTx',
  'success',
  'cancelled',
  'unwrapping',
  'wrapping',
  'wrapSuccess',
  'trackingTx',
] as const;
export type ReviewOrderStep = (typeof ReviewOrderSteps)[number];

export const reviewOrderStepToIndex: Record<ReviewOrderStep, number> = {
  chain: 0,
  wrapping: 1,
  approval: 2,
  signingOrder: 3,
  submittingOrder: 4,
  sendingTx: 5,
  success: 6,
  cancelled: 6,
  wrapSuccess: 7,
  unwrapping: 8,
  trackingTx: 9,
};

export interface GetNotificationsParams {
  offerer?: string | `0x${string}`;
  recipient?: string | `0x${string}`;
  tradeId?: string;
  chains?: number[];
  sourceChains?: number[];
  destChains?: number[];
  eventType?: string[];
  base?: string;
  quote?: string;
  startDate?: number;
  endDate?: number;
  minTime?: number;
  maxTime?: number;
  page?: number;
  verbose?: boolean;
  cursor?: string;
  limit?: number;
  minUsdValue?: number;
  maxUsdValue?: number;
}

export interface WalletBalanceItem {
  chainId: number;
  token: string;
  balance: string;
  shiftedBalance: string;
}

export interface WalletBalanceResponse {
  balances: WalletBalanceItem[];
}

export type SupportedChainId = number;
