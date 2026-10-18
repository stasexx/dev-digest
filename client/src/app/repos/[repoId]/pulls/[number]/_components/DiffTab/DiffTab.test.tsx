import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrDetail, ReviewRecord, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import brief from "../../../../../../../../messages/en/brief.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

afterEach(cleanup);

const PATCH = "@@ -1,2 +1,3 @@\n ctx 1\n+added 2\n ctx 3";
const PATHS: Record<SmartDiffRole, string> = {
  core: "src/a.ts",
  tests: "src/a.test.ts",
  wiring: "src/index.ts",
  docs: "README.md",
  boilerplate: "pnpm-lock.yaml",
};
// GitHub order differs from role order on purpose.
const GITHUB_ORDER = ["pnpm-lock.yaml", "README.md", "src/index.ts", "src/b.ts", "src/a.test.ts", "src/a.ts"];

const pr = {
  id: "p1",
  number: 1,
  status: "open",
  head_sha: "abc",
  files_count: GITHUB_ORDER.length,
  files: GITHUB_ORDER.map((path) => ({ path, additions: 1, deletions: 0, patch: PATCH })),
  commits: [],
} as unknown as PrDetail;

const smart: SmartDiffResponse = {
  groups: [
    { role: "core", files: ["src/a.ts", "src/b.ts"].map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })) },
    ...(["tests", "wiring", "docs", "boilerplate"] as const).map((role) => ({
      role,
      files: [{ path: PATHS[role], additions: 1, deletions: 0, finding_lines: [] }],
    })),
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

function f(id: string, file: string, line: number, extra: object = {}) {
  return {
    id, file, start_line: line, end_line: line, severity: "CRITICAL", category: "bug",
    title: `title-${id}`, rationale: `rationale-${id}`, suggestion: null, confidence: 0.9,
    kind: "finding", review_id: "r1", accepted_at: null, dismissed_at: null, ...extra,
  };
}
function reviewOf(findings: object[]): ReviewRecord[] {
  return [{ id: "r1", pr_id: "p1", agent_id: "A", kind: "review", created_at: "2026-01-01", findings }] as unknown as ReviewRecord[];
}
// 5 findings across 2 core files.
const FIVE = reviewOf([
  f("f1", "src/a.ts", 2), f("f2", "src/a.ts", 3), f("f3", "src/a.ts", 1), f("f4", "src/b.ts", 2), f("f5", "src/b.ts", 3),
]);

let posted: string[] = [];
function mockFetch(reviews: ReviewRecord[]) {
  posted = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST") posted.push(url);
    const body = url.includes("/smart-diff") ? smart : url.includes("/reviews") ? reviews : url.includes("/comments") ? [] : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
}

type Target = { targetFile?: string | null; targetLine?: string | null };
function tree(qc: QueryClient, running: boolean, target: Target) {
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell, brief }}>
        <DiffTab prId="p1" pr={pr} reviewRunning={running} {...target} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
function renderTab(reviews: ReviewRecord[], running = false, target: Target = {}) {
  mockFetch(reviews);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(tree(qc, running, target));
  return { ...view, qc, rerenderTarget: (next: Target) => view.rerender(tree(qc, running, next)) };
}

const groupHeader = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) });

const scrollSpy = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  scrollSpy.mockClear();
  Element.prototype.scrollIntoView = scrollSpy;
});

/** Elements scrollIntoView was called on, in order. */
const scrolled = () => scrollSpy.mock.contexts as HTMLElement[];

