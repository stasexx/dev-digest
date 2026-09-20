# reviewer-core (@devdigest/reviewer-core)

## Iron rule
No I/O — no DB, fs, GitHub, or persistence. Only the injected `LLMProvider`. The same code
runs in the studio (server) and in CI. Keep it pure.

## Before answering
Search `reviewer-core/docs/`, `reviewer-core/specs/`, `reviewer-core/INSIGHTS.md` first.

## Conventions (not obvious from code)
- The grounding gate (`src/grounding.ts`) is mandatory; score is computed from findings that SURVIVED grounding, not the model's self-report.
- skills/memory/specs arrive as RESOLVED strings (slug→body is the caller's job).

## Stack
TypeScript 5 · Zod 3 · OpenAI SDK structured output · Vitest 2. Pure library, no I/O.

## Commands
- Install: `npm ci` (npm, not pnpm)
- Verify: `npm run typecheck && npm test`

## Do-not-touch
- `package-lock.json` — npm-managed (`npm ci` to install); never hand-edit, never switch this package to pnpm.

## Read When
- Pipeline overview → `reviewer-core/README.md`
- Prompt assembly, LLM abstraction, grounding gate, scoring → `reviewer-core/docs/pipeline.md`
- Input/output contract, severity enum, score formula, invariants → `reviewer-core/specs/review-contract.md`
- Gotchas → `reviewer-core/INSIGHTS.md`
