import type { NormalizedQuote } from '../venues/types';

/**
 * A comparator over normalized quotes, used to sort best-first. Follows the
 * `Array.prototype.sort` contract: negative if `a` ranks before `b`.
 */
export type QuoteComparator = (a: NormalizedQuote, b: NormalizedQuote) => number;

/**
 * Default comparator: highest **gross destination output** first (raw
 * `outputAmount`), tie-broken by faster ETA (`estimatedTimeSec` ascending).
 *
 * Assumption: all quotes for a given request share the same output token and
 * decimals (true for the USDM use case). Comparing raw `outputAmount` across
 * different output decimals is meaningless — guard upstream with
 * {@link assertComparableOutputs}.
 */
export const byGrossOutputDesc: QuoteComparator = (a, b) => {
  let av: bigint;
  let bv: bigint;
  try {
    av = BigInt(a.outputAmount);
  } catch {
    av = 0n;
  }
  try {
    bv = BigInt(b.outputAmount);
  } catch {
    bv = 0n;
  }
  if (av > bv) return -1;
  if (av < bv) return 1;

  // Tie-break: faster ETA first (unknown ETA sorts last).
  const at = a.estimatedTimeSec ?? Number.POSITIVE_INFINITY;
  const bt = b.estimatedTimeSec ?? Number.POSITIVE_INFINITY;
  if (at < bt) return -1;
  if (at > bt) return 1;
  return 0;
};

/**
 * Dev-time guard: warns when quotes carry different output tokens, which would
 * make a gross-output comparison meaningless. Does not throw — aggregation is
 * best-effort and the caller may use a custom comparator.
 */
export function assertComparableOutputs(quotes: NormalizedQuote[]): void {
  if (quotes.length < 2) return;
  const first = quotes[0]!.outputToken.toLowerCase();
  const mixed = quotes.some((q) => q.outputToken.toLowerCase() !== first);
  if (mixed && typeof console !== 'undefined') {
    console.warn(
      '[usdm-bridge-sdk] Aggregated quotes have differing output tokens; the ' +
        'default gross-output comparator assumes identical output token/decimals. ' +
        'Provide a custom `compareQuotes` if this is intentional.',
    );
  }
}
