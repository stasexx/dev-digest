# Insights — e2e

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- **2026-09-20** — `./scripts/e2e.sh` needs the `agent-browser` CLI on PATH; it is NOT an npm dependency of `e2e/`. Without it every step fails with `spawn agent-browser ENOENT` and the summary reads `0/7 flows passed` — an environment failure, not a regression. Evidence: `e2e/run.ts:4`.
- **2026-09-20** — Default hermetic Postgres port 5433 may already be taken on a shared box; override with `E2E_PG_PORT=5441 ./scripts/e2e.sh` (also `E2E_API_PORT`, `E2E_WEB_PORT`). Evidence: `scripts/e2e.sh:27`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
