# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

- **2026-09-20** — Before writing a PR-list rollup, check `modules/pulls/status.ts`: `rollupSeverities()` already existed (tested, but unused by any route). `summarizeFindings()` builds on it for `PrMeta.findings`. Evidence: `server/src/modules/pulls/status.ts:23`, `:55`.

## What Doesn't Work

## Codebase Patterns

- **2026-06-14** — Shared contracts (`@devdigest/shared`) are vendored as TWO hand-maintained copies — `server/src/vendor/shared/` and `client/src/vendor/shared/` — resolved by tsconfig path alias, NOT auto-synced. Adding a field means editing both in lock-step; the only diffs between copies are comments. Evidence: `server/src/vendor/shared/contracts/trace.ts`, `platform.ts`.
- **2026-06-14** — PR-list per-PR aggregates (score, cost) are computed ON READ in `GET /repos/:id/pulls` via one `inArray` query + JS grouping, never denormalized onto `pull_requests`. "Latest review batch" cost has no batch id in the schema — approximated by summing `agent_runs.cost_usd` within a 120s window of the PR's newest priced run. Evidence: `server/src/modules/pulls/routes.ts`.
- **2026-06-14** — `completeAgentRun`'s `values` shape is declared in TWO places that must match: the repo fn (`repository/run.repo.ts`) AND the interface wrapper (`repository.ts:151`). Adding a field (e.g. `costUsd`) needs both or typecheck fails.
- **2026-09-20** — `findings.severity` is unconstrained `text` in Postgres; only the Zod LLM-output schema enforces CRITICAL/WARNING/SUGGESTION. Any rollup must drop unknown values BEFORE counting, otherwise `total` ≠ sum of buckets and the client's Zod `Severity` parse can fail on previews. Evidence: `server/src/db/schema/reviews.ts:36`, `server/src/modules/pulls/status.ts:57`.
- **2026-09-20** — Supersedes the 2026-06-14 note "the only diffs between copies are comments": the two `vendor/shared` copies have drifted in substance (`adapters.ts`, `contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts` differ — check with `diff -rq client/src/vendor/shared server/src/vendor/shared`). `contracts/platform.ts`, `findings.ts`, `review-api.ts` ARE identical — keep them so; don't blindly copy whole files across.

## Tool & Library Notes

- **2026-06-14** — New DB columns: edit `db/schema/*.ts`, then `npm run db:generate` (drizzle-kit) auto-generates `00NN_*.sql` (e.g. `0010_solid_baron_zemo.sql` = `ALTER TABLE … ADD COLUMN`). Never hand-write migration SQL; apply with `npm run db:migrate`.

## Recurring Errors & Fixes

- **2026-06-14** — Adding a required field to a Zod contract (`RunStats.cost_usd`) breaks the inline fixture in `server/test/contracts.test.ts` (RunTrace parse). Update the `stats: {…}` fixture in the same change. Evidence: `server/test/contracts.test.ts:160`.
- **2026-09-20** — API crashes at boot with `ZodError … path: ['LOG_LEVEL'] … received ''` on branches cut before `66727c8`: the generated `.env` ships `LOG_LEVEL=` empty. Fix is the `z.preprocess` in `server/src/platform/config.ts:35` (on `main`) — merge `main` rather than editing `.env`.
- **2026-09-20** — `cd server && pnpm typecheck` fails with `Cannot find module 'zod'` inside `../reviewer-core/src/**` on a fresh clone: reviewer-core is compiled through the path alias but has its own npm lockfile. Run `cd reviewer-core && npm ci` once (`scripts/dev.sh` does it; bare `pnpm install` in server does not).

## Session Notes

### 2026-06-14
- Re-introduced per-run cost (USD) end-to-end (lesson reversing the earlier removal in `d45ab0d`/`58c6ac7`): `cost_usd` column on `agent_runs` (migration 0010), captured in `run-executor` (was discarding `outcome.costUsd`), surfaced in `RunSummary`/`RunStats`/`PrMeta`.
- Decision: PR-list COST = sum of the latest review batch via a 120s window heuristic (no batch id in schema). Cost persisted (accurate `outcome.costUsd`), not recomputed; historical runs → null → "—".
### 2026-09-20
- HW-1: `GET /repos/:id/pulls` now returns `findings` (latest review: per-severity counts + ≤8 read-only previews, dismissed excluded) for the list's FINDINGS column/popover. Computed on read with one `inArray` query — no migration, no LLM. Contract added to both `vendor/shared` copies; spec in `server/specs/review-flow.md`.

## Open Questions

- **2026-06-14** — PR-list "latest review batch" uses a 120s `ranAt` window as a proxy for a review session. If a real review-session / batch id is ever added to the schema, swap the window for exact grouping in `pulls/routes.ts`.
- **2026-09-20** — PR-list `findings` describes only the single latest `kind='review'` row, while COST sums a 120s batch of runs. After a multi-agent "Review all" the two columns describe different scopes (one agent's findings vs. the whole batch's cost). Revisit both when a batch/session id exists.

