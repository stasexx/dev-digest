# Pages — behavioural contract (`client`)

What every route must keep doing; change it in the same MR as the behaviour.
Paths are relative to `client/`, hooks come from `src/lib/hooks/*`, endpoints
are relative to `NEXT_PUBLIC_API_BASE`. "Toast" = global `notify.error` from
`src/lib/providers.tsx` (all mutation errors; query errors only on network
failure or 5xx). Background: [`../docs/ui-architecture.md`](../docs/ui-architecture.md).

## Global rules

- Every page except `/onboarding` renders inside `AppShell` with a breadcrumb.
- Repo-scoped pages (`/repos/:repoId/...`) check `useRepoNotFound(repoId)`
  first: once `GET /repos` has loaded and the id is unknown they render
  `RepoNotFound` inside the shell, never an error screen. While repos are
  loading, or if the repos fetch failed, the check is `false`.
- View state that should survive reload/sharing lives in the URL and is
  changed with `router.replace` (no history entry), preserving other params.
- Loading = `Skeleton`, empty = `EmptyState`, failure = `ErrorState` with a
  retry that calls `refetch()`; the body shows `ApiError.message` when
  available. All three come from `@devdigest/ui`.

## `/` — `src/app/page.tsx`

- Data: `useRepos` → `GET /repos`.
- Repos present → `router.replace("/repos/<first id>/pulls")`; a manual
  "Open <full_name>" button is shown meanwhile.
- States: loading skeletons; error **or** empty list → the same "No
  repositories yet" `EmptyState` whose CTA goes to `/onboarding`.

## `/onboarding` — `src/app/onboarding/_components/AddRepoView/AddRepoView.tsx`

- Full-bleed, no `AppShell`. `Esc` and close navigate to `/`.
- Submit: `useAddRepo` → `POST /repos { url }`; blank input is a no-op.
  Success → `/repos/:id/pulls`. Failure → inline message
  (`ApiError.message`, else "Could not add repository").
- Links to `/settings/api-keys` for missing keys.

## `/repos/:repoId/pulls` — PR list (`src/app/repos/[repoId]/pulls/page.tsx`)

- Data: `usePulls(repoId)` → `GET /repos/:repoId/pulls`; refetches every 60s
  and on window focus. Refresh button: `useRefreshRepo` →
  `POST /repos/:repoId/refresh`, which invalidates `["repos"]` and
  `["pulls", repoId]`.
- URL: `?status=all|needs_review|reviewed|stale`. **Default when absent is
  `needs_review`**, so choosing "all" always writes `status=all` explicitly.
  Chips come from `STATUS_FILTERS`.
- Local (not in URL, reset on reload): search text (matches title substring or
  PR number) and sort `newest|oldest` by `updated_at`.
- States: `SKELETON_ROWS` (4) skeletons; `ErrorState` with retry; `EmptyState`
  with different copy for `status=all` vs a specific status. The column header
  row renders in every state.
- Row click → `/repos/:repoId/pulls/:number` (PR **number**, not id).

### Columns — must stay aligned

`src/app/repos/[repoId]/pulls/constants.ts`:

| # | `COLUMN_KEYS` | `GRID` track | Cell in `PRRow.tsx` |
|---|---|---|---|
| 1 | `pullRequest` | `1fr` | status-coloured icon, title, `#number` |
| 2 | `author` | `132px` | `Avatar` + login |
| 3 | `size` | `92px` | `S/M/L · lines` (`sizeOf`: <100 S, <400 M, else L) |
| 4 | `score` | `60px` | `CircularScore`, or `—` when `score == null` (never reviewed) |
| 5 | `findings` | `124px` | `FindingsCell`: latest review's severity icons + counts, hover/focus popover (`findings`); `—` never reviewed |
| 6 | `status` | `118px` | dot badge via `STATUS_META` |
| 7 | `cost` | `84px` | `RunCostBadge variant="compact"` (`cost_usd`) |
| 8 | `updated` | `78px` | `relativeTime` (`now`, `5m`, `3h`, `2d`, `—`) |

