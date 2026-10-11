# Retry backoff

Outbound calls (LLM providers, GitHub) go through `withRetry` in
`server/src/platform/resilience.ts`. The wait between attempts comes from
`backoffDelay(attempt, base, cap)` in `server/src/platform/backoff.ts`:

- exponential: `base · 2^attempt`;
- capped at `cap` (default `8s`);
- plus up to `base` of random jitter, so parallel callers do not retry in lockstep.

Durations accept milliseconds or `ms`-style strings (`"250ms"`, `"8s"`).
