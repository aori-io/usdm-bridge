import { isEvmAddress, isSolanaAddress, isSolanaChain } from './solana';

export class CrossChainAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossChainAddressError';
  }
}

/**
 * Validates that `userAddress` and `recipientAddress` match the address format
 * expected by their respective chains. Throws a descriptive
 * {@link CrossChainAddressError} on mismatch.
 *
 * Rules:
 * - Origin is Solana → `userAddress` must be a Solana address.
 * - Destination is Solana → `recipientAddress` must be a Solana address.
 * - Origin is EVM → `userAddress` must be an EVM address.
 * - Destination is EVM → `recipientAddress` must be an EVM address.
 */
export function validateCrossChainAddresses(
  originChainId: number,
  destChainId: number,
  userAddress: string,
  recipientAddress?: string,
): void {
  if (isSolanaChain(originChainId)) {
    if (!isSolanaAddress(userAddress)) {
      throw new CrossChainAddressError(
        `Origin chain is Solana but the user address "${userAddress}" is not a valid Solana address.`,
      );
    }
  } else if (!isEvmAddress(userAddress)) {
    throw new CrossChainAddressError(
      `Origin chain (${originChainId}) is EVM but the user address "${userAddress}" is not a valid EVM address.`,
    );
  }

  if (recipientAddress) {
    if (isSolanaChain(destChainId)) {
      if (!isSolanaAddress(recipientAddress)) {
        throw new CrossChainAddressError(
          `Destination chain is Solana but the recipient address "${recipientAddress}" is not a valid Solana address. ` +
            'Swapping to Solana requires a Solana wallet address as the recipient.',
        );
      }
    } else if (!isEvmAddress(recipientAddress)) {
      throw new CrossChainAddressError(
        `Destination chain (${destChainId}) is EVM but the recipient address "${recipientAddress}" is not a valid EVM address.`,
      );
    }
  }
}
