# Review contract — what must stay true

Behavioural contract of `@devdigest/reviewer-core`. A change that breaks any numbered
rule is a breaking change for the server, the CI runner and the tests. Architecture and
rationale live in [`../docs/pipeline.md`](../docs/pipeline.md).

Schemas are single-sourced in `server/src/vendor/shared/contracts/findings.ts`
(Zod) and `server/src/vendor/shared/adapters.ts` (`UnifiedDiff`, `LLMProvider`).

## 1. Input — `ReviewInput` (`src/review/run.ts`)

| Field | Required | Contract |
|---|---|---|
| `systemPrompt` | yes | Trusted. The injection guard is always appended to it. |
| `model` | yes | Opaque id, passed through to the provider. |
| `diff` | yes | Parsed `UnifiedDiff`: `raw` + `files[{ path, additions, deletions, hunks[] }]`; each hunk has `newStart`, `newLines`, `newLineNumbers`. |
| `llm` | yes | Any `LLMProvider`; only `completeStructured` is called. |
| `strategy` | no | `'auto'` (default), `'single-pass'`, `'map-reduce'`. |
| `skills`, `memory`, `specs` | no | **Resolved strings**, never slugs. |
| `repoMap`, `callers`, `prDescription` | no | Untrusted; empty or whitespace-only means the section is omitted. |
| `task` | no | First line of the user message. |
| `maxRetries` | no | Default `2` (`DEFAULT_REVIEW_MAX_RETRIES`). |
| `mapThresholdLines` | no | Default `400` (`DEFAULT_MAP_THRESHOLD_LINES`). |
| `sessionId` | no | Forwarded on every LLM call; omitted from the request when unset. |
| `onEvent` | no | Progress sink `{ kind, msg, data? }`. |
| `checkCancelled` | no | Must **throw** to abort; called before each chunk's LLM call. |

- **R1.1** The engine performs no I/O other than `llm.completeStructured`.
- **R1.2** Omitting every optional slot yields a prompt with only the task (if any) and
`## Diff to review`.

## 2. Output — `ReviewOutcome`

`review` (`Review`), `grounding` (string `"<kept>/<total> passed"`), `dropped`
(`{ finding, reason }[]`), `mode` (`'single-pass' | 'map-reduce'`), `assembly`
(`PromptAssembly`), `chunks` (`{ label }[]`), `tokensIn`, `tokensOut`, `costUsd`
(`number | null`), `raw` (chunk outputs joined with `\n---\n`).

### `Review`

| Field | Type | Source |
|---|---|---|
| `verdict` | `'request_changes' \| 'approve' \| 'comment'` | model (worst of the partials) |
| `summary` | string | model (partials joined with a space) |
| `score` | int 0–100 | **engine** — see section 4 |
| `findings` | `Finding[]` | model, filtered by grounding |

### `Finding`

| Field | Type |
|---|---|
| `id` | string |
| `severity` | `'CRITICAL' \| 'WARNING' \| 'SUGGESTION'` |
| `category` | `'bug' \| 'security' \| 'perf' \| 'style' \| 'test'` |
| `title`, `file`, `rationale` | string (`rationale` is markdown) |
| `start_line`, `end_line` | int, new-side line numbers |
| `suggestion` | string, nullish |
| `confidence` | number 0–1 |
| `kind` | `'finding' \| 'secret_leak' \| 'lethal_trifecta' \| 'phantom' \| 'hook'`, nullish |
| `trifecta_components`, `evidence` | nullish; only for `lethal_trifecta` |

- **R2.1** `Severity` has exactly three values, upper-case. The score table, the gate
ranks (`SEV_RANK` in `src/output/to-review.ts`) and the client all key on them.
- **R2.2** `Verdict` values are lower snake-case. The verdict is model-reported and is
**not** recomputed after grounding; it may disagree with the surviving findings.
Anything that must be trustworthy (score, CI event, blocker count) is derived from
findings instead.

## 3. Grounding rules (`src/grounding.ts`)

