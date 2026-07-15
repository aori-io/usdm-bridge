import type { Aori, OrderStatus, QuoteResponse } from '@aori/aori-ts';
import type { SdkEnvironment } from '../../api/environment';
import { getAoriClient } from '../../client/aoriClient';
import { requestQuote } from '../../api/quotes';
import { pollOrderStatus } from '../../api/status';
import { type ExecutionStep, executeSwap } from '../../swap/execute';
import type {
  AggregatedStatus,
  ExecuteQuoteParams,
  ExecuteQuoteResult,
  GetTokenPriceParams,
  GetTokensParams,
  NormalizedQuote,
  PollAggregatedStatusOptions,
  QuoteExecutionStep,
  QuoteRequestInput,
  TokenMetadata,
  Venue,
  VenueId,
} from '../types';
import { getAoriTokenPrice, getAoriTokens } from './tokens';

export interface AoriVenueOptions {
  /** Default single-quote request timeout (ms). */
  quoteTimeoutMs?: number;
  /** Default poll interval (ms) for `pollStatus`. */
  pollingIntervalMs?: number;
  /** Default poll deadline (ms) for `pollStatus`. */
  statusTimeoutMs?: number;
}

/** Map an Aori `ExecutionStep` onto a normalized `QuoteExecutionStep`. */
function mapExecutionStep(step: ExecutionStep, orderHash: string): QuoteExecutionStep | null {
  switch (step.kind) {
    case 'chain-switch':
      return { kind: 'chain-switch', chainId: step.chainId };
    case 'approval-sent':
    case 'approval-reset-sent':
      return { kind: 'approval-sent', hash: step.hash };
    case 'signing':
      return { kind: 'signing' };
    case 'submitted':
      return { kind: 'submitted', quoteId: step.orderHash };
    case 'deposit-sent':
      return { kind: 'transaction-sent', hash: step.hash, chainId: step.chainId };
    case 'done':
      return { kind: 'done', quoteId: orderHash };
    // `approval-skipped` has no normalized equivalent.
    default:
      return null;
  }
}

/** Map an Aori `OrderStatus` onto a normalized `AggregatedStatus`. */
function mapOrderStatus(status: OrderStatus): AggregatedStatus {
  const normalized = status.status.toLowerCase() as AggregatedStatus['status'];
  const txHash = (status as { txHash?: string }).txHash;
  const txUrl = (status as { txUrl?: string }).txUrl;
  return {
    venue: 'aori',
    status: normalized,
    ...(txHash ? { txHash } : {}),
    ...(txUrl ? { txUrl } : {}),
    raw: status,
  };
}

/**
 * Aori venue adapter — a thin wrapper over the existing Aori quote/execute/status
 * primitives. Aori behavior is identical to calling the standalone functions
 * directly; this only re-shapes inputs/outputs to the normalized `Venue` contract.
 */
export class AoriVenue implements Venue {
  readonly id: VenueId = 'aori';
  private readonly env: SdkEnvironment;
  private readonly options: AoriVenueOptions;

  constructor(env: SdkEnvironment, options: AoriVenueOptions = {}) {
    this.env = env;
    this.options = options;
  }

  private client(): Promise<Aori> {
    return getAoriClient(this.env);
  }

  async requestQuote(input: QuoteRequestInput, opts: { signal?: AbortSignal }): Promise<NormalizedQuote> {
    const aori = await this.client();
    const quote: QuoteResponse = await requestQuote(
      {
        srcChainId: input.srcChainId,
        dstChainId: input.dstChainId,
        srcTokenAddress: input.srcTokenAddress,
        dstTokenAddress: input.dstTokenAddress,
        amount: input.amount,
        ...(input.srcTokenDecimals != null ? { srcTokenDecimals: input.srcTokenDecimals } : {}),
        srcWalletAddress: input.srcWalletAddress,
        ...(input.dstWalletAddress != null ? { dstWalletAddress: input.dstWalletAddress } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
      },
      {
        aori,
        ...(this.options.quoteTimeoutMs != null ? { defaultTimeoutMs: this.options.quoteTimeoutMs } : {}),
      },
    );

    const endTime = Number((quote as { endTime?: number }).endTime);
    // Aori reports `estimatedTime` in MILLISECONDS (e.g. "12500" = 12.5s);
    // normalize to seconds so it's comparable with other venues (Relay's
    // `timeEstimate` is already in seconds).
    const estimatedTimeMs = Number(quote.estimatedTime);
    return {
      venue: 'aori',
      quoteId: quote.orderHash,
      srcChainId: input.srcChainId,
      dstChainId: input.dstChainId,
      inputToken: quote.inputToken,
      outputToken: quote.outputToken,
      inputAmount: String(quote.inputAmount),
      outputAmount: String(quote.outputAmount),
      ...(Number.isFinite(estimatedTimeMs) && estimatedTimeMs > 0
        ? { estimatedTimeSec: estimatedTimeMs / 1000 }
        : {}),
      ...(Number.isFinite(endTime) && endTime > 0 ? { expiresAt: endTime * 1000 } : {}),
      receivedAt: Date.now(),
      raw: quote,
    };
  }

  async executeQuote(quote: NormalizedQuote, params: ExecuteQuoteParams): Promise<ExecuteQuoteResult> {
    const aori = await this.client();
    const raw = quote.raw as QuoteResponse;

    const result = await executeSwap(
      {
        quote: raw,
        walletClient: params.walletClient,
        ...(params.userAddress != null ? { userAddress: params.userAddress } : {}),
        ...(params.onStep
          ? {
              onStep: (step: ExecutionStep) => {
                const mapped = mapExecutionStep(step, quote.quoteId);
                if (mapped) params.onStep?.(mapped);
              },
            }
          : {}),
        ...(params.onTxHash ? { onTxHash: (hash: string, kind: string) => params.onTxHash?.(hash, kind) } : {}),
        ...(params.validateBeforeSubmit ? { validateBeforeSubmit: params.validateBeforeSubmit } : {}),
        ...(params.skipChainSwitch ? { skipChainSwitch: params.skipChainSwitch } : {}),
        ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      },
      { env: this.env, aori },
    );

    return {
      venue: 'aori',
      quoteId: result.orderHash,
      txHashes: result.txHashes,
      ...(result.signature ? { signature: result.signature } : {}),
      isNativeDeposit: result.isNativeDeposit,
    };
  }

  async pollStatus(quote: NormalizedQuote, opts: PollAggregatedStatusOptions): Promise<AggregatedStatus> {
    const aori = await this.client();
    const status = await pollOrderStatus(quote.quoteId, aori, {
      interval: opts.interval ?? this.options.pollingIntervalMs ?? 4_000,
      timeout: opts.timeout ?? this.options.statusTimeoutMs ?? 300_000,
      ...(opts.signal ? { signal: opts.signal } : {}),
      ...(opts.onStatusChange
        ? { onStatusChange: (s: OrderStatus) => opts.onStatusChange?.(mapOrderStatus(s)) }
        : {}),
    });
    return mapOrderStatus(status);
  }

  /** Aori token metadata + prices from `GET /tokens?metadata=true`. */
  async getTokens(params: GetTokensParams = {}): Promise<TokenMetadata[]> {
    return getAoriTokens(this.env, params);
  }

  /** Single-token USD price from the Aori registry (`null` if not listed). */
  async getTokenPrice(params: GetTokenPriceParams): Promise<number | null> {
    return getAoriTokenPrice(this.env, params);
  }
}
