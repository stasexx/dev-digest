## 🔍 PR Self-Review Report

> `pr-self-review` skill, run before push on the HW-5 diff `a1a65cf..HEAD`. The branch is stacked on HW-3, HW-4 and the L05 lab, so a diff against `origin/main` would review 408 files of earlier homework. Each bucket ran as one Sonnet sub-agent that loaded its assigned skills. Line numbers are file lines.

⚠️  Large PR detected: 80 files, 5,463 lines changed.
Consider splitting into smaller PRs for more accurate review.

### Files analyzed
- UI Frontend: 31 files (`frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`)
- Backend/Domain: 15 files (`onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`, `zod`, `security`)
- Tests: 18 files (`react-testing-library`, `typescript-expert`)
- Contract sync:
  - `contracts/brief.ts` is byte-identical in both copies.
  - `contracts/pr-brief.ts` differs only by the `.js` import suffix, the convention for client copies.
  - `diff -r` also shows older drift in `eval-ci.ts` and the `.js` suffixes of other files. These come from earlier commits and are not touched by this PR, so they are not a finding here.
- npm audit: skipped, because no `package.json` changed.

### Findings

| Severity | File:Line | Issue | Fix | Skill |
|---|---|---|---|---|
| 🟡 HIGH | client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx:284 | Fixed 30 ms sleeps before two negative assertions | Use fake timers for the "nothing happens" checks | react-testing-library |
| 🟡 HIGH | client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx:0 | Component changed, no sibling test updated | Cover target props in a DiffViewer test | pr-self-review |
| 🟡 HIGH | client/src/components/diff-viewer/FileCard/FileCard.tsx:0 | Component changed, FileCard.test.tsx not updated | Add forceOpen/onTargetReady cases to FileCard.test.tsx | pr-self-review |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx:221 | Queries `data-*` attributes via `document.querySelector` | Prefer role queries scoped with `within` | react-testing-library |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx:141 | New interactions use `fireEvent.click` | Switch to `userEvent.setup()` clicks | react-testing-library |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx:6 | Deep relative imports of message JSON | Import messages through a path alias | typescript-expert |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/PrBriefBlock.test.tsx:87 | Interactions use `fireEvent.click` | Switch to `userEvent.setup()` clicks | react-testing-library |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/PrBriefBlock.test.tsx:100 | Busy state found via `container.querySelector` | Query by role and assert `aria-busy` | react-testing-library |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/_components/BriefNotices/BriefNotices.tsx:0 | New component without a sibling test | Add BriefNotices.test.tsx (covered via PrBriefBlock tests) | pr-self-review |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/_components/BriefSummary/BriefSummary.tsx:0 | New component without a sibling test | Add BriefSummary.test.tsx (covered via PrBriefBlock tests) | pr-self-review |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/_components/BriefSummary/BriefSummary.tsx:6 | Deep relative import of VerdictBanner | Use the `@/` alias path | frontend-architecture |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/_components/BriefSummary/BriefSummary.tsx:40 | `review.verdict as Verdict` type assertion | Narrow with a type guard | typescript-expert |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/_components/ReviewFocusList/ReviewFocusList.test.tsx:35 | Interactions use `fireEvent.click` | Switch to `userEvent.setup()` clicks | react-testing-library |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/_components/RiskAreas/RiskAreas.test.tsx:37 | Interactions use `fireEvent.click` | Switch to `userEvent.setup()` clicks | react-testing-library |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief/helpers.ts:46 | Casts `err.details` instead of narrowing unknown | Read `provider` through a small guard | typescript-expert |
| 🔵 MEDIUM | client/src/app/repos/[repoId]/pulls/[number]/page.tsx:24 | Deep relative import of `lib/utils/diffLink` | Use `@/lib/utils/diffLink` | frontend-architecture |
| 🔵 MEDIUM | client/src/components/diff-viewer/FileCard/FileCard.tsx:76 | Ref assigned during render | Assign the latest callback in an effect | react-best-practices |
| 🔵 MEDIUM | server/src/modules/brief/inputs.ts:24 | Local Drizzle `RepoRow` alias imports `db/schema` | Export `RepoRow` from `db/rows.ts` | onion-architecture |
| 🔵 MEDIUM | server/src/modules/brief/service.ts:166 | Debug log carries the full prompt text | Log sizes only, or redact contents | security |
| 🔵 MEDIUM | server/test/brief-routes.test.ts:28 | `{} as never` stubs hide contract mismatches | Use typed partial stubs with `satisfies` | typescript-expert |
| 🔵 MEDIUM | server/test/brief-service.test.ts:126 | `as never` / `as unknown as` casts on collaborators | Build typed partial stubs | typescript-expert |

### Ignored lines
- none

### Operator notes on the HIGH findings (not blocking)
- **DiffTab.test.tsx:284 and :312.** Both sleeps come before *negative* assertions: no scroll while the Smart Diff data is still loading, and no second scroll after a refetch. `waitFor` cannot wait for something that must not happen. The reviewer's own fix lists fake timers for this case, and they are kept as a follow-up.
- **DiffViewer.tsx and FileCard.tsx.** The new props (`targetFile`, `forceOpen`, `onTargetReady`, `highlighted`) are exercised end to end by the 9 new deep-link cases in `DiffTab.test.tsx`, which render the real `DiffViewer` → `FileCard` → `CodeLine`. They have no isolated sibling test yet.
- **service.ts:166.** The prompt appears only at `debug`, as the plan's logging contract decided after the cross-model review: info entries carry ids and counts only. The dev server runs at `info`.

---

✅ PASS — no critical issues found
