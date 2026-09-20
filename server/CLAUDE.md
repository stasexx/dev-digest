# server (@devdigest/api)

## Before answering
Search `server/docs/`, `server/specs/`, `server/INSIGHTS.md` for the topic before reading code.

## Conventions (not obvious from code)
- Multi-tenancy: every domain table has `workspace_id`; queries are scoped by the base-repository guard.
- DI via `src/platform/container.ts`: services depend on interfaces (`@devdigest/shared`), not classes; tests inject mocks via `ContainerOverrides`.
- repo-intel is reached ONLY through the facade `container.repoIntel.*` — never touch the pipeline directly.
- Context enrichment is best-effort: on error/unindexed, omit the section, don't throw.
- New feature = new module + one line in `src/modules/index.ts`; new columns = your own migration only.

## Stack
Fastify 5 + zod type provider · Drizzle ORM + Postgres 16/pgvector · OpenAI/Anthropic SDKs · Vitest 2. ESM (`.js` import suffix).

## Commands
- Run: `pnpm dev` (:3001) · DB: `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:generate`
- Verify: `pnpm typecheck && pnpm test` (`*.it.test.ts` need Postgres; typecheck needs `cd ../reviewer-core && npm ci` once) · no linter configured

## Do-not-touch
- `src/db/migrations/**` — generated, append-only; never hand-edit. Schema change → `pnpm db:generate`.
- `pnpm-lock.yaml` — only via `pnpm add/remove`.
- `src/vendor/shared/` — edit together with the client copy; update `test/contracts.test.ts`.

## Read When
- Overview, commands, route/API map → `server/README.md`
- DI container, adapters, module anatomy, DB + migrations workflow → `server/docs/architecture.md`
- Full review cycle contract (import → run → grounding → persist → list aggregates) → `server/specs/review-flow.md`
- Indexer internals → `server/src/modules/repo-intel/README.md`
- Gotchas → `server/INSIGHTS.md`
