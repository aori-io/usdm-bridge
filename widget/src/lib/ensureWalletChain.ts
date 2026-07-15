'use client';

import { createWalletClient, custom } from 'viem';
import type { Chain, WalletClient } from 'viem';
import { getChainConfig, getViemChainById } from '../internal';

/** Minimal EIP-1193 provider surface we rely on. */
interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
}

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

function isChainNotAddedError(error: unknown): boolean {
  // 4902 = "Unrecognized chain ID" (EIP-3085). Some wallets nest it under `.data`.
  const code = (error as { code?: number; data?: { originalError?: { code?: number } } })?.code;
  const nested = (error as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code;
  return code === 4902 || nested === 4902;
}

/**
 * Ensure the wallet's active chain matches `chainId`, using the wallet's own
 * EIP-1193 provider (not wagmi). This works for chains that aren't in wagmi's
 * frozen config — e.g. Relay-derived chains — by adding them via
 * `wallet_addEthereumChain` when the wallet doesn't recognize them yet.
 */
export async function ensureWalletOnChain(
  provider: Eip1193Provider,
  chainId: number,
): Promise<void> {
  const hexId = toHexChainId(chainId);
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexId }],
    });
    return;
  } catch (error) {
    if (!isChainNotAddedError(error)) throw error;
  }

  // Chain unknown to the wallet — add it, then switch.
  const config = getChainConfig(chainId);
  if (!config) throw new Error(`Unknown chain ${chainId}`);
  const addParams: Record<string, unknown> = {
    chainId: hexId,
    chainName: config.displayName,
    nativeCurrency: {
      name: config.nativeAsset.name,
      symbol: config.nativeAsset.symbol,
      decimals: config.nativeAsset.decimals,
    },
    rpcUrls: config.rpcUrls.length > 0 ? config.rpcUrls : undefined,
    ...(config.blockExplorerUrls.length > 0
      ? { blockExplorerUrls: config.blockExplorerUrls }
      : {}),
  };
  await provider.request({ method: 'wallet_addEthereumChain', params: [addParams] });
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: hexId }],
  });
}

/**
 * Build a viem wallet client bound to `chainId` from the wallet's provider.
 * Used as a wagmi-independent execution client so swaps can run on chains that
 * aren't part of wagmi's static config.
 */
export function buildWalletClientForChain(
  provider: Eip1193Provider,
  account: string,
  chainId: number,
): WalletClient {
  const chain = getViemChainById()[chainId] as Chain | undefined;
  return createWalletClient({
    account: account as `0x${string}`,
    ...(chain ? { chain } : {}),
    transport: custom(provider),
  });
}
