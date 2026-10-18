# Workflow Retro Ledger

One row per `/workflow-retro` run, so multi-agent runs can be compared over time.
Cost uses per-model rates verified via the `claude-api` skill at retro time (rates drift).

| date | label | agents | in→out tok | cache hit | wall | parallelism | cost | top recommendation |
|------|-------|--------|-----------|-----------|------|-------------|------|--------------------|
| 2026-06-30 | spec-project-context | 5 (1+4 nested) | 33k→79k (8.1M cache-read) | 85% | 22.9m | 1.4× | $11.89 | Give spec-creator `Edit` so it revises in place instead of rewriting the whole spec each turn (already fixed) |
| 2026-06-30 | run-plan-project-context | 21 (all depth-1) | 20k→197k (86.5M cache-read) | 95% | ~46m | ~1.4× | ≈$50 (est) | Decide e2e inclusion *before* dispatch — T17 ran ~484s / 20k out / 82 tools, then was fully reverted |
| 2026-10-18 | run-plan-pr-brief | 15 (14+1 nested) | 0.8k→472k (58.6M cache-read) | 96% | 91.2m (run-plan 19.9m) | 1.10× (run-plan 1.29×) | $33.94 | Fix analyze_journals.py to count each message.id once (it overstated this run 2.2×: $74.66) |
