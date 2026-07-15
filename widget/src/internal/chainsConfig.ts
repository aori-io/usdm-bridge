import {
  type Chain,
  arbitrum,
  base,
  bsc,
  mainnet,
  optimism,
} from 'wagmi/chains';
import { getChainIcon } from './assets/chainIcons';
import { getTokenIcon, MISSING_TOKEN_SVG } from './assets/tokenIcons';
import { getSymbolOverride } from './assets/symbolOverrides';

/**
 * SIMPLIFIED CHAIN CONFIGURATION
 *
 * Philosophy: Define each chain ONCE with minimal data.
 * Everything else is derived or follows conventions.
 */

// Native asset address - same across all EVM chains
export const NATIVE_ASSET_ADDRESS =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Stable chain v1.2.0+: USDT0 is both the native gas token and an ERC20 token.
const STABLE_USDT0_ADDRESS = '0x779ded0c9e1022225f8e0630b35a9b54be713736';

// ============================================================================
// MINIMAL CHAIN DEFINITIONS
// ============================================================================

/**
 * Minimal chain data - everything else is derived
 */
interface MinimalChainConfig {
  id: number;
  key: string; // lowercase API key
  eid: number; // LayerZero Endpoint ID
  isActive?: boolean; // Production visibility (default: true)

  // Optional overrides for derived values
  name?: string; // Override default (key)
  displayName?: string; // Override default (derived from key)
  shortName?: string; // Override default (derived from nativeSymbol)
  logoUrl?: string; // Override default (derived from key)

  // Native token info
  nativeSymbol: string; // 'ETH', 'XPL', 'BNB', 'MON', 'gUSDT', 'rBTC'
  nativeName: string; // 'Ether', 'Plasma Token', etc.
  nativeDecimals?: number; // default: 18
  nativeAddress?: string; // default: NATIVE_ASSET_ADDRESS; override for chains with non-standard native identifiers
  nativeLogoUrl?: string; // Override default (derived from symbol)

  // Wrapped token
  wrappedAddress: string;
  wrappedSymbol?: string; // Override default (W + nativeSymbol)
  wrappedName?: string; // Override default (Wrapped + nativeName)
  wrappedDecimals?: number; // Override default (same as native)
  wrappedLogoUrl?: string; // Override default (derived from symbol)

  // Preferred stablecoins
  stablecoins: Array<{
    symbol: string;
    address: string;
    decimals: number;
  }>;

  // Network
  rpcUrls: string[];
  blockExplorerUrls: string[];
  blockTimeMs: number;
  estimatedTimeMs: number;

  // UI
  color: string;

  // Wagmi chain (if standard, just import; if custom, define inline)
  wagmiChain: Chain | (() => Chain);
}

// ============================================================================
// CHAIN REGISTRY - Single source of truth
// ============================================================================

