# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.

## Before answering
Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then read code.

## Session protocol (engineering-insights loop)
- **Start:** before touching a package, read its `INSIGHTS.md` and summarize the top 3
  relevant points back — this forces an active read and catches a silently-failed load.
- **Before recording an insight:** re-read that package's `INSIGHTS.md` and do not duplicate
  what's already there.
- **End of session:** run `/engineering-insights`. Record only substantial, file-grounded,
  non-duplicate findings; if nothing substantial came up, write nothing — but don't skip the
  check. Writes are strictly append-only (never overwrite an `INSIGHTS.md`).

## Tech stack (per package)
| Package | Stack |
|---|---|
| `client/` — `@devdigest/web` | TypeScript 5, Next.js 15 (App Router), React 19, TanStack Query 5, next-intl 3, Tailwind 4 + CSS variables, recharts; tests: Vitest 2 + React Testing Library (jsdom) |
| `server/` — `@devdigest/api` | TypeScript 5 (ESM), Fastify 5 + fastify-type-provider-zod, Drizzle ORM 0.38 + drizzle-kit, Postgres 16 / pgvector (`postgres` driver), OpenAI + Anthropic SDKs, ast-grep; tests: Vitest 2 |
| `reviewer-core/` — `@devdigest/reviewer-core` | TypeScript 5, Zod 3, OpenAI SDK (structured output); pure engine, no I/O; tests: Vitest 2 |
| `e2e/` — `@devdigest/e2e` | TypeScript 5 + tsx runner over `agent-browser`; JSON flow specs |
| `*/src/vendor/shared` — `@devdigest/shared` | Zod 3 contracts, vendored into client and server |

## Repo structure
NOT a monorepo workspace — each package has its own `package.json` + lockfile; cross-package code is shared via tsconfig path aliases.
- `client/` — the web studio (port 3000). Routes in `src/app`, data hooks in `src/lib/hooks`, UI primitives in `src/vendor/ui` (`@devdigest/ui`).
- `server/` — REST API (port 3001). Feature modules in `src/modules/*` (registered statically in `src/modules/index.ts`), DB schema + migrations in `src/db`, DI in `src/platform/container.ts`. Includes `repo-intel` (codebase indexer).
- `reviewer-core/` — review engine: diff + repo map → prompt → LLM → grounded findings → score. Consumed by the server via path alias.
- `e2e/` — deterministic browser flows (`specs/*.flow.json`) against a seeded, hermetic stack.
- `scripts/` — `dev.sh` (run everything), `e2e.sh` (hermetic e2e). `docs/agent-prompts/` — reviewer prompt templates.
- Every package has `CLAUDE.md`, `INSIGHTS.md`, `docs/` (architecture / data flow), `specs/` (behaviour that must stay true).

## Commands
Run:
- `./scripts/dev.sh` — Postgres (Docker) + migrate + seed + API :3001 + web :3000. Flags: `--no-seed`, `--no-client`, `--db-only`.
- Per package: `cd server && pnpm dev` · `cd client && pnpm dev`.
- DB: `cd server && pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate` (after a schema change).

Verify (run in the package you touched, before every commit):
- `cd client && pnpm typecheck && pnpm test`
- `cd server && pnpm typecheck && pnpm test` (`*.it.test.ts` need Postgres; server typecheck needs `cd reviewer-core && npm ci` once)
- `cd reviewer-core && npm run typecheck && npm test`
- `cd e2e && npm run typecheck` · full browser run: `./scripts/e2e.sh`
- Lint: there is NO linter/formatter configured in this repo — `typecheck` + tests are the gates. Don't add one ad hoc.
- Package managers: `pnpm` for client/server, `npm` for reviewer-core/e2e. Never mix them.

## Naming conventions
- React components: `PascalCase` folder per component — `Name/Name.tsx` + `index.ts` barrel (+ optional `styles.ts`, `constants.ts`, `helpers.ts`, `Name.test.tsx`). Route-private components live in `_components/`; nested ones in `Name/_components/`.
- Hooks: `useThing` in `client/src/lib/hooks/<domain>.ts`. Helpers/utilities: `camelCase` functions in `helpers.ts`. Constants: `UPPER_SNAKE_CASE` in `constants.ts`. Style objects: `export const s = {…}` in `styles.ts`.
- Server modules: `src/modules/<kebab-name>/` with `routes.ts`, `service.ts`, `repository.ts`/`repository/*.repo.ts`, pure helpers in their own file (e.g. `status.ts`). ESM relative imports carry the `.js` extension.
- DB: tables/columns `snake_case` in SQL, `camelCase` in Drizzle schema objects. Wire/DTO fields (Zod contracts, JSON) are `snake_case`; Zod schema and its inferred type share one `PascalCase` name.
- Enum-like values: severities `CRITICAL | WARNING | SUGGESTION` (upper), statuses/verdicts `snake_case` (lower).
- Tests: `*.test.ts(x)` next to the code in client; `server/test/*.test.ts` (unit) and `*.it.test.ts` (needs Postgres). e2e flows: `NN-name.flow.json`.
- i18n keys: `camelCase`, namespaced by file name under `client/messages/en/`.
- Branches: `<type>/<kebab-topic>`; commits: short, imperative.

## Conventions (not obvious from code)
- Modules are registered statically in `server/src/modules/index.ts` (no filesystem autoload).
- `@devdigest/shared` exists as TWO hand-synced copies (`server/src/vendor/shared`, `client/src/vendor/shared`) — a contract change edits both in lock-step.
- Per-PR list aggregates (score, cost, findings) are computed on read, never denormalized.

## Do-not-touch
- **Migrations** — `server/src/db/migrations/**` (SQL + `meta/` snapshots + `_journal.json`): never hand-edit, rename, or delete. They are an append-only, generated history; a hand edit desyncs the journal from databases that already applied it. Change `src/db/schema/*.ts` and run `pnpm db:generate` instead.
- **Lock files** — `client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json`, `skills-lock.json`: never hand-edit or regenerate wholesale. They change only as a side effect of a deliberate dependency change made through the package manager, in its own commit.
- `server/src/vendor/shared/` and `client/src/vendor/shared/` — contracts; change only when the feature needs it, both copies together, with the contract test updated.
- `.env*` files — never read, print, or commit.

## Use when
- Stack, commands, architecture, how to run → read `README.md`
- Working inside a package → read that package's CLAUDE.md: `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`
- Agent prompt templates → read `docs/agent-prompts/`
- Test strategy → read `TESTING.md`
