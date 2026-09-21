import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "API error handling",
  description: "Use when reviewing HTTP handlers.",
  type: "convention",
  source: "manual",
  body: "# Rules",
  enabled: true,
  version: 4,
  agent_count: 2,
};

function renderCard(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe("SkillCard", () => {
  it("shows the current version and the linked-agent count", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByText("API error handling")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("falls back to 0 agents when the count is absent", () => {
    renderCard(<SkillCard skill={{ ...SKILL, agent_count: undefined }} />);
    expect(screen.getByText("0 agents")).toBeInTheDocument();
  });

  it("Delete opens a confirmation modal without triggering the card click", () => {
    const onClick = vi.fn();
    renderCard(<SkillCard skill={SKILL} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });
});
