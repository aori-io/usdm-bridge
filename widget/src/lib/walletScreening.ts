import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { getRpcUrlsForChain } from '../internal/environment';
import { getChainConfig } from '../internal/chainsConfig';

const CHAINALYSIS_ORACLE_ADDRESS = '0x40C57923924B5c5c5455c48D93317139ADDaC8fb' as const;

const SANCTIONS_ORACLE_ABI = [
  {
    name: 'isSanctioned',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export interface ScreeningResult {
  allowed: boolean;
  source?: 'blacklist' | 'chainalysis-oracle' | 'screening-url';
}

export interface WalletScreeningConfig {
  enabled?: boolean;
  useChainalysisOracle?: boolean;
  screeningUrl?: string;
  blacklist?: string[] | ((address: string) => boolean | Promise<boolean>);
}

/**
 * Check an address against the Chainalysis Sanctions Oracle on Ethereum mainnet.
 * The oracle is a free, permissionless smart contract maintained by Chainalysis
 * that checks addresses against the OFAC SDN list.
 *
 * Always queries mainnet regardless of which chain the user is swapping on —
 * sanctions apply to the address itself, not per-chain.
 */
async function checkChainalysisOracle(address: string): Promise<boolean> {
  const ethConfig = getChainConfig(1);
  const rpcUrls = getRpcUrlsForChain(1, ethConfig?.rpcUrls ?? []);

  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrls[0]),
  });

  try {
    return await (client as any).readContract({
      address: CHAINALYSIS_ORACLE_ADDRESS,
      abi: SANCTIONS_ORACLE_ABI,
      functionName: 'isSanctioned',
      args: [address as `0x${string}`],
    }) as boolean;
  } catch {
    // Fail open on RPC errors — don't block users due to infrastructure issues.
    // Layer 2 (screeningUrl) can provide a more resilient server-side check.
    return false;
  }
}

/**
 * Check an address against an integrator-provided screening endpoint.
 * Expects GET ?address=0x... returning { allowed: boolean }.
 */
async function checkScreeningUrl(
  screeningUrl: string,
  address: string,
): Promise<boolean> {
  try {
    const separator = screeningUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${screeningUrl}${separator}address=${address}`);
    if (!res.ok) return true;
    const data: { allowed?: boolean } = await res.json();
    return data.allowed !== false;
  } catch {
    return true;
  }
}

async function checkBlacklist(
  blacklist: NonNullable<WalletScreeningConfig['blacklist']>,
  address: string,
): Promise<boolean> {
  try {
    if (Array.isArray(blacklist)) {
      return blacklist.some((a) => a.toLowerCase() === address.toLowerCase());
    }
    return await blacklist(address);
  } catch {
    return false;
  }
}

/**
 * Run all configured screening checks against a wallet address.
 * Blacklist runs first (skips Layer 1/2 if matched), then Layer 1, then Layer 2.
 * Returns { allowed: false, source } if any check flags the address.
 */
export async function screenWallet(
  address: string,
  config?: WalletScreeningConfig,
): Promise<ScreeningResult> {
  if (config?.enabled === false) return { allowed: true };

  if (config?.blacklist) {
    const isBlacklisted = await checkBlacklist(config.blacklist, address);
    if (isBlacklisted) {
      return { allowed: false, source: 'blacklist' };
    }
  }

  if (config?.useChainalysisOracle !== false) {
    const isSanctioned = await checkChainalysisOracle(address);
    if (isSanctioned) {
      return { allowed: false, source: 'chainalysis-oracle' };
    }
  }

  if (config?.screeningUrl) {
    const allowed = await checkScreeningUrl(config.screeningUrl, address);
    if (!allowed) {
      return { allowed: false, source: 'screening-url' };
    }
  }

  return { allowed: true };
}
