# API Contract Reviewer — skills

Four skills for the **API Contract Reviewer** agent (prompt: [`../../agent-prompts/api-contract-reviewer.md`](../../agent-prompts/api-contract-reviewer.md)).
Each has a directive description (when to apply + what to do) and good/bad examples.

| Skill | Catches |
|---|---|
| [`breaking-change`](breaking-change.md) | removed/renamed/changed public contract elements |
| [`response-schema`](response-schema.md) | response shape, type, requiredness and format drift |
| [`semver-discipline`](semver-discipline.md) | version bump smaller than the change requires |
| [`deprecation-policy`](deprecation-policy.md) | silent removal instead of deprecate-then-remove |

Load them in the app: **Skills → Add → Create** (paste body) or **Add → Import** (upload the `.md`; at least one goes through import so the untrusted-input preview path is exercised). Then attach in **Agents → API Contract Reviewer → Skills**; order = order of blocks in the prompt (`breaking-change` first).
