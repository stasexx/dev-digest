import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadiusResponse, PriorPrsResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { DOWNSTREAM, FACTS } from "./_components/BlastGraph/fixtures";
import { BlastRadiusCard } from "./BlastRadiusCard";

const REPO_ID = "repo-1";
const PR_ID = "pr-1";

const BLAST: BlastRadiusResponse = {
  changed_symbols: ["rowsToSettings", "taskLine", "reviewToDto", "findingRowToDto", "a", "b", "c"].map((name) => ({
    name,
    file: "server/src/x.ts",
    kind: "function",
  })) as BlastRadiusResponse["changed_symbols"],
  downstream: DOWNSTREAM,
  impacted_endpoints: ["GET /settings", "GET /settings/secrets-status", "PUT /settings"],
  stats: { symbols: 7, callers: 6, endpoints: 3, crons: 0 },
  facts_by_file: FACTS,
  degraded: false,
  reason: null,
  index_status: "full",
  commit_sha: "abc123",
  limits: { max_callers_per_symbol: 20, bfs_depth: 2 },
  truncated: false,
} as BlastRadiusResponse;

const PRIOR: PriorPrsResponse = {
  history: [],
  source: "git",
  clone_available: true,
  commits_scanned: 50,
} as PriorPrsResponse;

let blastPayload: BlastRadiusResponse;
let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  blastPayload = BLAST;
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith(`/pulls/${PR_ID}/blast`)) return json(blastPayload);
    if (url.endsWith(`/pulls/${PR_ID}/prior-prs`)) return json(PRIOR);
    if (url.endsWith(`/repos/${REPO_ID}/resync`) && init?.method === "POST") return json({ status: "accepted" });
    if (url.endsWith(`/repos/${REPO_ID}/index-state`)) return json({ status: "full", filesIndexed: 1, filesSkipped: 0, lastIndexedSha: "x", updatedAt: "t0" });
    return Promise.resolve(new Response("{}", { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard prId={PR_ID} repoId={REPO_ID} repoFullName="stasexx/dev-digest" headSha="head1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("shows stats and the tree by default", async () => {
    renderCard();
    expect(await screen.findByText("rowsToSettings()")).toBeTruthy();
    expect(screen.getByText("Blast radius")).toBeTruthy();
    for (const n of ["7", "6", "3", "0"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Tree" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Graph" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("switches to the graph view", async () => {
    renderCard();
    await screen.findByText("rowsToSettings()");
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Graph" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("blast-endpoints")).toBeNull();
  });

  it("shows the degraded notice and posts a resync", async () => {
    blastPayload = {
      ...BLAST,
      downstream: [],
      stats: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      degraded: true,
      reason: "no_data",
      index_status: "degraded",
    };
    renderCard();
    expect(await screen.findByText("Index incomplete")).toBeTruthy();
    expect(screen.getByText(messages.degraded.reason.no_data)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, i]) => String(u).endsWith(`/repos/${REPO_ID}/resync`) && (i as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeTruthy();
    });
  });

  it("explains when changed symbols have no downstream callers", async () => {
    blastPayload = { ...BLAST, downstream: [], stats: { symbols: 2, callers: 0, endpoints: 0, crons: 0 } };
    renderCard();
    expect(await screen.findByText("2 changed symbol(s), no downstream callers found.")).toBeTruthy();
  });

  it("explains when no symbols are indexed", async () => {
    blastPayload = { ...BLAST, changed_symbols: [], downstream: [], stats: { symbols: 0, callers: 0, endpoints: 0, crons: 0 } };
    renderCard();
    expect(await screen.findByText("No indexed symbols in the changed files.")).toBeTruthy();
  });

  it("shows an error message when the request fails", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/blast") ? Promise.resolve(new Response("{}", { status: 500 })) : json(PRIOR),
    );
    renderCard();
    expect(await screen.findByText("Couldn't load the blast radius.")).toBeTruthy();
  });
});