describe("DiffTab Smart Diff", () => {
  it("(a) shows five groups in role order, each with a file count", async () => {
    renderTab([]);
    await screen.findByText("Core logic");
    const labels = ["Core logic", "Tests", "Wiring", "Docs", "Boilerplate"];
    const els = labels.map((l) => groupHeader(l));
    els.slice(1).forEach((el, i) => {
      expect(els[i]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(within(els[0]!).getByText("2 files")).toBeInTheDocument();
    expect(within(els[4]!).getByText("1 file")).toBeInTheDocument();
  });

  it("(b) docs and boilerplate start collapsed; boilerplate reveals the lock file", async () => {
    renderTab([]);
    const docs = await screen.findByRole("button", { name: /^Docs/ });
    const bp = groupHeader("Boilerplate");
    expect(docs).toHaveAttribute("aria-expanded", "false");
    expect(bp).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    fireEvent.click(bp);
    expect(await screen.findByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("(c) counter = files with findings (2), not findings (5); other groups have none", async () => {
    renderTab(FIVE);
    const core = await screen.findByRole("button", { name: /^Core logic/ });
    await waitFor(() => expect(within(core).getByTitle("2 files with findings")).toHaveTextContent("2"));
    expect(screen.getAllByTitle(/files with findings/)).toHaveLength(1);
  });

  it("(d) no review yet -> empty-state hint and no counters", async () => {
    renderTab([]);
    expect(await screen.findByText(/No review yet/)).toBeInTheDocument();
    expect(screen.queryAllByTitle(/files with findings/)).toHaveLength(0);
  });

  it("(e) Original order = GitHub order without groups; Smart order restores them", async () => {
    renderTab([]);
    await screen.findByText("Core logic");
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    const paths = await screen.findAllByText(/^(src\/.+|README\.md|pnpm-lock\.yaml)$/);
    expect(paths.map((p) => p.textContent)).toEqual(GITHUB_ORDER);
    fireEvent.click(screen.getByRole("button", { name: "Smart order" }));
    expect(await screen.findByText("Core logic")).toBeInTheDocument();
  });

  it("(f) finding card visible by default; Hide/Show comments toggles it", async () => {
    renderTab(FIVE);
    expect(await screen.findByText("title-f1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Hide comments/ }));
    expect(screen.queryByText("title-f1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show comments/ }));
    expect(await screen.findByText("title-f1")).toBeInTheDocument();
  });

  it("(g) Accept POSTs the finding action", async () => {
    renderTab(reviewOf([f("f1", "src/a.ts", 2)]));
    await screen.findByText("title-f1");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(posted.some((u) => u.includes("/findings/f1/accept"))).toBe(true));
  });

  it("(h) clicking the card header collapses it to a single row", async () => {
    renderTab(reviewOf([f("f1", "src/a.ts", 2)]));
    const title = await screen.findByText("title-f1");
    expect(screen.getByText("rationale-f1")).toBeInTheDocument();
    expect(screen.getByText(/src\/a\.ts:2/)).toBeInTheDocument();
    fireEvent.click(title);
    expect(screen.queryByText("rationale-f1")).not.toBeInTheDocument();
    // one row: the file:line / confidence meta row is gone, the title stays
    expect(screen.queryByText(/src\/a\.ts:2/)).not.toBeInTheDocument();
    expect(screen.getByText("title-f1")).toBeInTheDocument();
  });

  it("(i) group headers are sticky", async () => {
    renderTab([]);
    const core = await screen.findByRole("button", { name: /^Core logic/ });
    expect(core.style.position).toBe("sticky");
  });

  it("falls back to an ungrouped list with a notice when smart-diff fails", async () => {
    renderTab([]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const ok = !url.includes("/smart-diff");
      return new Response(JSON.stringify(ok ? [] : { error: "boom" }), { status: ok ? 200 : 500, headers: { "content-type": "application/json" } });
    });
    cleanup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ prReview, shell, brief }}>
          <DiffTab prId="p1" pr={pr} reviewRunning={false} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Smart order is unavailable/)).toBeInTheDocument();
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
  });
});

describe("DiffTab deep link", () => {
  it("deep link expands boilerplate group + card and scrolls to the card", async () => {
    renderTab([], false, { targetFile: "pnpm-lock.yaml" });
    const card = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-diff-file="pnpm-lock.yaml"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(groupHeader("Boilerplate")).toHaveAttribute("aria-expanded", "true");
    expect(within(card).getByText("ctx 1")).toBeInTheDocument();
    await waitFor(() => expect(scrolled()).toEqual([card]));
    expect(card.style.scrollMarginTop).not.toBe("");
  });

  it("deep link line highlight", async () => {
    renderTab([], false, { targetFile: "src/a.ts", targetLine: "2" });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    const lineEl = document.querySelector<HTMLElement>('[data-diff-file="src/a.ts"] [data-target-line="true"]')!;
    expect(lineEl).toHaveAttribute("data-new-line", "2");
    expect(scrolled()[0]).toBe(lineEl);
    expect(document.querySelectorAll('[data-target-line="true"]')).toHaveLength(1);
  });

  it("line outside hunks falls back to the card without error text", async () => {
    renderTab([], false, { targetFile: "src/a.ts", targetLine: "99" });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    expect(scrolled()[0]).toHaveAttribute("data-diff-file", "src/a.ts");
    expect(document.querySelector('[data-target-line="true"]')).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("original order (via smart diff failure) still scrolls", async () => {
    mockFetch([]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const ok = !url.includes("/smart-diff");
      return new Response(JSON.stringify(ok ? [] : { error: "boom" }), { status: ok ? 200 : 500, headers: { "content-type": "application/json" } });
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(tree(qc, false, { targetFile: "src/b.ts", targetLine: "2" }));
    expect(await screen.findByText(/Smart order is unavailable/)).toBeInTheDocument();
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    const last = scrolled().at(-1)!;
    expect(last).toHaveAttribute("data-new-line", "2");
    expect(last.closest("[data-diff-file]")).toHaveAttribute("data-diff-file", "src/b.ts");
  });

  it("original order selected by the user scrolls to the card", async () => {
    renderTab([], false, { targetFile: "README.md" });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(2));
    expect(scrolled().at(-1)).toHaveAttribute("data-diff-file", "README.md");
  });

  it.each(["-3", "abc"])("invalid line=%s -> card-only scroll, no throw", async (line) => {
    renderTab([], false, { targetFile: "src/a.ts", targetLine: line });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    expect(scrolled()[0]).toHaveAttribute("data-diff-file", "src/a.ts");
    expect(document.querySelector('[data-target-line="true"]')).toBeNull();
  });

  it("unknown target file shows the notice and never scrolls", async () => {
    renderTab([], false, { targetFile: "nope/missing.ts" });
    expect(await screen.findByRole("status")).toHaveTextContent("File not in this PR's diff");
    await screen.findByText("Core logic");
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("delayed Smart Diff data: no scroll during skeleton, exactly one after", async () => {
    mockFetch([]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes("/smart-diff")) await gate;
      return base(input, init);
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(tree(qc, false, { targetFile: "pnpm-lock.yaml" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(scrollSpy).not.toHaveBeenCalled();
    release();
    const card = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-diff-file="pnpm-lock.yaml"]');
      expect(el).not.toBeNull();
      return el!;
    });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    expect(scrolled()[0]).toBe(card);
  });

  it("same-tab target change re-arms: group + card of B open, last scroll on B", async () => {
    const { rerenderTarget } = renderTab([], false, { targetFile: "src/a.ts" });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    rerenderTarget({ targetFile: "README.md" });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(2));
    expect(groupHeader("Docs")).toHaveAttribute("aria-expanded", "true");
    expect(scrolled()[0]).toHaveAttribute("data-diff-file", "src/a.ts");
    expect(scrolled()[1]).toHaveAttribute("data-diff-file", "README.md");
  });

  it("handled once: re-render with the same target and a comments refetch adds no scroll", async () => {
    const { rerenderTarget, qc } = renderTab([], false, { targetFile: "src/a.ts", targetLine: "2" });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    rerenderTarget({ targetFile: "src/a.ts", targetLine: "2" });
    await qc.invalidateQueries({ queryKey: ["comments"] });
    await qc.invalidateQueries();
    await new Promise((r) => setTimeout(r, 30));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });
});
