import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefRecord, PrBriefResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { PrBriefBlock } from "./PrBriefBlock";

const PR = "pr-1";

const BRIEF = {
  summary: "Adds rate limiting.",
  intent: null,
  blast: null,
  risks: { risks: [{ kind: "auth", title: "Auth surface touched", explanation: "why", severity: "high", file_refs: ["a.ts:12-18"] }] },
  review_focus: [{ file: "a.ts", line: 12, reason: "check this" }],
  pr_id: PR,
  head_sha: "aaaaaaa1111",
  generated_at: "2026-10-18T10:00:00.000Z",
  model: { provider: "anthropic", model: "claude-x" },
  missing_inputs: [],
  inputs: {} as PrBriefRecord["inputs"],
  generation: { tokens_in: 8213, tokens_out: 1300, cost_usd: 0.014, attempts: 1 } as PrBriefRecord["generation"],
} as PrBriefRecord;

const resp = (o: Partial<PrBriefResponse> = {}): PrBriefResponse => ({ brief: BRIEF, stale: false, current_head_sha: "aaaaaaa1111", generating: false, ...o });

let getBody: PrBriefResponse;
let reviewsBody: unknown[];
let post: () => Response | Promise<Response>;
let calls: { url: string; method: string }[];
let onError: ReturnType<typeof vi.fn>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  getBody = resp({ brief: null });
  reviewsBody = [];
  post = () => json(resp());
  calls = [];
  onError = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (url.endsWith(`/pulls/${PR}/brief`)) return method === "POST" ? post() : json(getBody);
      if (url.endsWith(`/pulls/${PR}/reviews`)) return json(reviewsBody);
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const posts = () => calls.filter((c) => c.method === "POST").length;

function ui(onOpenFile = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: messages }} onError={onError}>
        <PrBriefBlock prId={PR} changedFiles={["a.ts"]} onOpenFile={onOpenFile} intentSlot={<div>INTENT-SLOT</div>} blastSlot={<div>BLAST-SLOT</div>} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onOpenFile;
}

describe("PrBriefBlock", () => {
  it("empty state with Generate and slots", async () => {
    ui();
    expect(await screen.findByText("Brief not available yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    expect(screen.getByText("INTENT-SLOT")).toBeInTheDocument();
    expect(screen.getByText("BLAST-SLOT")).toBeInTheDocument();
    expect(posts()).toBe(0);
  });

  it("generate flow renders summary, risks, review focus", async () => {
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByText("Adds rate limiting.")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("a.ts:12")).toBeInTheDocument();
    expect(posts()).toBe(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("skeleton while the POST is pending", async () => {
    post = () => new Promise<Response>(() => {});
    const { container } = { container: document.body };
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeNull());
  });

  it("cached brief renders with no POST", async () => {
    getBody = resp();
    ui();
    expect(await screen.findByText("Adds rate limiting.")).toBeInTheDocument();
    expect(posts()).toBe(0);
  });

  it("meta row, cost hidden when null", async () => {
    getBody = resp();
    ui();
    expect(await screen.findByText("8.2K→1.3K")).toBeInTheDocument();
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    cleanup();
    getBody = resp({ brief: { ...BRIEF, generation: { ...BRIEF.generation, cost_usd: null } } });
    ui();
    await screen.findAllByText("8.2K→1.3K");
    expect(screen.queryByText(/Cost/)).toBeNull();
  });

  it("missing inputs notice present/absent", async () => {
    getBody = resp({ brief: { ...BRIEF, missing_inputs: [{ input: "specs", reason: "none_attached" }, { input: "intent", reason: "weird" }] } });
    ui();
    expect(await screen.findByText(/Specs — None attached/)).toBeInTheDocument();
    expect(screen.getByText(/Intent — Unknown reason/)).toBeInTheDocument();
    cleanup();
    getBody = resp();
    ui();
    await screen.findByText("Adds rate limiting.");
    expect(screen.queryByText("Inputs not available")).toBeNull();
  });

  it("stale notice with short SHAs and Regenerate", async () => {
    getBody = resp({ stale: true, current_head_sha: "bbbbbbb2222" });
    ui();
    expect(await screen.findByText(/aaaaaaa.*bbbbbbb/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  });

  it("refresh replaces the brief", async () => {
    getBody = resp();
    post = () => json(resp({ brief: { ...BRIEF, summary: "Fresh summary." } }));
    ui();
    await screen.findByText("Adds rate limiting.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    expect(await screen.findByText("Fresh summary.")).toBeInTheDocument();
    expect(posts()).toBe(1);
  });

  it("regeneration keeps the old brief, controls disabled", async () => {
    getBody = resp();
    post = () => new Promise<Response>(() => {});
    ui();
    await screen.findByText("Adds rate limiting.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh brief" })).toBeDisabled());
    expect(screen.getByText("Adds rate limiting.")).toBeInTheDocument();
  });

  it.each([
    [502, "brief_model_failed", {}, /failed to produce a valid brief/],
    [409, "brief_generation_in_progress", {}, /already being generated/],
    [422, "brief_input_over_budget", {}, /too large to summarize/],
    [400, "brief_model_not_configured", { provider: "openai" }, /provider \(openai\) is not configured/],
    [429, "rate_limited", {}, /Too many requests/],
  ])("error %s %s keeps previous brief, hides server text", async (status, code, details, re) => {
    getBody = resp();
    post = () => json({ error: { code, message: "SERVER-LEAK", details } }, status);
    ui();
    await screen.findByText("Adds rate limiting.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    expect(await screen.findByText(re)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText("Adds rate limiting.")).toBeInTheDocument();
    expect(screen.queryByText(/SERVER-LEAK/)).toBeNull();
  });

  it("empty sections", async () => {
    getBody = resp({ brief: { ...BRIEF, risks: { risks: [] }, review_focus: [] } });
    ui();
    expect(await screen.findByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("Nothing specific to read first.")).toBeInTheDocument();
  });

  it("banner with a review uses brief namespace only", async () => {
    getBody = resp();
    reviewsBody = [
      { id: "r", kind: "review", verdict: "request_changes", score: 61, created_at: "2026-10-18", findings: [{ severity: "CRITICAL", dismissed_at: null }, { severity: "INFO", dismissed_at: null }] },
    ];
    ui();
    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/2 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.queryByText(/prReview\.|verdict\./)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("polls while generating", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getBody = resp({ brief: null, generating: true });
    ui();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeNull());
    getBody = resp();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(await screen.findByText("Adds rate limiting.")).toBeInTheDocument();
  });

  it("renders markup as text", async () => {
    getBody = resp({ brief: { ...BRIEF, summary: "<img src=x onerror=alert(1)>" } });
    ui();
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("review focus click navigates", async () => {
    getBody = resp();
    const open = ui();
    fireEvent.click(await screen.findByText("a.ts:12"));
    expect(open).toHaveBeenCalledWith("a.ts", 12);
  });
});