const CHAIN_REGISTRY: Record<number, MinimalChainConfig> = {
  1: {
    id: 1,
    key: 'ethereum',
    eid: 30101,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    wrappedAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    stablecoins: [
      {
        symbol: 'USDC',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      },
      {
        symbol: 'USDT',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
      },
    ],
    rpcUrls: [
      'https://ethereum.publicnode.com',
      'https://eth.llamarpc.com',
      'https://eth.drpc.org',
      'https://rpc.eth.gateway.fm',
    ],
    blockExplorerUrls: ['https://etherscan.io'],
    blockTimeMs: 5_000,
    estimatedTimeMs: 12_000,
    color: '#627EEA',
    wagmiChain: mainnet,
  },

  42161: {
    id: 42161,
    key: 'arbitrum',
    eid: 30110,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    wrappedAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    stablecoins: [
      {
        symbol: 'USDC',
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        decimals: 6,
      },
      {
        symbol: 'USDT0',
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
      },
    ],
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://arbitrum.drpc.org',
    ],
    blockExplorerUrls: ['https://arbiscan.io'],
    blockTimeMs: 250,
    estimatedTimeMs: 1_000,
    color: '#28A0F0',
    wagmiChain: arbitrum,
  },

  10: {
    id: 10,
    key: 'optimism',
    eid: 30111,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    wrappedAddress: '0x4200000000000000000000000000000000000006',
    stablecoins: [
      {
        symbol: 'USDC',
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        decimals: 6,
      },
      {
        symbol: 'USDT0',
        address: '0x01bFF41798a0BcF287b996046Ca68b395DbC1071',
        decimals: 6,
      },
    ],
    rpcUrls: [
      'https://mainnet.optimism.io',
      'https://optimism.llamarpc.com',
      'https://optimism.drpc.org',
    ],
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
    blockTimeMs: 2_000,
    estimatedTimeMs: 2_000,
    color: '#FF0420',
    wagmiChain: optimism,
  },

  8453: {
    id: 8453,
    key: 'base',
    eid: 30184,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    wrappedAddress: '0x4200000000000000000000000000000000000006',
    stablecoins: [
      {
        symbol: 'USDC',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
      },
      {
        symbol: 'USDT',
        address: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2',
        decimals: 6,
      },
    ],
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base.drpc.org',
    ],
    blockExplorerUrls: ['https://basescan.org'],
    blockTimeMs: 2_000,
    estimatedTimeMs: 2_000,
    color: '#3742fa',
    wagmiChain: base,
  },

  9745: {
    id: 9745,
    key: 'plasma',
    eid: 30383,
    nativeSymbol: 'XPL',
    nativeName: 'Plasma Token',
    wrappedAddress: '0x6100E367285b01F48D07953803A2d8dCA5D19873',
    stablecoins: [
      {
        symbol: 'USDT0',
        address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
        decimals: 6,
      },
    ],
    rpcUrls: ['https://rpc.plasma.to', 'https://9745.rpc.thirdweb.com'],
    blockExplorerUrls: ['https://plasmascan.to'],
    blockTimeMs: 1_000,
    estimatedTimeMs: 1_000,
    color: '#2A5A50',
    wagmiChain: () => ({
      id: 9745,
      name: 'Plasma',
      nativeCurrency: { name: 'Plasma Token', symbol: 'XPL', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.plasma.to'] } },
      blockExplorers: {
        default: { name: 'PlasmaScan', url: 'https://plasmascan.to' },
      },
      contracts: {
        multicall3: {
          address: '0xcA11bde05977b3631167028862bE2a173976CA11',
          blockCreated: 1,
        },
      },
    }),
  },

  56: {
    id: 56,
    key: 'bsc',
    name: 'bnb', // Override: name is 'bnb' not 'bsc'
    eid: 30102,
    nativeSymbol: 'BNB',
    nativeName: 'BNB',
    wrappedAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    stablecoins: [
      {
        symbol: 'USDC',
        address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
        decimals: 18,
      },
      {
        symbol: 'USDT',
        address: '0x55d398326f99059fF775485246999027B3197955',
        decimals: 18,
      },
    ],
    rpcUrls: ['https://bsc-dataseed1.binance.org', 'https://bsc.drpc.org'],
    blockExplorerUrls: ['https://bscscan.com'],
    blockTimeMs: 2_000,
    estimatedTimeMs: 1_000,
    color: '#F3BA2F',
    wagmiChain: bsc,
  },

  143: {
    id: 143,
    key: 'monad',
    name: 'Monad', // Override: name is 'Monad' (capitalized) not 'monad'
    eid: 30390,
    isActive: true,
    nativeSymbol: 'MON',
    nativeName: 'Monad',
    wrappedAddress: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    stablecoins: [
      {
        symbol: 'USDC',
        address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
        decimals: 6,
      },
      {
        symbol: 'USDT0',
        address: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d',
        decimals: 6,
      },
    ],
    rpcUrls: [
      'https://rpc.monad.xyz',
      'https://rpc1.monad.xyz',
      'https://rpc2.monad.xyz',
      'https://rpc3.monad.xyz',
    ],
    blockExplorerUrls: ['https://monadvision.com'],
    blockTimeMs: 1_000,
    estimatedTimeMs: 1_000,
    color: '#6D5CE6',
    logoUrl: '/images/tokens/monad.svg',
    wagmiChain: () => ({
      id: 143,
      name: 'Monad',
      nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
      blockExplorers: {
        default: { name: 'MonadVision', url: 'https://monadvision.com' },
      },
      contracts: {
        multicall3: {
          address: '0xcA11bde05977b3631167028862bE2a173976CA11',
          blockCreated: 1,
        },
      },
    }),
  },

  988: {
    id: 988,
    key: 'stable',
    name: 'Stable',
    displayName: 'Stable',
    shortName: 'Stable',
    eid: 30396,
    isActive: true,
    // Stable v1.2.0+: USDT0 is BOTH the native gas token AND a standard ERC20.
    // eth_getBalance returns USDT0 in 18-decimal units (gas/wei scale).
    // balanceOf(0x779...) returns USDT0 in 6-decimal units (ERC20 scale).
    nativeSymbol: 'USDT0',
    nativeName: 'USDT0',
    nativeAddress: STABLE_USDT0_ADDRESS, // ERC20 contract IS the native token identifier
    nativeDecimals: 18, // eth_getBalance returns 18-decimal units (gas scale)
    // wrappedAddress = nativeAddress: USDT0 is both native and "wrapped".
    // isWrappingPair / isUnwrappingPair detect this and return false for Stable.
    wrappedAddress: STABLE_USDT0_ADDRESS,
    wrappedSymbol: 'USDT0',
    wrappedName: 'USDT0',
    wrappedDecimals: 6, // ERC20 balanceOf uses 6 decimals
    stablecoins: [
      {
        symbol: 'USDT0',
        address: STABLE_USDT0_ADDRESS,
        decimals: 6,
      },
    ],
    rpcUrls: ['https://rpc.stable.xyz'],
    blockExplorerUrls: ['https://stablescan.xyz'],
    blockTimeMs: 1_000,
    estimatedTimeMs: 1_000,
    color: '#00B69B',
    logoUrl: '/images/tokens/stable.svg',
    wagmiChain: () => ({
      id: 988,
      name: 'Stable',
      nativeCurrency: { name: 'USDT0', symbol: 'USDT0', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.stable.xyz'] } },
      blockExplorers: {
        default: { name: 'StableScan', url: 'https://stablescan.xyz' },
      },
      contracts: {
        multicall3: {
          address: '0xcA11bde05977b3631167028862bE2a173976CA11',
          blockCreated: 1,
        },
      },
    }),
  },

  4326: {
    id: 4326,
    key: 'megaeth',
    eid: 30398,
    isActive: true,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    wrappedAddress: '0x4200000000000000000000000000000000000006',
    stablecoins: [
      {
        symbol: 'USDT0',
        address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
        decimals: 6,
      },
      {
        symbol: 'USDM',
        address: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7',
        decimals: 18,
      },
    ],
    rpcUrls: ['https://mainnet.megaeth.com/rpc', 'https://megaeth.drpc.org'],
    blockExplorerUrls: ['https://mega.etherscan.io'],
    blockTimeMs: 1_000,
    estimatedTimeMs: 1_000,
    color: '#ffffff',
    wagmiChain: () => ({
      id: 4326,
      name: 'MegaETH',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['https://mainnet.megaeth.com/rpc'] } },
      blockExplorers: {
        default: { name: 'MegaEtherscan', url: 'https://mega.etherscan.io' },
      },
      contracts: {
        multicall3: {
          address: '0xcA11bde05977b3631167028862bE2a173976CA11',
          blockCreated: 1,
        },
      },
    }),
  },

  30: {
    id: 30,
    key: 'rootstock',
    shortName: 'Root', // Override: shortName is 'Root' not 'rBTC'
    eid: 30333,
    isActive: false,
    nativeSymbol: 'rBTC',
    nativeName: 'rBTC',
    wrappedAddress: '0x542fDA317318eBF1d3DEAf76E0b632741A7e677d',
    wrappedSymbol: 'wRBTC', // Override: lowercase 'w' not 'W'
    stablecoins: [
      {
        symbol: 'USDT0',
        address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
        decimals: 6,
      },
    ],
    rpcUrls: ['https://public-node.rsk.co'],
    blockExplorerUrls: ['https://explorer.rootstock.io'],
    blockTimeMs: 30_000,
    estimatedTimeMs: 30_000,
    color: '#ffffff',
    wagmiChain: () => ({
      id: 30,
      name: 'rootstock',
      nativeCurrency: { name: 'rBTC', symbol: 'rBTC', decimals: 18 },
      rpcUrls: { default: { http: ['https://public-node.rsk.co'] } },
      blockExplorers: {
        default: {
          name: 'rootstock explorer',
          url: 'https://explorer.rootstock.io',
        },
      },
      contracts: {
        multicall3: {
          address: '0xCa11bdE05977B3631167028862Be2a173976ca11',
          blockCreated: 1,
        },
      },
    }),
  },
};

