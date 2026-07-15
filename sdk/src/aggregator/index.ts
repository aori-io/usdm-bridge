import type { NormalizedQuote, QuoteRequestInput, Venue } from '../venues/types';
import { type QuoteComparator, assertComparableOutputs, byGrossOutputDesc } from './compare';
import { NoQuotesError, type VenueError } from './errors';
import { type VenueTask, settleWithDeadline } from './timeout';

/** Default per-venue timeout (ms). */
export const DEFAULT_PER_VENUE_TIMEOUT_MS = 7_000;
/** Default overall aggregation deadline (ms). */
export const DEFAULT_OVERALL_DEADLINE_MS = 9_000;

export interface GetQuotesOptions {
  /** Per-venue timeout (ms). Default 7000. */
  perVenueTimeoutMs?: number;
  /** Overall soft deadline (ms). Default 9000. */
  overallDeadlineMs?: number;
  /** Custom comparator for ranking quotes best-first. Default: gross output desc. */
  compareQuotes?: QuoteComparator;
  /** Streaming callback fired for each quote as it arrives (before final sort). */
  onQuote?: (quote: NormalizedQuote) => void;
  /** External abort signal — cancels the whole aggregation. */
  signal?: AbortSignal;
}

export interface GetQuotesResult {
  /** Quotes sorted best-first by the active comparator. */
  quotes: NormalizedQuote[];
  /** Per-venue failures (timeouts, no-route, network, …). */
  errors: VenueError[];
}

/**
 * Request quotes from every venue in parallel with bounded per-venue timeouts
 * and an overall deadline. Always resolves with partial results — a slow or
 * failing venue never blocks the others. Quotes are returned sorted best-first.
 */
export async function getQuotes(
  venues: Venue[],
  input: QuoteRequestInput,
  opts: GetQuotesOptions = {},
): Promise<GetQuotesResult> {
  const compare = opts.compareQuotes ?? byGrossOutputDesc;

  const tasks: VenueTask[] = venues.map((venue) => ({
    venue: venue.id,
    run: (signal: AbortSignal) => venue.requestQuote(input, { signal }),
  }));

  const { quotes, errors } = await settleWithDeadline(tasks, {
    perVenueTimeoutMs: opts.perVenueTimeoutMs ?? DEFAULT_PER_VENUE_TIMEOUT_MS,
    overallDeadlineMs: opts.overallDeadlineMs ?? DEFAULT_OVERALL_DEADLINE_MS,
    ...(opts.onQuote ? { onQuote: opts.onQuote } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  assertComparableOutputs(quotes);
  quotes.sort(compare);

  return { quotes, errors };
}

/**
 * Convenience over {@link getQuotes}: returns the single best quote. Throws
 * {@link NoQuotesError} (carrying the per-venue errors) when nothing came back.
 */
export async function getBestQuote(
  venues: Venue[],
  input: QuoteRequestInput,
  opts: GetQuotesOptions = {},
): Promise<NormalizedQuote> {
  const { quotes, errors } = await getQuotes(venues, input, opts);
  const best = quotes[0];
  if (!best) throw new NoQuotesError(errors);
  return best;
}

export { bridgeQuote } from './bridge';
export type { BridgeQuoteParams, BridgeQuoteResult } from './bridge';
export { byGrossOutputDesc, assertComparableOutputs } from './compare';
export type { QuoteComparator } from './compare';
export { NoQuotesError, QuoteVenueError } from './errors';
export type { VenueError } from './errors';
export { settleWithDeadline, withTimeout } from './timeout';
export type { VenueTask, SettleWithDeadlineOptions, SettleWithDeadlineResult } from './timeout';
