## Workflow Retro — run-plan-pr-brief

**Run:** the SDD pipeline for PR Brief (HW L05): spec-creator → implementation-planner (+ cross-model review by Codex) → run-plan (T1–T8, T10 gate, T6-fix, then architecture-reviewer ∥ plan-verifier).
- **Agents:** 15, of which 14 are top-level and 1 is nested (an Explore spawned by implementation-planner).
- **Mode:** multi-agent.
- **Data:** `deep`, parsed from the subagent JSONL journals of this session (2026-10-18).

**Prices.** Per-MTok rates are from the Anthropic pricing page, checked at retro time:

| Model | Input | Output | Cache read | Cache write (1 h) |
|---|---|---|---|---|
| Opus 5.5 | $4 | $20 | $0.20 | $8 |
| Sonnet 5.5 | $2 | $10 | $0.10 | $4 |

- Costs are **API list-price equivalents**, not a bill.
- The Codex (OpenAI) cross-model review ran outside Claude Code, so it is not in the totals (n/a).

> **Counting note.** The bundled `analyze_journals.py` sums `usage` on every journal line. Claude Code writes one line per content block, all carrying the same `message.id` and `usage`, so the helper reports **$74.66 / 709 tool calls** for this run. The table below counts each `message.id` once and each `tool_use.id` once, which gives **$33.94 / 466 tool calls** (the helper overstates by 2.2×). See recommendation 1.

### Metrics

| # | agent | depth | model | turns | in | out | cache-read | cache-write | hit% | tools | span | cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | spec-creator: PR Brief spec | 1 | opus-5-5 | 74 | 150 | 78,340 | 12,506,692 | 577,387 | 96% | 83 | 2499s | $8.69 |
| 2 | implementation-planner: PR Brief plan | 1 | opus-5-5 | 104 | 210 | 172,445 | 28,174,772 | 764,171 | 97% | 116 | 1761s | $15.20 |
| 3 | └ Explore client for PR Brief | 2 | opus-5-5 | 35 | 70 | 30,189 | 3,408,786 | 155,150 | 96% | 84 | 291s | $2.53 |
| 4 | run-plan T1: contracts | 1 | sonnet-5-5 | 9 | 18 | 9,583 | 477,938 | 70,090 | 87% | 10 | 71s | $0.42 |
| 5 | run-plan T2: budget/prompt/grounding | 1 | sonnet-5-5 | 13 | 26 | 35,387 | 1,162,257 | 107,501 | 92% | 14 | 246s | $0.90 |
| 6 | run-plan T3: input gathering | 1 | sonnet-5-5 | 15 | 30 | 17,980 | 1,358,157 | 103,061 | 93% | 16 | 139s | $0.73 |
| 7 | run-plan T5: client data/i18n | 1 | sonnet-5-5 | 7 | 14 | 6,351 | 365,598 | 48,316 | 88% | 7 | 58s | $0.29 |
| 8 | run-plan T4: brief service+routes | 1 | sonnet-5-5 | 34 | 68 | 32,386 | 3,347,695 | 120,983 | 97% | 37 | 280s | $1.14 |
| 9 | run-plan T6: PR Brief block UI | 1 | sonnet-5-5 | 18 | 36 | 27,612 | 1,350,915 | 95,245 | 93% | 18 | 186s | $0.79 |
| 10 | run-plan T7: Files changed deep link | 1 | sonnet-5-5 | 9 | 18 | 13,534 | 601,277 | 73,943 | 89% | 10 | 95s | $0.49 |
| 11 | run-plan T8: Overview + page wiring | 1 | sonnet-5-5 | 15 | 30 | 8,535 | 1,054,991 | 74,382 | 93% | 17 | 79s | $0.49 |
| 12 | run-plan T10: integration gate | 1 | sonnet-5-5 | 7 | 14 | 4,644 | 364,212 | 49,611 | 88% | 8 | 56s | $0.28 |
| 13 | run-plan T6-fix: i18n comment | 1 | sonnet-5-5 | 4 | 8 | 1,150 | 163,896 | 32,773 | 83% | 3 | 19s | $0.16 |
| 14 | run-plan gate: architecture-reviewer | 1 | sonnet-5-5 | 14 | 28 | 8,895 | 1,155,732 | 98,030 | 92% | 17 | 67s | $0.60 |
| 15 | run-plan gate: plan-verifier | 1 | sonnet-5-5 | 22 | 44 | 24,627 | 3,087,313 | 168,155 | 95% | 26 | 241s | $1.23 |

**Totals:**
- Tokens: in 764 · out 471,658 · cache-read 58.6M · cache-write 2.54M. Cache hit is **96%**.
- Tools: 466. Cost: **$33.94**.

**By phase:**

| phase | agents | wall | Σ spans | parallelism | cost |
|---|---|---|---|---|---|
| spec + plan (Opus) | 3 (2 + 1 nested) | 71.3 min, which includes human Q&A and the Codex round | 75.9 min | 1.06× | **$26.42 (78%)** |
| run-plan (Sonnet) | 12 | **19.9 min** | 25.6 min | **1.29×** | **$7.52 (22%)** |

