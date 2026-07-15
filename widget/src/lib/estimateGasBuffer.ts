import { getClient, getChainConfig } from '../internal';

const CHAIN_MIN_GAS_BUFFER: Record<number, number> = {
  1:     0.001,      // Ethereum L1 — ~$2 at $2k/ETH, simulation usually exceeds this
  42161: 0.00005,    // Arbitrum — wallet needs headroom beyond on-chain cost
  10:    0.00005,    // Optimism — wallet needs headroom beyond on-chain cost
  8453:  0.00005,    // Base — wallet needs headroom beyond on-chain cost
  56:    0.00005,    // BSC — swap ~$0.013 (BNB)
  143:   0.001,      // Monad — 103 gwei but MON is cheap, swap ~$0.0005
  988:   0.000001,   // Stable — USDT0 native, negligible
  9745:  0.00001,    // Plasma — XPL, negligible
  4326:  0.00005,    // MegaETH — cheap but wallet needs headroom
  30:    0.000005,   // Rootstock — rBTC, inactive
};
const DEFAULT_MIN_GAS_BUFFER = 0.0001;

const FALLBACK_GAS_LIMIT = 150_000n;
const SAFETY_MULTIPLIER = 3n;
const SAFETY_DIVISOR = 1n;

export async function estimateGasBuffer(
  chainId: number,
  userAddress?: string,
  balanceRaw?: string,
): Promise<number> {
  const minBuffer = CHAIN_MIN_GAS_BUFFER[chainId] ?? DEFAULT_MIN_GAS_BUFFER;
  try {
    const client = getClient(chainId);
    const gasPrice = await client.getGasPrice();

    let gasEstimate = FALLBACK_GAS_LIMIT;
    let estimateSource = 'fallback';

    if (userAddress && balanceRaw) {
      const config = getChainConfig(chainId);
      const wrappedAddress = config?.wrappedAsset?.address;
      if (wrappedAddress) {
        try {
          gasEstimate = await client.estimateGas({
            account: userAddress as `0x${string}`,
            to: wrappedAddress as `0x${string}`,
            value: BigInt(balanceRaw),
          });
          estimateSource = 'simulation';
        } catch {
          estimateSource = 'fallback (simulation failed)';
        }
      }
    }

    const gasCost = (gasPrice * gasEstimate * SAFETY_MULTIPLIER) / SAFETY_DIVISOR;
    const estimated = Number(gasCost) / 1e18;
    const result = Math.max(estimated, minBuffer);

    return result;
  } catch {
    return minBuffer;
  }
}
