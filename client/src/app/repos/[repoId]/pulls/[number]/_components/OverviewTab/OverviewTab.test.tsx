import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import prReview from "../../../../../../../../messages/en/prReview.json";
import blast from "../../../../../../../../messages/en/blast.json";
import brief from "../../../../../../../../messages/en/brief.json";
import { OverviewTab } from "./OverviewTab";

const PR_ID = "pr-1";
const REPO_ID = "repo-1";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith(`/pulls/${PR_ID}/brief`))
        return json({ brief: null, stale: false, current_head_sha: "h1", generating: false });
      if (url.endsWith(`/pulls/${PR_ID}/reviews`)) return json([]);
      if (url.endsWith(`/pulls/${PR_ID}/intent`)) return json({ summary: "Intent text", in_scope: [], out_of_scope: [] });
      // blast, prior-prs, index-state: the cards render their own error/empty state.
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ui(prBody: string | null = "PR description text") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, blast, brief }} onError={() => {}}>
        <OverviewTab
          prBody={prBody}
          prId={PR_ID}
          repoId={REPO_ID}
          repoFullName="o/r"
          headSha="h1"
          changedFiles={["a.ts"]}
          onOpenFile={vi.fn()}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("OverviewTab", () => {
  it("shows the PR Brief block with Generate, Intent, Blast radius and the description", async () => {
    ui();
    expect(await screen.findByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("PR description text")).toBeInTheDocument();
  });

  it("omits the description section when the PR has no body", async () => {
    ui(null);
    await screen.findByRole("button", { name: "Generate brief" });
    expect(screen.queryByText("Description")).toBeNull();
  });
});
