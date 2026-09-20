# e2e (@devdigest/e2e)

## Before answering
Search `e2e/docs/`, `e2e/specs/`, `e2e/INSIGHTS.md` first.

## Conventions (not obvious from code)
- Flows are deterministic; no LLM is called — behavior is stable across runs.

## Stack
TypeScript 5 · tsx runner (`run.ts`) over `agent-browser` · JSON flow specs.

## Commands
- Full hermetic run: `../scripts/e2e.sh` (own Postgres + API + web on alt ports, migrate + seed)
- Against a running stack: `npm test` · Verify types: `npm run typecheck`

## Do-not-touch
- `package-lock.json` — npm-managed.
- Seed data the flows assert on lives in `server/src/db/seed.ts` — changing it breaks flows (e.g. `04-pr-findings` expects "2 findings").

## Read When
- How to run, structure → `e2e/README.md`
- Harness internals, flow JSON format, seed dependencies → `e2e/docs/harness.md`
- What every flow asserts and depends on → `e2e/specs/flows.md`
- Scenarios themselves → `e2e/specs/*.flow.json` · gotchas → `e2e/INSIGHTS.md`
