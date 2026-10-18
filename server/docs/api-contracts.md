# API Contracts

Base URL: `http://localhost:3001`

All routes use `fastify-type-provider-zod`. Every input and output is validated by Zod schemas defined in `src/vendor/shared/` (the `@devdigest/shared` package).

## Routes

### Repos

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/repos` | List all repos |
| `POST` | `/repos` | Add a repo (by GitHub URL or local path) |
| `GET` | `/repos/:id` | Get repo details |

### Pulls

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/repos/:repoId/pulls` | List PRs for a repo |
| `POST` | `/repos/:repoId/pulls/import` | Import PRs from GitHub |
| `GET` | `/pulls/:id` | Get PR details (with diff) |
| `POST` | `/pulls/:id/review` | Start a review run → returns `{ runId }` |

Rate limit: `POST /pulls/:id/review` — 120/min globally.

### Reviews & Runs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pulls/:id/reviews` | List reviews for a PR |
| `GET` | `/reviews/:id` | Get review with findings |
| `GET` | `/pulls/:id/smart-diff` | PR files grouped by role (`core, tests, wiring, docs, boilerplate`) + finding lines of the latest review; deterministic, no LLM |
| `GET` | `/runs/:id/events` | SSE stream of `RunEvent` objects |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agents` | List agents |
| `POST` | `/agents` | Create agent |
| `PUT` | `/agents/:id` | Update agent |
| `DELETE` | `/agents/:id` | Delete agent |

### Repo Intel

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/repos/:id/index` | Trigger symbol/import indexing |
| `GET` | `/repos/:id/map` | Get repo map (for review context) |

### Blast

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pulls/:id/blast` | Blast radius of a PR (`BlastRadiusResponse`): changed symbols, callers grouped per symbol as `file:line`, affected endpoints/crons. Read-only, served from the prebuilt repo index (no model call, no re-parse); `degraded` + `reason` pass through. 404 for an unknown PR |
| `GET` | `/pulls/:id/prior-prs` | Prior merged PRs touching the same files (`PriorPrsResponse`), built from the local clone's git history (no GitHub token needed) |
| `GET` | `/repos/:id/index-state` | Index status of a repo (existing; used by the UI to detect an incomplete index) |
| `POST` | `/repos/:id/resync` | Fetch latest and re-index incrementally (existing; 202; backs the Resync button) |

### Brief

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pulls/:id/brief` | Stored PR Why + Risk Brief: `{ brief: PrBriefRecord \| null, stale, current_head_sha, generating }`. `stale` = the brief's `head_sha` differs from the PR's current head. **GET never calls a model, GitHub or git** (database only). A malformed stored row is served as `brief: null`. 404 for an unknown PR |
| `POST` | `/pulls/:id/brief` | (Re)generate the brief with exactly one structured model call (model from the `risk_brief` setting) and overwrite the stored row. Returns the same shape as GET with `generating: false`. Rate limited to 10/min (429) |

Brief error codes (envelope `{ error: { code, message, details? } }`; never carries raw model output, prompt or spec text):

| Condition | HTTP | `code` |
|-----------|------|--------|
| PR not in workspace | 404 | `not_found` |
| Generation already running for the PR | 409 | `brief_generation_in_progress` |
| Fixed content alone exceeds the 8,000-token input budget | 422 | `brief_input_over_budget` |
| Risk Brief provider has no API key | 400 | `brief_model_not_configured` (`details: { setting: 'risk_brief', provider }`) |
| Provider error / timeout / invalid output after repairs | 502 | `brief_model_failed` (no `details`) |

### Settings & Workspace

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings` | Get current settings (providers, models) |
| `PUT` | `/settings` | Update settings |
| `GET` | `/workspace` | Workspace status |

## SSE Protocol — `GET /runs/:id/events`

The client subscribes with `EventSource`. The server emits `RunEvent` objects as newline-delimited JSON in the `data` field of each SSE message.

```typescript
// RunEvent union — defined in @devdigest/shared
type RunEvent =
  | { type: "started";   runId: string }
  | { type: "log";       runId: string; message: string }
  | { type: "progress";  runId: string; step: string; percent: number }
  | { type: "completed"; runId: string; reviewId: string }
  | { type: "failed";    runId: string; error: string }
```

Connection closes automatically on `completed` or `failed`.

## Zod Schema Locations

All schemas are in `server/src/vendor/shared/`. Key files:

| File | Contains |
|------|---------|
| `review.ts` | `Review`, `Finding`, `Severity`, `Verdict` |
| `agent.ts` | `Agent`, `CreateAgentBody` |
| `repo.ts` | `Repo`, `Pull` |
| `settings.ts` | `Settings`, `LLMProvider` enum |
| `run.ts` | `Run`, `RunEvent` |

## Error Format

All errors return:
```json
{ "statusCode": 422, "error": "Unprocessable Entity", "message": "..." }
```

Zod validation failures return `422` with the full Zod error tree in `message`.
