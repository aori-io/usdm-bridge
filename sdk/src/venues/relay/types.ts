/**
 * Minimal Relay API types covering the fields the SDK consumes. Relay returns a
 * much larger payload; we only model what quoting, execution, and status need.
 * See https://docs.relay.link/references/api/get-quote-v2.
 */

export type RelayTradeType = 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'EXPECTED_OUTPUT';

export interface RelayQuoteRequestBody {
  user: string;
  recipient?: string;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;
  destinationCurrency: string;
  /** Raw amount in smallest units. */
  amount: string;
  tradeType: RelayTradeType;
  referrer?: string;
}

export interface RelayCurrencyMetadata {
  logoURI?: string;
  verified?: boolean;
  isNative?: boolean;
}

export interface RelayCurrency {
  chainId?: number;
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  metadata?: RelayCurrencyMetadata;
}

export interface RelayCurrencyAmount {
  currency?: RelayCurrency;
  /** Raw amount in smallest units. */
  amount?: string;
  amountFormatted?: string;
  amountUsd?: string;
  minimumAmount?: string;
}

export interface RelayImpact {
  usd?: string;
  percent?: string;
}

export interface RelayQuoteDetails {
  operation?: string;
  sender?: string;
  recipient?: string;
  currencyIn?: RelayCurrencyAmount;
  currencyOut?: RelayCurrencyAmount;
  totalImpact?: RelayImpact;
  swapImpact?: RelayImpact;
  rate?: string;
  timeEstimate?: number;
}

/** EIP-712 / EIP-191 signing payload embedded in a signature step item. */
export interface RelaySignData {
  signatureKind: 'eip712' | 'eip191';
  domain?: Record<string, unknown>;
  types?: Record<string, unknown>;
  primaryType?: string;
  value?: Record<string, unknown>;
  message?: unknown;
}

/** Where to submit the signature after signing a signature step. */
export interface RelayPostData {
  endpoint: string;
  method: string;
  body?: unknown;
}

/** Poll endpoint to confirm a step item completed. */
export interface RelayStepItemCheck {
  endpoint: string;
  method: string;
}

/** A single Solana instruction account reference. */
export interface RelaySolanaInstructionKey {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

/** A Solana instruction as returned by Relay on SVM transaction steps. */
export interface RelaySolanaInstruction {
  programId: string;
  /** Hex-encoded instruction data. */
  data: string;
  keys: RelaySolanaInstructionKey[];
}

export interface RelayStepItemData {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  chainId?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gas?: string;
  /**
   * Present on Solana (SVM) transaction step items instead of `to`/`data`/
   * `value`. Relay omits `chainId` on these, so the presence of this field is
   * the marker that a step must be executed via a Solana wallet.
   */
  instructions?: RelaySolanaInstruction[];
  /** Address lookup tables used to compress the Solana v0 message. */
  addressLookupTableAddresses?: string[];
  /** Present on signature step items. */
  sign?: RelaySignData;
  /** Present on signature step items — where to submit the signature. */
  post?: RelayPostData;
}

export interface RelayStepItem {
  status?: 'complete' | 'incomplete';
  data?: RelayStepItemData;
  check?: RelayStepItemCheck;
}

export interface RelayStep {
  id: string;
  action?: string;
  description?: string;
  kind: 'transaction' | 'signature';
  requestId?: string;
  depositAddress?: string;
  items: RelayStepItem[];
}

export interface RelayQuoteResponse {
  steps: RelayStep[];
  fees?: unknown;
  details?: RelayQuoteDetails;
}

/** Relay `/intents/status/v3` response. */
export interface RelayStatusResponse {
  /**
   * `unknown` is returned for an intent that has not been indexed yet (e.g.
   * immediately after the deposit tx, or for an unknown requestId). It is
   * treated as non-terminal (keep polling).
   */
  status:
    | 'refund'
    | 'waiting'
    | 'depositing'
    | 'failure'
    | 'pending'
    | 'submitted'
    | 'success'
    | 'delayed'
    | 'unknown';
  details?: string;
  inTxHashes?: string[];
  txHashes?: string[];
  updatedAt?: number;
  originChainId?: number;
  destinationChainId?: number;
  quoteCreatedAt?: number;
}