**Launch order:**
1. spec-creator, then **human** answers the 14 open questions.
2. implementation-planner (└ Explore), then **Codex** cross-model review (REVISE, 9 findings), then implementation-planner revises the plan in place.
3. T1.
4. (T2 ‖ T3 ‖ T5).
5. (T4 ‖ T6 ‖ T7).
6. T8.
7. T10 (RED).
8. T6-fix (plus 1 out-of-plan commit by the orchestrator).
9. T10 re-check.
10. (architecture-reviewer ‖ plan-verifier).

**Critical path:**
- spec-creator (2499 s, mostly waiting on the human's answers).
- Inside run-plan: T4 (280 s), then T2 (246 s) and plan-verifier (241 s).

**Cost per useful output:**
- **$33.94 per shipped feature**. That covers 68 ACs (all `done` or T9-only), 10 commits and 76 files.
- $1.36 per plan-verifier-verified task (T0–T8, T10 + the gate: 25 units).
- The product itself spends **≈ $0.036 per brief**. This is one `claude-sonnet-4-6` call: 5,503 tokens in, 1,267 out, at $3 / $15 per MTok, `attempts: 1`, from the live V-GEN/V-LOG.

### What went well
- **Every implementer finished first try.**
  - T1–T8 were all green on their own Acceptance lists, with no clarifying round-trips.
  - The only rework was one T6-fix, for a code comment that contained a UI literal (19 s, $0.16).
- **The frozen interfaces worked.**
  - T1 (contracts) and T5 (messages/hooks) went first, and no `T1-fix`/`T5-fix` was needed.
  - The three-wide batches never collided on files.
- **The gates did their job.**
  - T10 caught what the per-task checks could not: the V-I18N grep hit, and two files outside the Owned paths.
  - architecture-reviewer: **PASS**, 0 critical, 0 high.
  - plan-verifier: 0 missing / 0 partial on 68 ACs, verdict REVIEW, with only the T9 operator ACs open.
- **The cross-model review paid off.** Codex (gpt-6-astra) found 9 real plan defects before any code existed. Examples:
  - failed model calls were not logged;
  - the POST could return `generating:true`;
  - SHA/files snapshot drift;
  - the scroll race.

  Each became a test in T3, T4 or T7.
- **Cache efficiency was 96%** across the run, so the stable prefixes were cached.

### What was hard / wasteful
- **Spec and plan cost 78% of the run.**
  - Two Opus agents with very long contexts: the planner made 104 turns and read 28.2M cache-read tokens.
  - The plan grew to 1,597 lines / 127 KB.
  - Each Sonnet implementer re-read large parts of it.
- **The same large plan was read by 12 run-plan agents.** About 30k tokens of plan per agent are mostly irrelevant outside the agent's own task section. Cache reads make this cheap ($0.10/MTok), but it still inflates turns and latency.
- **The spec-creator span is mostly human wait.** 14 open questions were batched into one round. That is good (one round-trip), but the 41-minute span inflates wall-clock.
- **The nested Explore duplicated the planner's own reads.** It spent 84 tool calls / $2.53 surveying the client, which the planner then partly re-read itself.
- **Missed by every agent:**
  - The lab's `shell.nav.project-context` key was missing, which threw MISSING_MESSAGE on every page.
  - It was caught only by the orchestrator's live browser check and fixed out of plan (`dcf9d78`).
  - No agent rendered the real UI, because jsdom tests load only the namespaces they need.
- **The plan-verifier ran 5 of 11 integration files.** That was enough for the changed paths, but the full IT suite was not re-run inside the gate.
- **Tooling:** the retro helper double-counts, as described in the counting note above.

### Recommendations (actionable)
1. **`workflow-retro/scripts/analyze_journals.py`.**
   - Change: aggregate `usage` once per `message.id`, and count `tool_use` blocks once per `tool_use.id`.
   - Effect: the reported cost and tool counts become correct. Today they are ~2.2× too high, and earlier ledger rows are probably inflated too.
2. **run-plan dispatch brief.**
   - Change: pass each implementer only its own task block plus the shared "Architecture changes", "Logging contract" and "Handoff" sections. Today it gets the whole 127 KB plan.
   - Effect: fewer turns per implementer, and the T4 critical path gets shorter.
3. **implementation-planner.**
   - Change: hand the nested Explore an explicit file list from the spec's Provenance section, instead of an open "survey the client" brief. Or skip it, since the spec already cites `path:line`.
   - Effect: ~$2.5 and ~5 min saved, with no duplicate reads.
4. **T10 / plan-verifier.**
   - Change: add a one-line live UI smoke step: load one page per touched route and fail on `MISSING_MESSAGE` in the web log.
   - Effect: it catches missing-translation regressions that jsdom tests cannot see. That is the class of bug caught only by the human in this run.
5. **Model mix.** Keep Opus for the planner, because the plan quality is what made run-plan first-try green. Try spec-creator's research turns on Sonnet. Spec-creator cost $8.69, for 12.5M cache-read tokens over 74 turns.

### Ledger
Appended to `docs/retros/ledger.md`: 2026-10-18 · run-plan-pr-brief · 15 (14+1 nested) · 0.8k→472k (58.6M cache-read) · 96% · 91.2 min (run-plan 19.9 min) · 1.10× (run-plan 1.29×) · $33.94.
