import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

const state: { candidates: ConventionCandidate[] } = { candidates: [] };
const extract = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "r1", full_name: "acme/api", default_branch: "main" }] }),
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [{ id: "a1", name: "General Reviewer" }] }) }));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: state.candidates, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extract, isPending: false, isError: false }),
  useUpdateConvention: () => ({ mutate: vi.fn(), isPending: false }),
  useConventionSkillDraft: () => ({
    data: { name: "repo-conventions", description: "Apply when reviewing acme/api.", body: "# Repository conventions\n- rule", accepted: 1 },
    isLoading: false,
  }),
  useCreateSkillFromConventions: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

import { ConventionsView } from "./ConventionsView";

const candidate = (id: string, status: ConventionCandidate["status"]): ConventionCandidate => ({
  id,
  rule: `Rule ${id}`,
  evidence_path: "src/a.ts",
  evidence_snippet: "code",
  confidence: 0.8,
  accepted: status === "accepted",
  category: "naming",
  evidence_line: 3,
  status,
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.candidates = [];
  extract.mockClear();
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("offers Run Scan (not ReScan) before the first scan and starts extraction", () => {
    renderView();
    expect(screen.queryByRole("button", { name: "ReScan" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run Scan" }));
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("offers ReScan once candidates exist; Create skill stays hidden until something is accepted", () => {
    state.candidates = [candidate("1", "pending")];
    renderView();
    expect(screen.getByRole("button", { name: "ReScan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create skill/ })).not.toBeInTheDocument();
  });

  it("Create skill opens a modal with editable name, description and body", () => {
    state.candidates = [candidate("1", "accepted"), candidate("2", "pending")];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Create skill (1)" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Create skill from conventions");
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    const body = screen.getByDisplayValue(/# Repository conventions/);
    fireEvent.change(body, { target: { value: "# edited" } });
    expect(screen.getByDisplayValue("# edited")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
