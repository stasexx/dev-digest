# Flow contract — what each e2e flow asserts and depends on

One row per `e2e/specs/*.flow.json`. A flow passes only while **both** its seeded data
(`server/src/db/seed.ts`) and the literal UI text it waits for stay unchanged. Change
either side and you must update the flow in the same MR. Harness mechanics are in
[`../docs/harness.md`](../docs/harness.md).

## Flows

| File | Asserts | Seeded data it needs | UI text / URL it matches |
|---|---|---|---|
| `01-app-boot.flow.json` | Client + API + DB are live: `/` redirects to a repo's PR list and the heading renders. | At least one repo (any). Zero repos renders an empty state instead of redirecting. | URL contains `/pulls`; text `Pull Requests`. |
| `02-repo-pulls-detail.flow.json` | Clicking the seeded PR row opens the nested detail route and the title renders there. | `acme/payments-api` is the **first** repo; PR number `482`; PR title. | Text `Add rate limiting to public API endpoints` (list and detail); URL `/pulls/482`. |
| `03-agents.flow.json` | `/agents` lists the seeded agents. | Agent named `Security Reviewer`. | URL `/agents`; text `Security Reviewer`. |
| `04-pr-findings.flow.json` | The Agent runs tab shows the seeded review: verdict, finding count, and the first finding card, with the newest run open by default. | Review verdict `request_changes`; exactly **2** findings; CRITICAL finding titled `Hardcoded Stripe secret key in commit`. | Button named `Agent runs`; URL `tab=findings`; text `request changes`, `2 findings`, `Hardcoded Stripe secret key in commit`. |
| `05-pr-diff.flow.json` | The Files changed tab renders the seeded changed files. | `pr_files` row with path `src/config.ts`. | Button named `Files changed`; URL `tab=diff`; text `src/config.ts`. |
| `06-onboarding.flow.json` | The add-repository form renders. Never submits. | None. | URL `/onboarding`; text `Add a repository`, `Repository URL`. |
| `07-settings.flow.json` | Both settings sections render their titles. | None (works with no API keys stored). | URLs `/settings/api-keys`, `/settings/models`; text `API Keys`, `Feature Models`. |

## Where the matched text comes from

| Text | Source |
|---|---|
| `Pull Requests` | `client/messages/en/prReview.json` (`title`), also the nav label in `client/src/vendor/ui/nav.ts` |
| root redirect to `/repos/<id>/pulls` | `client/src/app/page.tsx` — `router.replace` to `repos[0]` |
| PR title, `#482`, `src/config.ts`, finding titles, agent names | `server/src/db/seed.ts` |
| `Agent runs`, `Files changed` tab labels and the `findings` / `diff` tab keys | `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx` |
| `?tab=` URL state | `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` |
| `request changes` | `ReviewRunAccordion.tsx` renders `review.verdict.replace("_", " ")` — it is the DB value, not an i18n string |
| `2 findings` | `ReviewRunAccordion.tsx`: `` `${findings.length} finding${length === 1 ? "" : "s"}` `` — hard-coded English, computed from the findings array |
| newest run open by default | `FindingsTab.tsx` passes `defaultOpen={i === 0}` |
| `Add a repository`, `Repository URL` | `client/src/app/onboarding/_components/AddRepoView/AddRepoView.tsx` |
| `API Keys`, `Feature Models` | `client/messages/en/settings.json` |

Both accordion files live under
`client/src/app/repos/[repoId]/pulls/[number]/_components/`.

## Sensitivities worth knowing

- **`2 findings` is a count, not a label.** Adding or removing a seeded finding turns it
  into `3 findings` / `1 finding` and breaks 04.
  Note there is a *different* i18n string `{count} finding(s)` (`runStatus.findings` in
  `prReview.json`, used by `RunHistory`) — it would never match `2 findings`.
- **`wait --text` is a substring match on the page.** `Pull Requests` also appears in the
  sidebar nav, so 01 proves the shell rendered, not specifically the list heading.
  `API Keys` likewise appears in the settings nav. Prefer text unique to the component
  under test when adding flows.
- **The seeded score (61) is not the engine formula** (`100 − 35 − 12 = 53`); the seed
  inserts the review row directly and never goes through `reviewer-core`. No flow may
  assert on the score until that is reconciled.
- **Flows 02/04/05 click the PR by its title**, so the title must stay unique on the
  list page.
- **04 asserts only the CRITICAL finding's title.** The WARNING finding
  (`N+1 query in user list endpoint`) is covered only through the `2 findings` count.
- **Ordering.** Files run in lexical order in one shared browser session, but every flow
  starts with its own `open`, so none depends on the page state a previous flow left.

## Determinism rules

1. **No LLM.** Never click "Run review" or any action that starts an agent run; never use
   agent-browser's `chat` command. Flows read seeded rows only.
2. **No network beyond localhost.** No GitHub import, no clone, no model listing that
   needs a key. 06 renders the form and stops; 07 only checks section titles.
3. **Read-only.** A flow must not mutate the DB (no dismiss/accept, no settings save), so
   reruns against the same stack and any execution order give the same result.
4. **Self-contained.** Start every flow with `open`; do not rely on the previous flow.
5. **Assert with exit codes.** Use `wait --url`, `wait --text`, `wait --load networkidle`
   and `find role|text|label … click`. No sleeps, no CSS/class selectors, no coordinates.
6. **Assert on stable literals** — seeded values or component-owned strings. Avoid
   relative times ("3 minutes ago"), generated ids (repo/PR UUIDs in URLs), costs, and
   anything derived from the clock.
7. **Fresh seed is a precondition**, not something a flow may repair. Run through
   `scripts/e2e.sh` locally; CI (`.github/workflows/e2e-web.yml`) seeds an empty DB.
8. **Naming**: `NN-kebab-name.flow.json`, with `name` and a `description` that says which
   component/route it exercises and which seeded data it assumes.

## Changing things safely

| You change… | Then also… |
|---|---|
| seeded PR title / number / files / findings / agent names in `server/src/db/seed.ts` | update 02–05 (and 03 for agents) and the tables above |
| tab labels or tab keys in `PrDetailHeader.tsx` | update 04 and 05 |
| the finding-count or verdict rendering in `ReviewRunAccordion.tsx` | update 04 |
| onboarding or settings headings | update 06 / 07 |
| add a new flow | add a row to **Flows**, and to the coverage table in `e2e/README.md` |
