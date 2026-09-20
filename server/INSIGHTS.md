# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

- **2026-09-20** — Conventions Extractor groundwork already existed before the feature: `conventions` table (since `0000_init`), `ConventionCandidate` contract, `FeatureModelId 'conventions'` + Settings→Models row, `repoIntel.getConventionSamples()`, `skills.source='extracted'` + `evidence_files`, `MockLLMProvider.structuredBySchema`. Grep for the noun before designing a new table/contract. Evidence: `server/src/db/schema/knowledge.ts:31`, `server/src/modules/repo-intel/service.ts:630`.
- **2026-09-20** — LLM evidence must be verified in code and the stored snippet read FROM THE FILE, not from the model: in the it-test 3 of 5 model candidates (missing file, line past EOF, `../` path) are dropped by `verifyEvidence` + `safeRelativePath`. Send samples line-numbered (`numberLines`) or the model cannot cite real lines. Evidence: `server/src/modules/conventions/helpers.ts:52`, `server/test/conventions.it.test.ts`.

## What Doesn't Work

## Codebase Patterns

- **2026-06-18** — `POST /skills/import` must be registered BEFORE `GET /skills/:id` in Fastify routes, otherwise Fastify matches the literal segment `import` as a UUID param and returns 422. Fixed by registering the static path first. Evidence: `server/src/modules/skills/routes.ts:60`.
- **2026-06-18** — Skills wiring in reviews: `run-executor.ts` fetches `agentsRepo.linkedSkills(agent.id)`, filters to `.skill.enabled`, and passes the bodies as `{ skills: skillBodies }` to `reviewPullRequest()`. `assemblePrompt` in reviewer-core renders `## Skills / rules` automatically when the array is non-empty — no reviewer-core changes needed. Evidence: `server/src/modules/reviews/run-executor.ts`.

- **2026-06-14** — Shared contracts (`@devdigest/shared`) are vendored as TWO hand-maintained copies — `server/src/vendor/shared/` and `client/src/vendor/shared/` — resolved by tsconfig path alias, NOT auto-synced. Adding a field means editing both in lock-step; the only diffs between copies are comments. Evidence: `server/src/vendor/shared/contracts/trace.ts`, `platform.ts`.
- **2026-06-14** — PR-list per-PR aggregates (score, cost) are computed ON READ in `GET /repos/:id/pulls` via one `inArray` query + JS grouping, never denormalized onto `pull_requests`. "Latest review batch" cost has no batch id in the schema — approximated by summing `agent_runs.cost_usd` within a 120s window of the PR's newest priced run. Evidence: `server/src/modules/pulls/routes.ts`.
- **2026-06-14** — `completeAgentRun`'s `values` shape is declared in TWO places that must match: the repo fn (`repository/run.repo.ts`) AND the interface wrapper (`repository.ts:151`). Adding a field (e.g. `costUsd`) needs both or typecheck fails.
- **2026-06-17** — PR-list `GET /repos/:id/pulls` returns the latest batch's FINDINGS as full `Finding[]` records (not counts) under `PrMeta.findings`, mapped via `reviews/helpers.ts#findingRowToDto`; the client derives severity chips AND renders a hover popover from that one array (no second fetch, perfect chip↔popover consistency). The "latest review batch" here is a SEPARATE window from the cost block: cost windows over `agent_runs.ranAt`, findings windows over `reviews.createdAt` (both 120s). A pre-existing `rollupSeverities` helper in `modules/pulls/status.ts` (lowercase keys) was built for a counts-only variant — currently unused by the route. Evidence: `server/src/modules/pulls/routes.ts`.
- **2026-09-20** — There is no `container.llmFor(feature)`: a non-review LLM feature composes `resolveFeatureModel(container, workspaceId, '<feature>')` + `container.llm(choice.provider)` + `completeStructured({ schemaName })`. `schemaName` is also the key tests use in `MockLLMProvider({ structuredBySchema })`. Evidence: `server/src/modules/conventions/service.ts`, `server/src/modules/settings/feature-models.ts:51`.
- **2026-09-20** — Cross-module repositories go through the composition root: added `container.reposRepo` instead of importing `modules/repos/repository` from another module (same rule as `agentsRepo`/`skillsRepo`). Evidence: `server/src/platform/container.ts`.
- **2026-09-20** — "Reject must not come back after ReScan" = keep rejected rows (hidden from `GET`), replace only `pending` rows in one transaction, and dedup new model output against reviewed rules by a normalized key. Deleting rejected rows would resurrect them on the next scan. Evidence: `server/src/modules/conventions/repository.ts` (`replacePending`), `helpers.ts` (`normalizeRule`).

## Tool & Library Notes

- **2026-06-14** — New DB columns: edit `db/schema/*.ts`, then `npm run db:generate` (drizzle-kit) auto-generates `00NN_*.sql` (e.g. `0010_solid_baron_zemo.sql` = `ALTER TABLE … ADD COLUMN`). Never hand-write migration SQL; apply with `npm run db:migrate`.

## Recurring Errors & Fixes

- **2026-06-14** — Adding a required field to a Zod contract (`RunStats.cost_usd`) breaks the inline fixture in `server/test/contracts.test.ts` (RunTrace parse). Update the `stats: {…}` fixture in the same change. Evidence: `server/test/contracts.test.ts:160`.
- **2026-09-20** — `pnpm install --frozen-lockfile` fails on `lesson-2-lab/skills`-based branches: `fflate` is declared in `server/package.json` but missing from `pnpm-lock.yaml` (the lab also committed a stray `server/package-lock.json`). Fix: `pnpm install --no-frozen-lockfile` once and commit the lockfile on its own.
- **2026-09-20** — `listen EADDRINUSE :3001` from `scripts/dev.sh` = an orphaned `tsx watch` API from an earlier stack still serving OLD code (new routes 404). Find it via `ss -ltnp | grep 3001`, check `/proc/<pid>/cwd`, kill, restart `pnpm dev`.

## Session Notes

### 2026-06-18
- Built Skills feature (L02) end-to-end: server module (`modules/skills/` — routes/service/repository/helpers), schema migration 0011 (`message` column on `skill_versions`), `SkillVersion`/`SkillStats`/`SkillImportPreview` contracts (lock-step in both vendor copies), `fflate` for ZIP preview, skills wiring in `run-executor.ts`, seed catalog (8 skills + Test Quality Reviewer agent).
- Decision: `POST /skills/import` registered before `/:id` route to prevent Fastify matching "import" as a UUID param.

### 2026-06-14
- Re-introduced per-run cost (USD) end-to-end (lesson reversing the earlier removal in `d45ab0d`/`58c6ac7`): `cost_usd` column on `agent_runs` (migration 0010), captured in `run-executor` (was discarding `outcome.costUsd`), surfaced in `RunSummary`/`RunStats`/`PrMeta`.
- Decision: PR-list COST = sum of the latest review batch via a 120s window heuristic (no batch id in schema). Cost persisted (accurate `outcome.costUsd`), not recomputed; historical runs → null → "—".
### 2026-09-20
- HW-2: `modules/conventions` — extract (code-picked samples → one structured LLM call → code evidence check → persist), list, PATCH accept/reject/edit, skill-draft, create/update `repo-conventions` skill + append-link to an agent. Migration `0012_flimsy_leader` (additive). `GET /skills` now returns `agent_count`, `GET /agents` returns `skill_count` (one grouped query each).

## Open Questions

- **2026-06-14** — PR-list "latest review batch" uses a 120s `ranAt` window as a proxy for a review session. If a real review-session / batch id is ever added to the schema, swap the window for exact grouping in `pulls/routes.ts`.