// ============================================================================
// DERIVED CONFIGURATION - Auto-generated from CHAIN_REGISTRY
// ============================================================================

/**
 * Auto-generate display names from native symbol
 * ETH → Ethereum, BNB → BNB, XPL → Plasma, etc.
 */
function deriveDisplayName(key: string, nativeSymbol: string): string {
  const overrides: Record<string, string> = {
    ethereum: 'Ethereum',
    arbitrum: 'Arbitrum',
    optimism: 'Optimism',
    base: 'Base',
    plasma: 'Plasma',
    bsc: 'BNB',
    monad: 'Monad',
    stable: 'Stable',
    megaeth: 'MegaETH',
    rootstock: 'Rootstock',
  };
  return overrides[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Auto-generate short names from native symbol
 */
function deriveShortName(nativeSymbol: string, key: string): string {
  if (nativeSymbol === 'ETH') {
    const ethChainShortNames: Record<string, string> = {
      ethereum: 'ETH',
      arbitrum: 'ARB',
      optimism: 'OP',
      base: 'BASE',
      megaeth: 'MEGA',
    };
    return ethChainShortNames[key] || 'ETH';
  }
  return nativeSymbol;
}

/**
 * Auto-generate wrapped token symbol (W + native)
 */
function deriveWrappedSymbol(nativeSymbol: string, key: string): string {
  // Stable is special - wrapped is USDT0, not WgUSDT
  if (key === 'stable') return 'USDT0';
  return `W${nativeSymbol}`;
}

/**
 * Auto-generate wrapped token name
 */
function deriveWrappedName(nativeName: string, key: string): string {
  if (key === 'stable') return 'USDT0';
  return `Wrapped ${nativeName}`;
}

function resolveRelativeUrl(url: string): string {
  if (url.startsWith('/')) {
    const filename = url.split('/').pop()?.replace(/\.[^.]+$/, '').toLowerCase();
    if (filename) {
      const bundled = getTokenIcon(filename);
      if (bundled) return bundled;
    }
    // TODO: Add fallback image source for unresolved relative paths
    return MISSING_TOKEN_SVG;
  }
  return url;
}

function deriveLogoUrl(key: string): string {
  // TODO: Add fallback chain image source
  return getChainIcon(key) ?? MISSING_TOKEN_SVG;
}

function deriveTokenLogoUrl(symbol: string, _key: string): string {
  const bundledKeyOverrides: Record<string, string> = {
    gUSDT: 'stable',
    USDT0: 'stable',
    rBTC: 'eth',
    wRBTC: 'eth',
    MON: 'monad',
    WMON: 'monad',
    XPL: 'plasma',
    WXPL: 'plasma',
  };

  const mapped = bundledKeyOverrides[symbol];
  if (mapped) {
    const bundled = getTokenIcon(mapped);
    if (bundled) return bundled;
  }

  const bundled = getTokenIcon(symbol);
  if (bundled) return bundled;

  const override = getSymbolOverride(symbol);
  if (override) return override;

  return MISSING_TOKEN_SVG;
}

/**
 * Full expanded chain config (backwards compatible with old StaticChainConfig)
 */
export interface StaticChainConfig {
  id: number;
  name: string;
  displayName: string;
  shortName: string;
  key: string;
  eid: number;
  isActive?: boolean;

  nativeAsset: {
    name: string;
    symbol: string;
    decimals: number;
    address: string;
    logoUrl: string;
  };

  wrappedAsset: {
    name: string;
    symbol: string;
    decimals: number;
    address: string;
    logoUrl: string;
  };

  gasToken: {
    name: string;
    symbol: string;
    decimals: number;
    address: string;
  };

  preferredStablecoins: Array<{
    symbol: string;
    address: string;
    decimals: number;
  }>;

  rpcUrls: string[];
  blockExplorerUrls: string[];
  blockTimeMs: number;
  estimatedTimeMs: number;
  color: string;
  logoUrl: string;
  wagmiChain: Chain;
}

export type ChainConfig = StaticChainConfig;

/**
 * Auto-expand minimal config to full config
 */
function expandChainConfig(minimal: MinimalChainConfig): StaticChainConfig {
  const decimals = minimal.nativeDecimals ?? 18;
  const nativeAddress = minimal.nativeAddress ?? NATIVE_ASSET_ADDRESS;
  const wrappedSymbol =
    minimal.wrappedSymbol ??
    deriveWrappedSymbol(minimal.nativeSymbol, minimal.key);
  const wrappedName =
    minimal.wrappedName ?? deriveWrappedName(minimal.nativeName, minimal.key);
  const wrappedDecimals = minimal.wrappedDecimals ?? decimals;

  return {
    id: minimal.id,
    name: minimal.name ?? minimal.key,
    displayName:
      minimal.displayName ??
      deriveDisplayName(minimal.key, minimal.nativeSymbol),
    shortName:
      minimal.shortName ?? deriveShortName(minimal.nativeSymbol, minimal.key),
    key: minimal.key,
    eid: minimal.eid,
    isActive: minimal.isActive,

    nativeAsset: {
      name: minimal.nativeName,
      symbol: minimal.nativeSymbol,
      decimals,
      address: nativeAddress,
      logoUrl: minimal.nativeLogoUrl
        ? resolveRelativeUrl(minimal.nativeLogoUrl)
        : deriveTokenLogoUrl(minimal.nativeSymbol, minimal.key),
    },

    wrappedAsset: {
      name: wrappedName,
      symbol: wrappedSymbol,
      decimals: wrappedDecimals,
      address: minimal.wrappedAddress,
      logoUrl: minimal.wrappedLogoUrl
        ? resolveRelativeUrl(minimal.wrappedLogoUrl)
        : deriveTokenLogoUrl(wrappedSymbol, minimal.key),
    },

    gasToken: {
      name: minimal.nativeName,
      symbol: minimal.nativeSymbol,
      decimals,
      address: nativeAddress,
    },

    preferredStablecoins: minimal.stablecoins,
    rpcUrls: minimal.rpcUrls,
    blockExplorerUrls: minimal.blockExplorerUrls,
    blockTimeMs: minimal.blockTimeMs,
    estimatedTimeMs: minimal.estimatedTimeMs,
    color: minimal.color,
    logoUrl: minimal.logoUrl
      ? resolveRelativeUrl(minimal.logoUrl)
      : deriveLogoUrl(minimal.key),
    wagmiChain:
      typeof minimal.wagmiChain === 'function'
        ? minimal.wagmiChain()
        : minimal.wagmiChain,
  };
}

/**
 * Expanded chain configurations - auto-generated from CHAIN_REGISTRY
 */
export const staticChainsConfig: Record<number, StaticChainConfig> =
  Object.fromEntries(
    Object.entries(CHAIN_REGISTRY).map(([id, minimal]) => [
      id,
      expandChainConfig(minimal),
    ]),
  );

// Backwards compatibility
export const chainsConfig = staticChainsConfig;

const KNOWN_NATIVE_ADDRESSES: Set<string> = new Set(
  Object.values(staticChainsConfig).map((c) =>
    c.nativeAsset.address.toLowerCase(),
  ),
);

export const CHAIN_NAMES: Record<number, string> = Object.fromEntries(
  Object.values(staticChainsConfig).map((c) => [c.id, c.displayName]),
);

export const CHAIN_KEY_TO_ID: Record<string, number> = Object.fromEntries(
  Object.values(staticChainsConfig).map((c) => [c.key, c.id]),
);

export const CHAIN_ID_TO_KEY: Record<number, string> = Object.fromEntries(
  Object.values(staticChainsConfig).map((c) => [c.id, c.key]),
);

export const WRAPPED_TOKEN_ADDRESSES: Record<number, string> =
  Object.fromEntries(
    Object.values(staticChainsConfig).map((c) => [
      c.id,
      c.wrappedAsset.address,
    ]),
  );

export const CHAIN_COLORS: Record<number, string> = Object.fromEntries(
  Object.values(staticChainsConfig).map((c) => [c.id, c.color]),
);

export const VIEM_CHAINS_BY_ID: Record<number, Chain> = Object.fromEntries(
  Object.values(staticChainsConfig).map((c) => [c.id, c.wagmiChain]),
);

// ============================================================================
// DYNAMIC CHAIN OVERLAY (Relay-derived, registered at runtime)
// ============================================================================
//
// Chains discovered from Relay's `GET /chains` are expanded into the same
// `StaticChainConfig` shape and merged *underneath* the curated static chains
// (a curated chain id always wins). These power selection, icons, balances and
// RPC. Note: they are NOT added to the import-time `wagmiChains`/`buildTransports`
// (wagmi's config is frozen at host boot), so aggregator execution switches
// chains via the wallet provider directly instead of wagmi.

/** Minimal input to register a runtime chain (maps from SDK `RelayChainInfo`). */
export interface DynamicChainInput {
  id: number;
  key: string;
  name: string;
  rpcUrl?: string;
  explorerUrl?: string;
  iconUrl?: string;
  nativeCurrency: {
    symbol: string;
    name: string;
    decimals: number;
    address?: string;
  };
  color?: string;
  blockTimeMs?: number;
  estimatedTimeMs?: number;
}

const dynamicChainsConfig: Record<number, StaticChainConfig> = {};

function expandDynamicChain(input: DynamicChainInput): StaticChainConfig {
  const decimals = input.nativeCurrency.decimals ?? 18;
  const nativeAddress = input.nativeCurrency.address ?? NATIVE_ASSET_ADDRESS;
  const rpcUrls = input.rpcUrl ? [input.rpcUrl] : [];
  const blockExplorerUrls = input.explorerUrl ? [input.explorerUrl] : [];
  const logoUrl = input.iconUrl ?? MISSING_TOKEN_SVG;
  const nativeLogo =
    input.iconUrl ?? deriveTokenLogoUrl(input.nativeCurrency.symbol, input.key);

  const wagmiChain = {
    id: input.id,
    name: input.name,
    nativeCurrency: {
      name: input.nativeCurrency.name,
      symbol: input.nativeCurrency.symbol,
      decimals,
    },
    rpcUrls: {
      default: { http: rpcUrls },
      public: { http: rpcUrls },
    },
    ...(input.explorerUrl
      ? {
          blockExplorers: {
            default: { name: 'Explorer', url: input.explorerUrl },
          },
        }
      : {}),
  } as Chain;

  const nativeAsset = {
    name: input.nativeCurrency.name,
    symbol: input.nativeCurrency.symbol,
    decimals,
    address: nativeAddress,
    logoUrl: nativeLogo,
  };

  return {
    id: input.id,
    name: input.key,
    displayName: input.name,
    shortName: input.nativeCurrency.symbol,
    key: input.key,
    eid: 0,
    isActive: true,
    nativeAsset,
    // Dynamic chains don't model a distinct wrapped token; alias native so
    // wrap/unwrap detection short-circuits (never a wrapping pair).
    wrappedAsset: { ...nativeAsset },
    gasToken: {
      name: input.nativeCurrency.name,
      symbol: input.nativeCurrency.symbol,
      decimals,
      address: nativeAddress,
    },
    preferredStablecoins: [],
    rpcUrls,
    blockExplorerUrls,
    blockTimeMs: input.blockTimeMs ?? 2_000,
    estimatedTimeMs: input.estimatedTimeMs ?? 30_000,
    color: input.color ?? '#6b7280',
    logoUrl,
    wagmiChain,
  };
}

/**
 * Register runtime-discovered chains. Curated static chains always win; chains
 * already registered are skipped. Safe to call repeatedly (idempotent per id).
 */
export function registerDynamicChains(inputs: DynamicChainInput[]): number {
  let added = 0;
  for (const input of inputs) {
    if (!input || typeof input.id !== 'number') continue;
    if (staticChainsConfig[input.id] || dynamicChainsConfig[input.id]) continue;
    const expanded = expandDynamicChain(input);
    dynamicChainsConfig[input.id] = expanded;
    KNOWN_NATIVE_ADDRESSES.add(expanded.nativeAsset.address.toLowerCase());
    added += 1;
  }
  return added;
}

/** Chain ids that were registered dynamically (Relay-derived). */
export function getDynamicChainIds(): number[] {
  return Object.keys(dynamicChainsConfig).map(Number);
}

/** Live merged view: curated static chains + registered dynamic chains. */
function mergedChains(): Record<number, StaticChainConfig> {
  return { ...staticChainsConfig, ...dynamicChainsConfig };
}

// ============================================================================
// DERIVED CONSTANTS - Auto-generated
// ============================================================================

export const SUPPORTED_CHAIN_IDS = Object.keys(chainsConfig).map(Number);
export const SUPPORTED_CHAIN_CONFIGS = Object.values(chainsConfig).map(
  (c) => c.wagmiChain,
);

export type SupportedChainId = keyof typeof chainsConfig;

// ============================================================================
// HELPER FUNCTIONS (unchanged from original)
// ============================================================================

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return mergedChains()[chainId];
}

export function getChainIdByKey(key: string): number | undefined {
  const config = Object.values(mergedChains()).find(
    (c) => c.key.toLowerCase() === key.toLowerCase(),
  );
  return config?.id;
}

export function getChainIdByEid(eid: number): number | undefined {
  const config = Object.values(chainsConfig).find((c) => c.eid === eid);
  return config?.id;
}

export function getEidByChainId(chainId: number): number | undefined {
  return getChainConfig(chainId)?.eid;
}

export function getAllChainIds(): number[] {
  return Object.keys(mergedChains()).map(Number);
}

export function getAllEids(): number[] {
  return Object.values(mergedChains()).map((c) => c.eid);
}

export function getAllChainConfigs(): ChainConfig[] {
  return Object.values(mergedChains());
}

export function getActiveChainConfigs(): ChainConfig[] {
  return Object.values(mergedChains()).filter((c) => c.isActive !== false);
}

export function getActiveChainIds(): number[] {
  return getActiveChainConfigs().map((c) => c.id);
}

/**
 * Order curated (static / Aori-supported) chains before dynamic (Relay-derived)
 * chains. Within each group, natural (numeric chain-id) order is preserved.
 * Without this, integer object keys interleave both sets by chain id.
 */
function orderStaticFirst(configs: ChainConfig[]): ChainConfig[] {
  const staticOnes: ChainConfig[] = [];
  const dynamicOnes: ChainConfig[] = [];
  for (const c of configs) {
    if (staticChainsConfig[c.id]) staticOnes.push(c);
    else dynamicOnes.push(c);
  }
  return [...staticOnes, ...dynamicOnes];
}

export function getAvailableChainConfigs(
  availableChainIds: number[],
): ChainConfig[] {
  return orderStaticFirst(
    Object.values(mergedChains()).filter((c) => availableChainIds.includes(c.id)),
  );
}

export function getAvailableActiveChainConfigs(
  availableChainIds: number[],
): ChainConfig[] {
  return orderStaticFirst(
    Object.values(mergedChains()).filter(
      (c) => availableChainIds.includes(c.id) && c.isActive !== false,
    ),
  );
}

// Mapping utilities — merge dynamic chains over the pre-computed static maps.
export const getChainNames = (): Record<number, string> =>
  Object.fromEntries(Object.values(mergedChains()).map((c) => [c.id, c.displayName]));
export const getChainKeyToIdMapping = (): Record<string, number> =>
  Object.fromEntries(Object.values(mergedChains()).map((c) => [c.key, c.id]));
export const getChainIdToKeyMapping = (): Record<number, string> =>
  Object.fromEntries(Object.values(mergedChains()).map((c) => [c.id, c.key]));
export const getWrappedTokenAddresses = (): Record<number, string> =>
  WRAPPED_TOKEN_ADDRESSES;

export const getChainColors = (): Record<number, string> =>
  Object.fromEntries(Object.values(mergedChains()).map((c) => [c.id, c.color]));

export const getViemChainById = (): Record<number, Chain> =>
  Object.fromEntries(Object.values(mergedChains()).map((c) => [c.id, c.wagmiChain]));

// Utility functions
export function getNativeTokenSymbol(chainId: number): string {
  return getChainConfig(chainId)?.nativeAsset.symbol || 'ETH';
}

export function isNativeAssetAddress(address: string): boolean {
  return KNOWN_NATIVE_ADDRESSES.has(address.toLowerCase());
}

export function isWrappedAssetAddress(
  address: string,
  chainId: number,
): boolean {
  const config = getChainConfig(chainId);
  return config
    ? address.toLowerCase() === config.wrappedAsset.address.toLowerCase()
    : false;
}

export function getTokenLogoFallback(
  chainId: number,
  tokenAddress: string,
): string | undefined {
  const config = getChainConfig(chainId);
  if (!config) return undefined;

  const normalizedAddress = tokenAddress.toLowerCase();

  if (normalizedAddress === NATIVE_ASSET_ADDRESS.toLowerCase()) {
    return config.nativeAsset.logoUrl;
  }

  if (normalizedAddress === config.wrappedAsset.address.toLowerCase()) {
    return config.wrappedAsset.logoUrl;
  }

  return undefined;
}

export function isGasToken(
  asset: { address: string; chainId?: number } | null | undefined,
): boolean {
  if (!asset) return false;
  return isNativeAssetAddress(asset.address);
}

export function getPreferredStablecoins(): Record<
  number,
  Array<{ symbol: string; address: string; decimals: number }>
> {
  return Object.fromEntries(
    Object.values(chainsConfig).map((c) => [c.id, c.preferredStablecoins]),
  );
}

export function getPreferredStablecoinsForChain(
  chainId: number,
): Array<{ symbol: string; address: string; decimals: number }> | undefined {
  return getChainConfig(chainId)?.preferredStablecoins;
}

export interface NativeTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
}