Invariant: `COLUMN_KEYS.length` = number of `GRID` tracks = number of cells in
`PRRow`, in the same order, and each key has a label under
`list.columns.*` in `messages/en/prReview.json`. Nothing enforces this at
compile time; a mismatch misaligns silently. Header and rows share `GRID`
through `src/app/repos/[repoId]/pulls/styles.ts`. An unknown `pr.status` falls
back to the `needs_review` styling.

## `/repos/:repoId/pulls/:number` — PR detail (`.../pulls/[number]/page.tsx`)

- **Id resolution:** the URL carries the PR number but every PR endpoint takes
  the row uuid. The page resolves it from `usePulls(repoId)` and only then
  calls `usePullDetail(prId)` → `GET /pulls/:prId`. A number not present in
  the list leaves `prId = null` and ends in the full-screen `ErrorState`.
- Other data: `usePrReviews` → `GET /pulls/:prId/reviews`;
  `usePrActiveRuns` → `GET /pulls/:prId/runs/active`; `usePrRuns` →
  `GET /pulls/:prId/runs` (both poll every 4s only while something is running).
- URL: `?tab=overview|findings|diff` (default `overview`; an unknown value
  renders the header with no tab body) and `?trace=<runId>` which opens
  `RunTraceDrawer` (`useRunTrace` → `GET /runs/:id/trace`); closing deletes
  the param. Both are independent and preserved across each other.
- States: skeleton while pulls or detail load; full-screen `ErrorState` on
  error or missing PR.

- Header (`_components/PrDetailHeader`): "View on GitHub" is disabled until
  the repo `full_name` is known; merged/closed PRs show a banner but
  `RunReviewDropdown` still works. Starting a run (`useRunReview` →
  `POST /pulls/:prId/review` with `{ all }` or `{ agentId }`) switches to
  `tab=findings` and invalidates `["pr-active-runs", prId]`.

### Tab set — keys are part of the URL contract

| key | Label | Count badge | Body |
|---|---|---|---|
| `overview` | Overview | — | `OverviewTab`: PR description, nothing at all when the body is empty |
| `findings` | **Agent runs** | total findings across all reviews (hidden at 0) | `FindingsTab` |
| `diff` | Files changed | `pr.files_count` | `DiffTab` |

The key stays `findings` although the label is "Agent runs"; deep links and
`onRunStart` depend on it.

### "Agent runs" tab (`_components/FindingsTab/FindingsTab.tsx`)

Rendered top to bottom:

1. **Live review** — only while `liveRunIds` is non-empty: `RunStatus`
   (SSE via `useRunEvents` → `GET /runs/:id/events`), *Cancel* (cancels every
   live run: `POST /runs/:id/cancel`) and *Open run trace* (first live run).
   When the stream ends, the page invalidates active runs + run history and
   refetches reviews.
2. "Review in progress…" strip while any run is active.
3. Lethal Trifecta banner when any finding has `kind === "lethal_trifecta"`.
4. **Timeline** section — `RunHistory`: all runs (any status, failed ones with
   their error) interleaved with PR commits, newest first. Hidden only when
   there are neither runs nor commits. Per run: open trace; delete (not
   offered while `running`; `window.confirm` → `DELETE /runs/:id`, which also
   drops its review); agent name opens and scrolls to its accordion below.
5. **Review runs** section — always has its heading. One `ReviewRunAccordion`
   per review, newest first, only the first open by default. Each holds a
   `VerdictBanner` and its own `FindingsPanel`; delete → `DELETE /reviews/:id`.
   Empty: "No findings yet" `EmptyState`, suppressed while a run is in flight.

Timeline = `agent_runs` (`usePrRuns`), Review runs = persisted reviews
(`usePrReviews`); a failed run appears only in the Timeline. Finding actions:
`useFindingAction` → `POST /findings/:id/<action>` (optional `{ reply }`),
invalidating `["reviews", prId]`.

### "Files changed" tab (`_components/DiffTab/DiffTab.tsx`)

`DiffViewer` over `pr.files`. Comments: `usePrComments` →
`GET /pulls/:prId/comments` (live from GitHub), hidden by default with a
show/hide toggle that appears only when there is at least one. Composing is
allowed only when `pr.status === "open"`: `useCreatePrComment` →
`POST /pulls/:prId/comments`; on success comments become visible, on failure a
toast is raised.

