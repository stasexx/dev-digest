## Architecture Review: PR Brief (`hw-5/pr-brief`, `a1a65cf..HEAD`)

> run-plan Step 2 review gate, `architecture-reviewer` subagent (Sonnet), read-only. Saved verbatim.

### Audited files
All 76 files in `git diff --name-only a1a65cf..HEAD`. I read the server, shared-contract and client source in full or by diff. The tests and the two `INSIGHTS.md` files I only checked for imports and layering.

Layers touched: `server/` (`modules/brief`, `adapters/github`, `modules/pulls`, `modules/reviews`, `vendor/shared`), `client/` (route segment `repos/[repoId]/pulls/[number]`, `components/diff-viewer`, `lib/hooks`, `lib/utils`, `vendor/shared`) and docs. `reviewer-core/` is not touched, so the `reviewer-core-*` rules do not apply.

Server files:
- `server/src/modules/brief/{budget,constants,grounding,in-flight,inputs,prompt,repository,routes,service,types}.ts`
- `server/src/adapters/github/{linked-issue,octokit}.ts`
- `server/src/modules/{index.ts,pulls/routes.ts,reviews/diff-loader.ts}`
- `server/src/vendor/shared/{index.ts,contracts/brief.ts,contracts/pr-brief.ts}`
- `server/docs/api-contracts.md`, `server/insights/INSIGHTS.md`
- `server/test/brief-{budget,contract,grounding,inputs,prompt,routes,service}.test.ts`, `server/test/brief.it.test.ts`, `server/test/helpers/brief-facts.ts`, `server/test/linked-issue.test.ts`, `server/test/pulls-head-sha.it.test.ts`

Client files:
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
- `.../_components/OverviewTab/{OverviewTab.tsx,styles.ts,OverviewTab.test.tsx}`
- `.../_components/OverviewTab/_components/PrBrief/**` (block, `BriefNotices`, `BriefSummary`, `ReviewFocusList`, `RiskAreas`, `constants`, `helpers`, `styles`, `index`, tests)
- `.../_components/DiffTab/{DiffTab.tsx,DiffTab.test.tsx,NotInDiffNotice.tsx,SmartDiffGroup.tsx,constants.ts}`
- `.../_components/VerdictBanner/{VerdictBanner.tsx,VerdictBanner.test.tsx,index.ts,types.ts}`
- `client/src/components/diff-viewer/{CodeLine/CodeLine.tsx,DiffViewer/DiffViewer.tsx,FileCard/FileCard.tsx,styles.ts}`
- `client/src/lib/hooks/{brief.ts,index.ts}`, `client/src/lib/utils/{diffLink.ts,diffLink.test.ts,index.ts}`
- `client/src/vendor/shared/{index.ts,contracts/brief.ts,contracts/pr-brief.ts}`
- `client/messages/en/{brief.json,shell.json}`, `client/insights/INSIGHTS.md`

### Docs and skills read
`CLAUDE.md`, `server/CLAUDE.md`, `server/docs/architecture.md`, `client/CLAUDE.md`, `client/docs/ui-architecture.md`, the `onion-architecture` and `frontend-architecture` skills, and the plan (`docs/plans/pr-brief.md`).

I did not flag these documented decisions: Rec-1 (linked-issue regex lifted into `adapters/github/linked-issue.ts`), Rec-2 (`brief.ts` zod-only, new additive `pr-brief.ts`), Rec-3 (`generation.dropped.duplicates`, `inputs.changed_files`), I-1, E-1, the module-level in-flight lock, and the `diffFromPrFileRows` row-based variant.

### Rules checked, no violation found
- **`inward-only-dependencies`**
  - `modules/brief/repository.ts` imports only `drizzle-orm`, `db/client` and `db/schema`.
  - `service.ts`, `inputs.ts`, `prompt.ts`, `budget.ts` and `grounding.ts` import no Fastify, Drizzle or `routes.ts`.
  - `types.ts` and `constants.ts` import only types from `@devdigest/shared`.
  - `routes.ts` imports only `service.ts`, `constants.ts`, shared schemas and `_shared`.