export function getNativeTokenInfo(chainId: number): NativeTokenInfo {
  const config = getChainConfig(chainId);
  if (!config) {
    return {
      address: NATIVE_ASSET_ADDRESS,
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      chainId,
    };
  }
  return {
    address: config.gasToken.address,
    symbol: config.gasToken.symbol,
    name: config.gasToken.name,
    decimals: config.gasToken.decimals,
    chainId,
  };
}

// ============================================================================
// TOKEN IDENTITY UTILITIES
// ============================================================================

/**
 * Canonical composite token key: "chainId:address.toLowerCase()"
 * Use this everywhere you need to identify a specific token on a specific chain.
 * Consistent with the URL state format (inputToken=chainId:address).
 */
export function tokenId(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

/**
 * Get the canonical composite token key for a chain's native token.
 * Handles chain-specific native addresses (e.g. Stable chain uses 0x0000...1000).
 */
export function getNativeTokenId(chainId: number): string {
  const config = getChainConfig(chainId);
  const address = config?.nativeAsset.address ?? NATIVE_ASSET_ADDRESS;
  return tokenId(chainId, address);
}

/**
 * Get the canonical composite token key for a chain's wrapped native token.
 * e.g. WETH on Ethereum, WBNB on BSC, WXPL on Plasma, wRBTC on Rootstock.
 */
export function getWrappedTokenId(chainId: number): string {
  const config = getChainConfig(chainId);
  const address = config?.wrappedAsset.address ?? '';
  return tokenId(chainId, address);
}

/**
 * Check if tokenA → tokenB is a wrap operation (native → wrapped).
 * Works for all chains: ETH→WETH, BNB→WBNB, XPL→WXPL, rBTC→wRBTC, etc.
 *
 * Returns false when native and wrapped are the same token (e.g. Stable chain
 * where USDT0 serves as both — wrapping/unwrapping is not applicable).
 */
export function isWrappingPair(
  tokenA: { address: string; chainId: number },
  tokenB: { address: string; chainId: number },
): boolean {
  if (tokenA.chainId !== tokenB.chainId) return false;
  const config = getChainConfig(tokenA.chainId);
  // If native === wrapped (e.g. Stable/USDT0), wrapping doesn't apply
  if (
    config &&
    config.nativeAsset.address.toLowerCase() ===
      config.wrappedAsset.address.toLowerCase()
  ) {
    return false;
  }
  return (
    isGasToken(tokenA) && isWrappedAssetAddress(tokenB.address, tokenA.chainId)
  );
}

/**
 * Check if tokenA → tokenB is an unwrap operation (wrapped → native).
 * Works for all chains: WETH→ETH, WBNB→BNB, WXPL→XPL, wRBTC→rBTC, etc.
 *
 * Returns false when native and wrapped are the same token (e.g. Stable chain
 * where USDT0 serves as both — wrapping/unwrapping is not applicable).
 */
export function isUnwrappingPair(
  tokenA: { address: string; chainId: number },
  tokenB: { address: string; chainId: number },
): boolean {
  if (tokenA.chainId !== tokenB.chainId) return false;
  const config = getChainConfig(tokenA.chainId);
  // If native === wrapped (e.g. Stable/USDT0), unwrapping doesn't apply
  if (
    config &&
    config.nativeAsset.address.toLowerCase() ===
      config.wrappedAsset.address.toLowerCase()
  ) {
    return false;
  }
  return (
    isWrappedAssetAddress(tokenA.address, tokenA.chainId) && isGasToken(tokenB)
  );
}

// API response types (unchanged)
export interface ChainApiResponse {
  address: string;
  chainId: number;
  chainKey: string;
  eid: number;
}
