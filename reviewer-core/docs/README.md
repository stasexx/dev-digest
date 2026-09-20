# docs — reviewer-core

Deep-dives for the `reviewer-core` package (pipelines, diagrams, design notes).
`reviewer-core/CLAUDE.md` links here via *Read When*.

| File | Read when |
|---|---|
| [`pipeline.md`](pipeline.md) | Architecture and data flow: entry points, strategy selection, prompt assembly, LLM provider + structured output, grounding gate, score reduction, errors/cancel, how the server consumes the package, test layout. |

Behavioural contract (what must stay true) lives in [`../specs/`](../specs/README.md).
