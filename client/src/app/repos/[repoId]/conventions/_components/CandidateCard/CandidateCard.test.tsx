import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { CandidateCard } from "./CandidateCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  rule: "Use async/await, never .then() chains.",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const rows = await load();",
  confidence: 0.87,
  accepted: false,
  category: "async",
  evidence_line: 42,
  status: "pending",
};

function renderCard(candidate = CANDIDATE, onUpdate = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CandidateCard candidate={candidate} repoFullName="acme/api" gitRef="develop" onUpdate={onUpdate} />
    </NextIntlClientProvider>,
  );
  return onUpdate;
}

describe("CandidateCard", () => {
  it("shows rule, category, confidence % and evidence linking to the real file on GitHub", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("async")).toBeInTheDocument();
    expect(screen.getByText("87% conf")).toBeInTheDocument();
    expect(screen.getByText("const rows = await load();")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /src\/api\/users\.ts:42/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/develop/src/api/users.ts#L42",
    );
  });

  it("has Accept, Reject and Edit and reports the matching patch", () => {
    const onUpdate = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onUpdate).toHaveBeenLastCalledWith({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onUpdate).toHaveBeenLastCalledWith({ status: "rejected" });
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("an accepted card toggles back to pending", () => {
    const onUpdate = renderCard({ ...CANDIDATE, status: "accepted", accepted: true });
    const btn = screen.getByRole("button", { name: "Accepted" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(onUpdate).toHaveBeenLastCalledWith({ status: "pending" });
  });

  it("edits inline: the form replaces the header in place and saves rule + category", () => {
    const onUpdate = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const [ruleBox, categoryBox] = screen.getAllByRole("textbox");
    fireEvent.change(ruleBox!, { target: { value: "Always use async/await." } });
    fireEvent.change(categoryBox!, { target: { value: "style" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onUpdate).toHaveBeenLastCalledWith({ rule: "Always use async/await.", category: "style" });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("cancel leaves the candidate untouched", () => {
    const onUpdate = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });
});