- **R3.1** A finding whose `file` is not in `diff.files` is dropped, regardless of kind.
- **R3.2** A finding with `kind` in `{secret_leak, lethal_trifecta, phantom, hook}` is
kept once its file is in the diff; line numbers are not checked.
- **R3.3** Every other finding (including `kind` null/`'finding'`) is kept only if at
least one integer in `[min(start,end), max(start,end)]` is a new-side line of a hunk of
that file. A reversed range is tolerated.
- **R3.4** New-side lines come from `hunk.newLineNumbers`; when that array is empty the
fallback is `newStart … newStart + max(newLines, 1) − 1`.
- **R3.5** Intersection is enough — `end_line` itself may be an unchanged line. That is
why `toReviewPayload` re-anchors inline comments to the in-range diff line nearest
`end_line` and drops the inline comment (not the finding) when none exists.
- **R3.6** Grounding runs exactly once per review, after reduce, against the full diff.
- **R3.7** Every dropped finding appears in `outcome.dropped` with a reason and as an
`info` event; `grounding` counts `kept / (kept + dropped)`.

## 4. Score formula (`src/review/reduce.ts`)

```
score = clamp(0, 100, 100 − (35 × #CRITICAL + 12 × #WARNING + 3 × #SUGGESTION))
```

- **R4.1** Computed over findings that **survived grounding**, never the model's `score`
and never the pre-grounding set.
- **R4.2** Anchor values: 0 findings → 100; 1 SUGGESTION → 97; 1 WARNING → 88;
1 CRITICAL → 65; 3 CRITICAL → 0 (clamped).
- **R4.3** An unknown severity contributes 0 (defensive `?? 0`), it does not throw.
- **R4.4** `reduceReviews` returns the mean partial score, but `reviewPullRequest` always
overwrites it. With a single partial, `reduceReviews` returns that partial unchanged.

## 5. Deterministic vs model-driven

| Deterministic (engine) | Model-driven |
|---|---|
| mode selection, chunking, section order | which findings exist, their text |
| untrusted wrapping, 4000-char PR body cap | `severity`, `category`, `confidence` |
| grounding keep/drop and reasons | `verdict`, `summary` |
| `score` | the raw `score` (discarded) |
| review event and blockers in `to-review.ts` | — |

Review event (`toReviewPayload`): no findings → `APPROVE`; any finding at or above the
`failOn` floor (`never` ∞, `critical` 3, `warning` 2, `any` 1; default `critical`) →
`REQUEST_CHANGES`; otherwise `COMMENT`. The model verdict is ignored here.

## 6. Failure and cancellation

- **R6.1** The engine never swallows errors: provider errors, schema failure after
`maxRetries + 1` attempts, and a throwing `checkCancelled` all reject the promise.
- **R6.2** If `checkCancelled` throws before the first chunk, the LLM is never called.
- **R6.3** `costUsd` is `null` if any chunk's cost is `null`; tokens are always summed.

## 7. Invariants the tests rely on

- `test/run.test.ts`: the default `MockGitClient` diff (`server/src/adapters/mocks.ts`)
  covers `src/config.ts` new-side lines 10–12 (context lines count as covered —
  `server/src/adapters/git/diff-parser.ts`), so a finding at line 11 is kept and one
  at 999 is dropped → `grounding === '1/2 passed'`, `score === 65` despite the model's 38.
- `test/run.test.ts`: `{ score: 10, findings: [] }` yields `score === 100`.
- `test/run.test.ts`: an event message containing `Citation grounding` is emitted;
  `sessionId` reaches every `completeStructured` call.
- `test/prompt.test.ts`: the guard text is part of the system message; `## PR description`
  precedes `## Diff to review`, is wrapped, omitted when blank, and cut at 4000 chars.
- `test/to-review.test.ts`: the event table above, `countBlockers` agreeing with
  `gateTriggered`, and the body header following the computed event, not the verdict.

Changing a weight, a severity name, an event rule or a section heading requires updating
these tests, this file, and any persisted expectations in the server and client.
