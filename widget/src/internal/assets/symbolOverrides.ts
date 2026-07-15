/**
 * Symbol-specific token image overrides.
 * Used when API icon is broken or null.
 * Keys are case-sensitive to handle symbols like USDe vs USDE.
 */
export const SYMBOL_OVERRIDES: Record<string, string> = {
  WM: 'https://dashboard.m0.org/img/extensions/wm.svg',
  USDT: 'https://token-media.defined.fi/8453_0xfde4c96c8593536e31f229ea8f37b2ada2699bb2_1756863870_large.png',
  USDT0: 'https://s2.coinmarketcap.com/static/img/coins/64x64/38517.png',
  WETH: 'https://coin-images.coingecko.com/coins/images/31013/large/wrapped-eth-mantle-bridge.png',
  ARBITRUM:
    'https://token-media.defined.fi/42161_0x912ce59144191c1204e64559fe8253a0e49e6548_large.png',
  OP: 'https://token-media.defined.fi/10_0x4200000000000000000000000000000000000042_large.png',
  BNB: 'https://bscscan.com/token/images/bnbchain2_32.png',
  USDE: 'https://token-media.defined.fi/1_0x4c9edd5852cd905f086c759e8383e09bff1e68b3_1761141679_large.png',
  USDe: 'https://token-media.defined.fi/1_0x4c9edd5852cd905f086c759e8383e09bff1e68b3_1761141679_large.png',
  MON: 'https://token-media.defined.fi/143_0x3bd359c1119da7da1d913d1c4d2b7c461115433a_large_small_thumb_150a1368-be39-4209-99f1-f78a7d3c1192.png',
  WSOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  XAUT0:
    'https://tokens.1inch.io/0x68749665ff8d2d112fa859aa293f07a622782f38.png',
  ZRO: 'https://token-media.defined.fi/42161_0x6985884c4392d348587b19cb9eaaf157f13271cd_large.png',
  WSTETH:
    'https://token-media.defined.fi/10_0x1f32b1c2345538c0c6f582fcb022739c4a194ebb_large.png',
  'USDC.E':
    'https://token-media.defined.fi/10_0x7f5c764cbc14f9669b88837ca1490cca17c31607_large.png',
  XPL: 'https://raw.githubusercontent.com/PlasmaLaboratories/plasma-tokenlist/main/logos/9745/XPL.svg',
  XAUT: 'https://tokens.1inch.io/0x68749665ff8d2d112fa859aa293f07a622782f38.png',
  PENDLE:
    'https://token-media.defined.fi/1_0x808507121b80c02388fad14726482e061b8da827_large.png',
  USDC: 'https://token-media.defined.fi/42161_0xaf88d065e77c8cc2239327c5edb3a432268e5831_large.png',
  EURC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png',
  CRVUSD:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E/logo.png',
  CRV: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png',
  DAI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
  STABLE: 'https://s2.coinmarketcap.com/static/img/coins/64x64/38892.png',
  MEGA: 'https://s2.coinmarketcap.com/static/img/coins/64x64/38770.png',
  USDM: 'https://s2.coinmarketcap.com/static/img/coins/64x64/38774.png',
  U: "https://bscscan.com/token/images/unitedstables_64.png",
};

export const getSymbolOverride = (symbol: string): string | undefined =>
  SYMBOL_OVERRIDES[symbol] ?? SYMBOL_OVERRIDES[symbol.toUpperCase()];
