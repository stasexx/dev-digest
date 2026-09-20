# Spec — review flow (import → run → findings → actions)

Behavioural contract of the review cycle. Everything here **must stay true**;
changing it means updating this spec and `test/reviews.it.test.ts` together.
Paths are relative to `server/`. Contract types come from `src/vendor/shared/contracts/`
(`@devdigest/shared`). Every `:id` is a uuid (`src/modules/_shared/schemas.ts`);
a malformed id → 422 `validation_error`. Errors use the `ApiErrorBody` envelope.

## Endpoints

| Method | Path | Response | Source |
| --- | --- | --- | --- |
| GET | `/repos/:id/pulls` | `PrMeta[]` | `src/modules/pulls/routes.ts` |
| GET | `/pulls/:id` | `PrDetail` | `src/modules/pulls/routes.ts` |
| POST | `/pulls/:id/review` | `ReviewRunResponse` | `src/modules/reviews/routes.ts` |
| GET | `/pulls/:id/runs/active` | `{ run_id, agent_id, agent_name, ran_at }[]` | same |
| GET | `/pulls/:id/runs` | `RunSummary[]` (newest first) | same |
| GET | `/runs/:id/events` | SSE stream of `RunEvent` | same |
| GET | `/runs/:id/trace` | `RunTrace` | same |
| POST | `/runs/:id/cancel` | `{ ok: true }` | same |
| DELETE | `/runs/:id` | `{ ok: boolean }` | same |
| GET | `/pulls/:id/reviews` | `ReviewRecord[]` (newest first) | same |
| DELETE | `/reviews/:id` | `{ ok: true }` or 404 | same |
| POST | `/findings/:id/accept` | `{ finding: FindingRecord }` | same |
| POST | `/findings/:id/dismiss` | `{ finding: FindingRecord }` | same |

## 1. Import PRs — `GET /repos/:id/pulls`

1. Repo is looked up by `(workspace_id, id)`; missing → 404 `not_found`.
2. **Local-first sync.** If a GitHub client is available, `listPullRequests` is
   upserted into `pull_requests` on the unique key `(repo_id, number)`. On conflict
   only `title`, `head_sha`, `status`, `updated_at` are refreshed. A missing token or
   a GitHub failure is logged and **never fails the read** — persisted rows are served.
3. **Backfill.** GitHub's list payload has no diff stats, so rows with
   `additions = deletions = files_count = 0` are filled from `getPullRequest`, at most
   10 per request; each failure is skipped individually.
4. **Score on read.** `score` = `reviews.score` of the newest `reviews` row with
   `kind = 'review'` for the PR; `null` when never reviewed. Not denormalized.
5. **Cost on read.** `cost_usd` = sum of `agent_runs.cost_usd` over `status = 'done'`,
   priced runs within 120 s before the PR's newest priced run (the "latest batch"
   heuristic — there is no batch id). `null` when no priced run exists; never `0`.
6. **Status is derived**, not stored (`src/modules/pulls/status.ts`
   `deriveReviewStatus`): `merged`/`closed` pass through; an open PR is
   `needs_review` when `last_reviewed_sha` is null or differs from `head_sha`,
   `stale` when the head was reviewed but `updated_at` is older than 7 days, else
   `reviewed`. The DB `status` column only ever holds GitHub's merge state.

## PR list findings summary

`GET /repos/:id/pulls` returns `findings: PrFindingsSummary | null` on every `PrMeta` (contract: `src/vendor/shared/contracts/platform.ts`, mirrored in the client copy).
- `null` — the PR has no `kind = 'review'` review yet. Otherwise it describes the **latest** review only (same "newest first, first seen per PR" rule as `score`).
- Shape: `{ total, critical, warning, suggestion, previews[] }`; `total === critical + warning + suggestion` always. Rows with an unknown `severity` (the column is unconstrained text) are ignored everywhere.
- Dismissed findings (`dismissed_at IS NOT NULL`) are excluded, so the list reflects what still needs action.
- `previews` — at most `FINDING_PREVIEW_LIMIT` (8) items ordered by severity, then confidence desc; `rationale` is truncated to `PREVIEW_RATIONALE_MAX` (180) chars. Counts always cover every finding, not just the previews.
- Computed on read: one `inArray` query over the latest reviews' findings + JS grouping (`summarizeFindings` / `rollupSeverities` in `src/modules/pulls/status.ts`). No denormalized columns, no migration, and never an LLM call.