- **`business-logic-in-routes`**: the two handlers are `getContext`, then one service call, then return. Response is validated with `PrBriefResponse`, and the POST declares a rate limit like `intent/routes.ts:36`.
- **`no-process-env-outside-secrets-provider`**: no `process.env` in any non-test changed file. The three hits are `loadConfig({ ...process.env })` in test files, which mirror the existing test setup.
- **`shared-contract-not-duplicated`**
  - No changed file outside `vendor/shared` declares `z.object`, and none imports `zod`.
  - `contracts/brief.ts` is byte-identical in `server/` and `client/` (diff exit 0).
  - `pr-brief.ts` differs only by the `.js` import suffixes, as `blast.ts` already does.
  - The client only imports contracts from `@devdigest/shared`.
- **Client data access**: no direct `fetch` or `EventSource` in components. Server state goes through `lib/hooks/brief.ts` (`useBrief`, `useGenerateBrief`), exported from the hooks index.
- **i18n**: user-facing strings use the `brief` namespace. The new `shell.json` label (`project-context`) was accepted as out of plan.
- **Docs**: `server/docs/api-contracts.md` documents the two new routes and the error codes.

### Findings

| # | file | line | severity | rule | evidence | recommendation |
|---|------|------|----------|------|----------|----------------|
| 1 | `server/src/modules/brief/service.ts` | 53 | low | `di-discipline` | `private repo: BriefRepository = new BriefRepository(container.db),` | Prefer exposing the repository through `platform/container.ts` (as `reviewRepo` and `agentsRepo` are), or accept as a deliberate match for `BlastService` (`blast/service.ts:22`), which does the same. |
| 2 | `server/src/modules/brief/routes.ts` | 25, 37 | low | `di-discipline` | `return new BriefService(app.container, req.log).get(workspaceId, req.params.id);` | Construct the service once per plugin or resolve it from the container; per-request `new Service(...)` copies the existing `blast`, `smart-diff` and `intent` routes and is a soft deviation from "one composition root". |
| 3 | `server/src/modules/brief/inputs.ts` | 7 | low | `inward-only-dependencies` | `import type * as schema from '../../db/schema.js';` | Replace the `typeof schema.repos.$inferSelect` alias (line 24) with the existing `RepoRow` type from `db/rows.js`, which the same file already uses for `AgentRow` and `PullRow`. It is type-only, so there is no runtime coupling. |
| 4 | `server/src/modules/brief/inputs.ts` | 8-12 | low | `inward-only-dependencies` | `import { buildSmartDiff, selectLatestReviewFindings } from '../smart-diff/helpers.js';` (also `../blast/helpers.js`, `../project-context/injection.js`, `../project-context/documents.js`) | Cross-module imports of pure helpers, deliberate per plan item 18 (parity with the Smart Diff and Blast services). Confirm the team accepts module-to-module helper imports; no cycle was found. |
| 5 | `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | ~97-107 | low | `frontend-architecture` (Core Principle 2, "Zero business logic in JSX") | ``cardEl.querySelector<HTMLElement>(`[data-new-line="${targetLineNo}"]`)`` | The scroll logic is in `DiffTab` and reaches into `FileCard`/`CodeLine` DOM through `data-*` attributes. Consider moving it into a colocated hook or into `diff-viewer` behind a documented attribute contract. It works as is. |
| 6 | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/PrBriefBlock.tsx` | 66-68 | info | `frontend-architecture` (colocated `styles.ts` convention) | `<span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>` | Move the inline visually-hidden style into the block's `styles.ts`. `RiskAreas.tsx` has similar small inline styles. This is a convention nit, not a documented-contract break. |
| 7 | `server/CLAUDE.md` | module layout | info | `missing-reference-doc` (doc staleness) | The Module Layout block lists no `brief` module. It already omits `blast`, `intent`, `smart-diff` and `project-context`, so the staleness predates this change. | Optionally refresh the module list. Not a blocker. |

### Verdict

| severity | count |
|----------|-------|
| critical | 0 |
| high | 0 |
| medium | 0 |
| low | 5 |
| info | 2 |

Out-of-scope observations, no architecture finding raised:
- Error handling is sound: the service throws `AppError` with no `details.raw`, and `service.ts` logs only `err.message`, consistent with plan item 4.
- `VerdictBanner.tsx` keeps an unused destructured `findingsCount: _fc`. That is a style nit for `pr-self-review`.

**Gate:** PASS (0 critical, 0 high)
