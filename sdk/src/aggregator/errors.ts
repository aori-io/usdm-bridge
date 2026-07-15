import type { VenueId } from '../venues/types';

/** A single venue's failure during aggregation (timeout, no route, network, …). */
export interface VenueError {
  venue: VenueId;
  error: Error;
}

/** Wraps a single venue error with its venue id. */
export class QuoteVenueError extends Error {
  readonly venue: VenueId;
  readonly cause?: unknown;
  constructor(venue: VenueId, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Venue "${venue}" quote failed: ${message}`);
    this.name = 'QuoteVenueError';
    this.venue = venue;
    this.cause = cause;
  }
}

/** Thrown by `getBestQuote` when no venue returned a quote. */
export class NoQuotesError extends Error {
  /** Per-venue errors collected during aggregation. */
  readonly errors: VenueError[];
  constructor(errors: VenueError[] = []) {
    const detail = errors.length ? ` (${errors.map((e) => `${e.venue}: ${e.error.message}`).join('; ')})` : '';
    super(`No quotes available from any venue${detail}`);
    this.name = 'NoQuotesError';
    this.errors = errors;
  }
}