## 2. PR detail — `GET /pulls/:id`

Workspace-scoped (404 otherwise). With GitHub: `pr_files` and `pr_commits` are
replaced wholesale, `body` + diff stats written back, live detail returned with the
local `id`. Without GitHub: persisted files/commits/body are served, and `status`
is the raw GitHub merge state, not the derived review status.

## 3. Triggering a run — `POST /pulls/:id/review`

- Body is `RunRequest` (`{ agentId? , all? }`), parsed manually so an empty body is
  accepted by the schema layer. `all: true` → every enabled agent in the workspace;
  `agentId` → that agent (404 if absent); neither → 400 `invalid_run_request`.
- Route-level rate limit: 10 per minute (global limit is off under test).
- One `agent_runs` row per target is inserted **up front** with `status = 'running'`,
  `source = 'local'`; its id is the `run_id`.
- The response returns **immediately**: `{ pr_id, runs: ReviewRunTarget[], reviews: [] }`.
  `reviews` is always empty — execution is fire-and-forget. Clients subscribe to
  `/runs/:run_id/events` and refetch `/pulls/:id/reviews` when the stream ends.
- `all: true` with zero enabled agents returns 200 with `runs: []`.

## 4. Run executor lifecycle

`src/modules/reviews/run-executor.ts` `ReviewRunExecutor.executeRuns`:

1. **Shared pre-work, once per request.** `loadDiff` (`src/modules/reviews/diff-loader.ts`)
   tries `git diff base...head` on the clone; when that throws or yields no files
   it rebuilds a unified diff from `pr_files.patch`. Pre-work events fan out to
   every queued run's log. If loading throws, **every** queued run is marked `failed`.
2. **Agents run sequentially**; one agent's failure never aborts the others.
3. Per agent: resolve `container.llm(agent.provider)` (missing key → `ConfigError`
   → run `failed`); unless `agents.repo_intel` is `false`, gather best-effort
   context through `container.repoIntel` (callers digest, repo map, top-5% rank
   note). Enrichment errors only produce an `info` log line and an omitted section.

Statuses of `agent_runs.status` — the only legal values:

| Status | Set when | Row fields |
| --- | --- | --- |
| `running` | row created | — |
| `done` | review + findings persisted | tokens, `cost_usd`, `findings_count`, `grounding`, `score`, `blockers`, `error = null` |
| `failed` | any throw in the run, pre-work failure, or reaped on boot | tokens 0, `cost_usd = null`, `grounding = '0/0 passed'`, `error` = message (reaped rows keep `error` null) |
| `cancelled` | `POST /runs/:id/cancel` | as `failed`, `error = 'Cancelled by user'` when the runner observed it |

- Every terminal path ends with `runBus.complete(runId)` so the SSE stream closes,
  and saves a `run_traces` document (a minimal one built from the event buffer on
  failure/cancel) so the reason survives a reload.
- **Cancel** sets the bus flag, flips the row to `cancelled` only if still `running`,
  and completes the bus immediately — so it also works for orphaned runs. Known
  limitation (untested): the runner checks the flag only before each LLM call, and
  `RunBus.complete()` clears the flag, so an in-flight single-pass run is not aborted
  and may still finish and overwrite the row to `done`.
- **Boot reaping** (`src/app.ts`): all `running` rows become `failed` before the
  server listens. Assumes one API instance per database.

## 5. Calling reviewer-core

`reviewPullRequest` from `@devdigest/reviewer-core` (`../reviewer-core/src/review/run.ts`,
shared with the CI runner); the server owns I/O only. Input: `systemPrompt`, `model`, `diff`, `llm`,
`strategy = agent.strategy ?? 'single-pass'` (`src/modules/reviews/constants.ts`),
optional `callers` / `repoMap` / `prDescription` (omitted, not empty, when absent),
`task` from `taskLine()` (`src/modules/reviews/helpers.ts`) plus the rank note,
`sessionId = "<owner>/<name>#<number>:<agent>"`, `onEvent` → run log,
`checkCancelled` → throws `RunCancelledError`. The engine calls
`llm.completeStructured` with the `Review` schema, reduces partials, then grounds.

