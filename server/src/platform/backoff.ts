import ms from 'ms';

/** A duration as milliseconds or an `ms`-style string ("250ms", "8s"). */
export type Duration = number | string;

const toMs = (d: Duration): number => (typeof d === 'number' ? d : ms(d));

/**
 * Exponential backoff with jitter for outbound retries: base · 2^attempt,
 * capped at `cap`, plus up to `base` of random jitter so parallel callers
 * don't retry in lockstep.
 */
export function backoffDelay(attempt: number, base: Duration = '250ms', cap: Duration = '8s'): number {
  const baseMs = toMs(base);
  const capMs = toMs(cap);
  return Math.max(capMs, baseMs * 2 ** attempt) + Math.random() * baseMs;
}