## Findings by severity

Pure client-side views over findings that are already loaded — opening the page or toggling a filter must never call the LLM or issue a new request.

**PR detail → "Agent runs" tab → "Review runs" → expanded run card** (`FindingsPanel` + `FindingsPanel/_components/SeverityFilter`):
- Under the verdict / PR SCORE banner: a row of pills `N CRITICAL · N WARNING · N SUGGESTION`. Only severities with at least one finding are shown.
- A pill's number MUST equal the number of finding cards of that severity rendered below in the same run card. Both derive from the same base set (`confidentFindings`), so "Hide low confidence" lowers the counters and the list together.
- Under the pills: three filter buttons — Critical, Warning, Suggestion (always all three, `aria-pressed`). Clicking one keeps only that severity's cards; clicking the active one again clears the filter; clicking another switches directly. Filter state is per run card, local (not in the URL), and resets keyboard focus to the first card.
- Counting is `countBySeverity` (`FindingsPanel/helpers.ts`) — a group-by over `ReviewRecord.findings` from `GET /pulls/:id/reviews`.

**"Timeline" section** (`RunHistory`): each settled run tile shows compact severity icons with counts for that run. Display only — not clickable. Counts are derived in `FindingsTab` from the same reviews, matched by `run_id`; a run without a review shows none.

**PR list → FINDINGS column** (`pulls/_components/FindingsCell`): severity icons + counts of the PR's latest review, from `PrMeta.findings` on `GET /repos/:id/pulls`. `—` when never reviewed, `0` when the review found nothing.
- Hover or keyboard focus opens a popover titled `N FINDINGS IN THIS RUN` with read-only previews: severity icon, title, category, `file:line`, confidence %, short rationale. No buttons of any kind — Accept/Dismiss exist only on finding cards of the PR detail page.
- The popover is `position: fixed` (the list card clips overflow) and swallows clicks so it never triggers the row's navigation.
- Adding/removing a list column means updating `COLUMN_KEYS`, `GRID` and `PRRow` together.

## `/agents` — `src/app/agents/_components/AgentsListView/AgentsListView.tsx`

- Data: `useAgents` → `GET /agents`. Toggle enabled: `useUpdateAgent` →
  `PUT /agents/:id`. Create modal: `useCreateAgent` → `POST /agents`. Delete
  from the card: `useDeleteAgent` → `DELETE /agents/:id`.
- Card click → `/agents/:id?tab=config`. Local search box, not in URL.
- States: three skeleton cards, `ErrorState` with retry, `EmptyState`.

## `/agents/:id` — `src/app/agents/[id]/page.tsx`

- Data: `useAgents` (left rail) + `useAgent(id)` → `GET /agents/:id`; saves via
  `useUpdateAgent`; model picker via `useProviderModels` →
  `GET /providers/:provider/models` (5 min stale time).
- URL: `?tab=`, whitelisted by `VALID_TABS = ["config"]`; anything else falls
  back to `config`. Switching agents in the rail keeps the current tab.
- States: rail renders immediately, editor pane shows skeletons; error or
  missing agent → full-screen `ErrorState` with retry.

## `/settings/:section` — `.../SettingsView/SettingsView.tsx`

- Sections come from `SETTINGS_SECTIONS` in `src/vendor/ui/nav.ts`:
  `api-keys` (`SettingsApiKeys`) and `models` (`SettingsModels`). The section
  is a path segment, not a query param. An unknown section renders a generic
  `EmptyState` titled after the first section, not a 404. `/settings` alone
  has no page; nav always links to `/settings/api-keys`.
- `api-keys`: `useSecretsStatus` → `GET /settings/secrets-status` (booleans
  only, values are never read back); save/test via `useTestConnection` →
  `POST /settings/test-connection`, which on `ok` invalidates
  `["provider-models"]` and `["secrets-status"]`.
- `models`: `useSettings` → `GET /settings`, `useUpdateSettings` →
  `PUT /settings` (response written straight into the cache),
  `useProviderModels("openrouter")`.
