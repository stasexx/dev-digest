# specs — reviewer-core

Specs / acceptance criteria for the `reviewer-core` package — behaviour that must stay true.

| File | Covers |
|---|---|
| [`review-contract.md`](review-contract.md) | `ReviewInput` / `ReviewOutcome` shapes, `Finding` fields, `Severity` and `Verdict` enums, grounding rules, score formula (35 / 12 / 3), deterministic vs model-driven parts, invariants the tests rely on. |

Architecture and rationale: [`../docs/pipeline.md`](../docs/pipeline.md).
