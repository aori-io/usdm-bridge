import { type Address, type WalletClient } from 'viem';
import { signTypedData } from 'viem/actions';
import type { Aori, QuoteResponse, TypedDataSigner } from '@aori/aori-ts';
import { isUserRejectionError } from '../errors';
import { type SwapWalletClient } from './walletClient';

/**
 * Adapts a viem-style `SwapWalletClient` into the `@aori/aori-ts`
 * `TypedDataSigner` interface, injecting the signing account.
 */
export function toTypedDataSigner(walletClient: SwapWalletClient, userAddress: string): TypedDataSigner {
  return {
    signTypedData: (typedData) =>
      signTypedData(walletClient as WalletClient, {
        account: userAddress as Address,
        ...(typedData as object),
      } as Parameters<typeof signTypedData>[1]),
  };
}

/**
 * Signs an Aori order (EIP-712) with the given wallet client. The caller is
 * responsible for ensuring the wallet is on the input chain first.
 */
export async function signOrder(params: {
  quote: QuoteResponse;
  walletClient: SwapWalletClient;
  userAddress: string;
  aori: Aori;
}): Promise<{ orderHash: string; signature: string }> {
  const { quote, walletClient, userAddress, aori } = params;
  try {
    return await aori.signReadableOrder(quote, toTypedDataSigner(walletClient, userAddress), userAddress);
  } catch (error) {
    if (isUserRejectionError(error)) {
      throw new Error('User rejected the signing request');
    }
    throw error;
  }
}
