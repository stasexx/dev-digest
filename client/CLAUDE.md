# client (@devdigest/web)

## Before answering
Search `client/docs/`, `client/specs/`, `client/INSIGHTS.md` first.

## Conventions (not obvious from code)
- Types/contracts come from `@devdigest/shared` (Zod) — never hand-duplicate them.
- All API access goes through `src/lib/api.ts`.

## Stack
Next.js 15 App Router · React 19 · TanStack Query 5 · next-intl 3 · CSS variables + co-located `styles.ts` · Vitest 2 + RTL.

## Commands
- Run: `pnpm dev` (:3000; needs the API on :3001 — or `../scripts/dev.sh` for everything)
- Verify: `pnpm typecheck && pnpm test` · single file: `pnpm vitest run <path>` · no linter configured
- Build: `pnpm build`

## Do-not-touch
- `pnpm-lock.yaml` — only via `pnpm add/remove`, never by hand.
- `src/vendor/shared/` — mirror of the server copy; edit both together. `src/vendor/ui/` — shared primitives; extend, don't fork per page.

## Read When
- Route map, commands → `client/README.md`
- Component/data-layer/i18n/styling architecture, Server vs Client components → `client/docs/ui-architecture.md`
- What each page loads, URL params, states; PR list columns; findings-by-severity behaviour → `client/specs/pages.md`
- Gotchas from previous sessions → `client/INSIGHTS.md`
