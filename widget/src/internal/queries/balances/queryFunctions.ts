import {
  createPublicClient,
  http,
  fallback,
  erc20Abi,
  encodeFunctionData,
  decodeFunctionResult,
  type Address,
  type PublicClient,
  parseAbi,
} from 'viem';
import { getChainConfig, isNativeAssetAddress, type StaticChainConfig } from '../../chainsConfig';
import { getRpcUrlsForChain } from '../../environment';
import type { WalletBalanceItem, WalletBalanceResponse } from '../../types';

export interface SwapBalanceRequest {
  address: string;
  tokens: Array<{ chainId: number; tokenAddress: string }>;
}

export type { WalletBalanceItem, WalletBalanceResponse };

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;
const MULTICALL3_ABI = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calldata calls) payable returns (Result[] memory returnData)',
]);
const BATCH_SIZE = 20;

function getChainStaticConfig(chainId: number): StaticChainConfig | undefined {
  // Merged view: curated static chains + runtime Relay-registered chains.
  return getChainConfig(chainId);
}

// Annotated with the public `PublicClient` type (rather than viem's inferred
// `PublicClient<FallbackTransport, ...>`) so the emitted declaration is
// portable — the inferred type references a viem-internal transport path and
// trips TS2742 during `.d.ts` emit.
export function getClient(chainId: number): PublicClient {
  const chainConfig = getChainStaticConfig(chainId);
  if (!chainConfig?.rpcUrls[0]) throw new Error(`No RPC for chain ${chainId}`);
  const urls = getRpcUrlsForChain(chainId, chainConfig.rpcUrls);
  const transport = fallback(
    urls.map((url) => http(url, { retryCount: 0, timeout: 10_000 })),
  );
  const client = createPublicClient({
    chain: chainConfig.wagmiChain,
    transport,
  });
  return client as unknown as PublicClient;
}

async function fetchNativeBalance(
  address: string,
  chainId: number,
): Promise<WalletBalanceItem | null> {
  try {
    const client = getClient(chainId);
    const balance = await client.getBalance({ address: address as Address });
    if (balance === 0n) return null;
    const chainConfig = getChainStaticConfig(chainId);
    const nativeAddress = chainConfig?.nativeAsset.address ?? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    return {
      chainId,
      token: nativeAddress,
      balance: balance.toString(),
      shiftedBalance: balance.toString(),
    };
  } catch {
    return null;
  }
}

async function fetchErc20BalancesMulticall(
  address: string,
  chainId: number,
  tokenAddresses: string[],
): Promise<WalletBalanceItem[]> {
  if (tokenAddresses.length === 0) return [];

  const client = getClient(chainId);
  const results: WalletBalanceItem[] = [];

  for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
    const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
    const calldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address as Address],
    });

    const calls = batch.map((token) => ({
      target: token as Address,
      allowFailure: true as const,
      callData: calldata,
    }));

    try {
      // Under the package's non-strict tsconfig, viem's `readContract` param
      // conditional types collapse to a broad union and report a spurious
      // `authorizationList` requirement. The strict build config resolves this
      // correctly; @ts-ignore (not @ts-expect-error) keeps both happy.
      // @ts-ignore -- viem readContract params false-positive under non-strict TS
      const response = await client.readContract({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: 'aggregate3',
        args: [calls],
      }) as unknown as Array<{ success: boolean; returnData: `0x${string}` }>;

      for (let j = 0; j < response.length; j++) {
        const { success, returnData } = response[j];
        if (!success || returnData === '0x') continue;
        try {
          const balance = decodeFunctionResult({
            abi: erc20Abi,
            functionName: 'balanceOf',
            data: returnData,
          });
          if (balance === 0n) continue;
          results.push({
            chainId,
            token: batch[j],
            balance: balance.toString(),
            shiftedBalance: balance.toString(),
          });
        } catch { /* skip decode failures */ }
      }
    } catch { /* skip batch failures */ }
  }

  return results;
}

export async function fetchBulkBalances(
  address: string,
  chainIds: number[],
  tokensByChain?: Record<number, string[]>,
): Promise<WalletBalanceResponse> {
  const allBalances: WalletBalanceItem[] = [];

  const promises = chainIds.map(async (chainId) => {
    const erc20Tokens = tokensByChain?.[chainId]?.filter(
      (t) => !isNativeAssetAddress(t),
    ) ?? [];

    const [native, erc20s] = await Promise.all([
      fetchNativeBalance(address, chainId),
      fetchErc20BalancesMulticall(address, chainId, erc20Tokens),
    ]);

    if (native) allBalances.push(native);
    allBalances.push(...erc20s);
  });

  await Promise.all(promises);
  return { balances: allBalances };
}

export async function fetchTokenBalance(
  address: string,
  chainId: number,
  tokenAddress: string,
): Promise<WalletBalanceItem | null> {
  if (isNativeAssetAddress(tokenAddress)) {
    return fetchNativeBalance(address, chainId);
  }

  const results = await fetchErc20BalancesMulticall(address, chainId, [tokenAddress]);
  return results[0] || null;
}

export async function fetchSwapBalances(
  address: string,
  tokens: Array<{ chainId: number; tokenAddress: string }>,
): Promise<WalletBalanceResponse> {
  const balances: WalletBalanceItem[] = [];

  const promises = tokens.map(async ({ chainId, tokenAddress }) => {
    const item = isNativeAssetAddress(tokenAddress)
      ? await fetchNativeBalance(address, chainId)
      : await fetchSingleErc20Balance(address, chainId, tokenAddress);
    if (item) balances.push(item);
  });

  await Promise.all(promises);
  return { balances };
}

async function fetchSingleErc20Balance(
  address: string,
  chainId: number,
  tokenAddress: string,
): Promise<WalletBalanceItem | null> {
  try {
    const client = getClient(chainId);
    // @ts-ignore -- viem readContract params false-positive under non-strict TS
    const balance = await client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address as Address],
    });
    if (balance === 0n) return null;
    return {
      chainId,
      token: tokenAddress,
      balance: balance.toString(),
      shiftedBalance: balance.toString(),
    };
  } catch {
    return null;
  }
}

