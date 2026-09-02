/** Relay's internal chain ID for Solana mainnet. */
export const SOLANA_CHAIN_ID = 792703809;

/** Returns `true` when the chain ID corresponds to Solana on Relay. */
export function isSolanaChain(chainId: number): boolean {
  return chainId === SOLANA_CHAIN_ID;
}

const BASE58_ALPHABET = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Validates a Solana address (base58-encoded, 32–44 characters, case-sensitive).
 * Does NOT decode the base58 or verify the public key curve — this is a fast
 * format check suitable for UI/quote-time gating.
 */
export function isSolanaAddress(address: string): boolean {
  return address.length >= 32 && address.length <= 44 && BASE58_ALPHABET.test(address);
}

/** Validates an EVM address (0x-prefixed, 40 hex characters, case-insensitive). */
export function isEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}
