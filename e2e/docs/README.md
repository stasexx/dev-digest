# docs — e2e

Deep-dives for the `e2e` package (pipelines, diagrams, design notes).
`e2e/CLAUDE.md` links here via *Read When*.

| File | Read when |
|---|---|
| [`harness.md`](harness.md) | How the harness works: `scripts/e2e.sh` hermetic stack (ports, ephemeral Postgres, migrate + seed), the `run.ts` runner, flow JSON format and allowed steps/locators, seeded-data dependencies, iterating on one flow, debugging. |

Per-flow contract and determinism rules: [`../specs/flows.md`](../specs/flows.md).
