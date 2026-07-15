import type { NormalizedQuote, VenueId } from '../venues/types';
import type { VenueError } from './errors';

/**
 * Race a promise against a timeout. Rejects with a timeout error after `ms`.
 * Optionally aborts the provided controller so the underlying work is cancelled.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** A single unit of aggregation work, keyed by its venue. */
export interface VenueTask {
  venue: VenueId;
  run: (signal: AbortSignal) => Promise<NormalizedQuote>;
}

export interface SettleWithDeadlineOptions {
  /** Per-venue timeout (ms). Each task is aborted after this window. */
  perVenueTimeoutMs: number;
  /** Overall soft deadline (ms). Resolves with whatever completed by then. */
  overallDeadlineMs: number;
  /** Called for each quote as soon as it arrives (streaming). */
  onQuote?: (quote: NormalizedQuote) => void;
  /** External abort signal — aborts all tasks and resolves early. */
  signal?: AbortSignal;
}

export interface SettleWithDeadlineResult {
  quotes: NormalizedQuote[];
  errors: VenueError[];
}

/**
 * Run each venue task under its own `AbortController` + per-venue timeout, and an
 * overall soft deadline. Always resolves (never rejects) with whatever succeeded
 * by the time all tasks settle or the deadline fires — a slow or failing venue
 * never blocks the others.
 */
export function settleWithDeadline(
  tasks: VenueTask[],
  opts: SettleWithDeadlineOptions,
): Promise<SettleWithDeadlineResult> {
  const { perVenueTimeoutMs, overallDeadlineMs, onQuote, signal } = opts;
  const quotes: NormalizedQuote[] = [];
  const errors: VenueError[] = [];

  return new Promise<SettleWithDeadlineResult>((resolve) => {
    if (tasks.length === 0) {
      resolve({ quotes, errors });
      return;
    }

    const controllers: { controller: AbortController; done: boolean }[] = [];
    let finished = false;
    let settledCount = 0;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (signal) signal.removeEventListener('abort', finish);
      for (const entry of controllers) {
        if (!entry.done) {
          try {
            entry.controller.abort();
          } catch {
            /* noop */
          }
        }
      }
      resolve({ quotes, errors });
    };

    if (signal) {
      if (signal.aborted) {
        finish();
        return;
      }
      signal.addEventListener('abort', finish, { once: true });
    }

    deadlineTimer = setTimeout(finish, overallDeadlineMs);

    for (const task of tasks) {
      const controller = new AbortController();
      const entry = { controller, done: false };
      controllers.push(entry);

      const timer = setTimeout(() => {
        try {
          controller.abort(new Error(`Venue "${task.venue}" timed out after ${perVenueTimeoutMs}ms`));
        } catch {
          /* noop */
        }
      }, perVenueTimeoutMs);

      const onExternalAbort = (): void => {
        try {
          controller.abort();
        } catch {
          /* noop */
        }
      };
      if (signal) signal.addEventListener('abort', onExternalAbort, { once: true });

      task
        .run(controller.signal)
        .then((quote) => {
          if (finished) return;
          quotes.push(quote);
          try {
            onQuote?.(quote);
          } catch {
            /* consumer callback errors must never break aggregation */
          }
        })
        .catch((error) => {
          if (finished) return;
          errors.push({
            venue: task.venue,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        })
        .finally(() => {
          entry.done = true;
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', onExternalAbort);
          settledCount += 1;
          if (settledCount === tasks.length) finish();
        });
    }
  });
}
