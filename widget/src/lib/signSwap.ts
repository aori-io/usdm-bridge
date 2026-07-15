import { getWidgetSdk } from '../internal';
import type { QuoteResponse } from '@aori/aori-ts';
import type { WalletClient } from 'viem';

type SwapWalletClient = WalletClient & {
  switchChain?: (args: { id: number }) => Promise<void>;
  send?: (method: string, params: unknown[]) => Promise<unknown>;
  getChainId?: () => number | Promise<number>;
};

function isUserRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'UserRejectedRequestError' ||
    error.message.includes('User rejected') ||
    error.message.includes('rejected') ||
    error.message.includes('denied') ||
    error.message.includes('cancelled') ||
    error.message.includes('canceled')
  );
}

async function resolveChainId(walletClient: SwapWalletClient): Promise<number | null> {
  if (walletClient.chain?.id) return walletClient.chain.id;
  const result = walletClient.getChainId?.();
  if (result != null) return await result;
  return null;
}

export const ChainSwitch = async (
  walletClient: SwapWalletClient,
  requiredChainId: number,
): Promise<boolean> => {
  try {
    const currentChainId = await resolveChainId(walletClient);
    if (currentChainId === requiredChainId) return true;

    if (walletClient.request) {
      await walletClient.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${requiredChainId.toString(16)}` }],
      });
    } else if (walletClient.switchChain) {
      await walletClient.switchChain({ id: requiredChainId });
    } else if (walletClient.send) {
      await walletClient.send('wallet_switchEthereumChain', [
        { chainId: `0x${requiredChainId.toString(16)}` },
      ]);
    } else {
      throw new Error("Wallet doesn't support chain switching");
    }

    const newChainId = await resolveChainId(walletClient);
    return newChainId === requiredChainId;
  } catch (error) {
    if (isUserRejection(error)) {
      throw new Error('User rejected the chain switch request');
    }
    throw new Error(
      `Please switch your wallet to the required network (Chain ID: ${requiredChainId})`,
    );
  }
};

interface ISignSwapParams {
  quoteResponse: QuoteResponse;
  userAddress: string;
  walletClient: SwapWalletClient;
}

/**
 * Signs the Aori order with EIP-712 via the shared `usdm-bridge-sdk` instance.
 * We switch the wallet to the order's input chain first, then delegate the
 * actual EIP-712 signing to `sdk.signOrder` (which builds the typed data from
 * the cached /domain + /chains info and the quote).
 */
export const SignSwap = async (
  params: ISignSwapParams,
): Promise<{ orderHash: string; signature: string }> => {
  const { quoteResponse, userAddress, walletClient } = params;

  if (!walletClient) throw new Error('Wallet client not available');
  if (!quoteResponse.orderHash) throw new Error('Quote response missing order hash');

  const sdk = getWidgetSdk();
  const aori = await sdk.client();

  try {
    const chainKey = quoteResponse.inputChain?.toLowerCase();
    const inputChainInfo = chainKey ? aori.getChain(chainKey) : undefined;
    if (!inputChainInfo) throw new Error(`Unknown chain: ${quoteResponse.inputChain}`);

    await ChainSwitch(walletClient, inputChainInfo.chainId);

    return await sdk.signOrder(quoteResponse, walletClient as never, userAddress);
  } catch (error) {
    if (isUserRejection(error)) {
      throw new Error('User rejected the signing request');
    }
    if (error instanceof Error && error.message.includes('chain')) {
      throw new Error('Chain switching failed. Please manually switch to the correct network.');
    }
    throw error;
  }
};