## 6. Grounding gate

`groundFindings` (`../reviewer-core/src/grounding.ts`; re-exported by
`src/platform/grounding.ts`) is mandatory and mechanical:

- a finding whose `file` is not in the diff is dropped;
- a normal finding is kept only if `[start_line, end_line]` intersects a new-side
  hunk line of that file;
- kinds `secret_leak`, `lethal_trifecta`, `phantom`, `hook` only need the file present.

The summary string is `"<kept>/<total> passed"`. **The persisted `score` is
recomputed from the kept findings** — `100 − (35·CRITICAL + 12·WARNING + 3·SUGGESTION)`,
clamped to 0–100 — never the model's self-reported number. Dropped findings are
logged to the run log and are not persisted anywhere else.

## 7. Persistence

In order, for a successful run: `reviews` row (`kind = 'review'`, `run_id`,
`agent_id`, `verdict`, `summary`, `score`, `model`) → `findings` rows (kept only) →
`pull_requests.last_reviewed_sha = head_sha` → `agent_runs` completed → `run_traces`
upsert → bus complete. These writes are not wrapped in one transaction.

- `findings.severity` is a text column; the legal values are the `Severity` enum
  **`CRITICAL` | `WARNING` | `SUGGESTION`** (`contracts/findings.ts`), enforced by
  the LLM output schema, not by the database. `category` ∈ bug/security/perf/style/test;
  `kind` defaults to `'finding'`.
- `blockers` = `countBlockers(kept, agent.ciFailOn)` — deterministic, independent of `verdict`.
- `reviews.run_id` has **no FK**: `DELETE /runs/:id` deletes the review explicitly
  (findings cascade from `reviews`), then the run (trace cascades from `agent_runs`).
  `DELETE /reviews/:id` leaves the `agent_runs` row in the history.

## 8. Cost recording

`agent_runs.cost_usd` is the engine's `outcome.costUsd`, persisted as-is on `done`;
`null` — never `0` — when any LLM call was un-priced and on failed/cancelled runs.
Same value in `RunTrace.stats.cost_usd` and `RunSummary.cost_usd`.

## 9. Finding actions

`POST /findings/:id/accept|dismiss` (`src/modules/reviews/findings.ts`). Tenancy is
resolved finding → review → pull request; a finding in another workspace → 404.
The two states are **mutually exclusive**: accept sets `accepted_at = now` and
clears `dismissed_at`; dismiss does the reverse. Repeating an action refreshes the
timestamp. There is no un-set endpoint. `learn`/`reply` exist in
`FindingActionKind` but have no route.

## 10. `GET /pulls/:id/reviews`

404 when the PR is not in the workspace. `ReviewRecord[]` by `created_at` desc — one
entry per agent pass, never merged. Fields: `id, pr_id, agent_id, run_id, agent_name`
(`null` if the agent was deleted)`, kind, verdict, summary, score, model, created_at,
findings[]`. A finding is a `FindingRecord`: `Finding` + `review_id`, `accepted_at`,
`dismissed_at` (ISO or null); `evidence` is always `null` (not persisted).
`grounding` is not populated here — read it from `/pulls/:id/runs` or the trace.

## 11. Trace endpoints

- `GET /runs/:id/events` — SSE, not rate limited. **Replay-first**: buffered events
  are sent, then live ones; the stream ends on bus completion, immediately after
  replay for an already-finished run. Frame: `id = seq`, `event = kind`
  (`info|tool|result|error`), `data` = JSON `RunEvent`. The buffer is in-memory
  (`src/platform/sse.ts`): after a restart the bus knows nothing about old runs, so
  clients must read finished runs from the trace, not from this stream.
- `events`, `trace` and `cancel` resolve the request context but address the run by
  id only — they are not filtered by workspace (single-workspace MVP).
- `GET /runs/:id/trace` — the single jsonb `RunTrace` (`config`, `stats`,
  `prompt_assembly`, `tool_calls`, `raw_output`, `log`); 404 until a terminal state
  has written it. `log` includes the shared pre-work lines.
