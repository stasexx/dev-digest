# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

- **2026-06-14** — `formatCost` (`src/lib/cost.ts`) distinguishes MISSING data (`null`/`undefined` → "—") from a genuine zero (`0` → "$0.00"), widens precision for sub-cent values (~2 sig figs), and trims trailing zeros to a 2dp floor ("$0.06" not "$0.060", "$0.0013" not "$0.00"). Reuse it for any per-run money display.
- **2026-09-20** — Severity counters and the findings list must derive from ONE base set or they drift: `confidentFindings()` feeds both `countBySeverity()` and `visibleFindings()`, so toggling "Hide low confidence" lowers pill numbers and cards together (pill number == cards shown is an acceptance criterion). Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts:5`, `:23`.

## What Doesn't Work

- **2026-09-20** — A `position: absolute` popover inside a PR-list row gets clipped: the list card has `overflow: hidden` (`client/src/app/repos/[repoId]/pulls/styles.ts:29`). jsdom tests pass anyway — only a real browser shows it. Use `position: fixed` anchored to the cell's `getBoundingClientRect()` (with an upward flip near the viewport bottom). Evidence: `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/styles.ts:26`.

## Codebase Patterns

- **2026-06-14** — Cross-route shared components live in `src/components/<Name>/` with an `index.ts` barrel, imported via `@/components/<Name>` (e.g. `RunCostBadge`, `diff-viewer`). Vendored UI primitives (`Badge`, `CircularScore`) live in `src/vendor/ui` under `@devdigest/ui` — different home. Evidence: `client/src/components/RunCostBadge/`.
- **2026-06-14** — The PR-list table is driven by two parallel constants that MUST stay length-aligned: `COLUMN_KEYS` (header keys + order) and `GRID` (CSS grid-template tracks). Adding a column = add to both AND render a matching cell in `PRRow.tsx`, else header/cells misalign silently. Evidence: `client/src/app/repos/[repoId]/pulls/constants.ts`.
- **2026-06-14** — i18n has only the `en` locale (`client/messages/en/`); new UI strings need a key under the right namespace file (e.g. `prReview.json`, `runs.json`) read via `useTranslations("<ns>")`. A missing key renders the raw key, not an error.
- **2026-09-20** — Filter toggles reuse the vendored `Chip` primitive; it now emits `aria-pressed={active}`, so tests/e2e can assert filter state via `getByRole("button", { name })` + `aria-pressed` instead of style sniffing. Evidence: `client/src/vendor/ui/primitives/Chip.tsx:24`.
- **2026-09-20** — The UI `Severity` type in `@devdigest/ui` has a 4th value `INFO` that the Zod contract (`@devdigest/shared`) lacks. Type component props with the SHARED `Severity` when iterating contract data; `SEV[sev]` lookups still work because the UI type is a superset. Evidence: `client/src/vendor/ui/primitives/tokens.ts:3`, `client/src/vendor/shared/contracts/findings.ts:11`.

## Tool & Library Notes

- **2026-09-20** — Timeline run tiles (`RunSummary`) carry only `findings_count`/`blockers`, no per-severity split. Per-run severity icons are derived client-side by matching `ReviewRecord.run_id` → `countBySeverity(review.findings)` in `FindingsTab`; seeded reviews have `run_id = null` and therefore no tile. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:77`.

## Recurring Errors & Fixes

## Session Notes

### 2026-09-20
- HW-1: findings by severity. Review-run card got `N CRITICAL · N WARNING · N SUGGESTION` pills + Critical/Warning/Suggestion toggle filter (second click clears); Timeline tiles got display-only severity icons; PR list got a FINDINGS column with a read-only hover/focus popover ("N FINDINGS IN THIS RUN").
- All counting is a client-side group-by over already-fetched data — verified in a headless browser session: zero non-GET API calls and zero LLM-host requests while opening pages and toggling filters.
- Behaviour contract recorded in `client/specs/pages.md` ("Findings by severity").

## Open Questions
