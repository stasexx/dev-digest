import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFindingsSummary } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

const SUMMARY: PrFindingsSummary = {
  total: 3,
  critical: 1,
  warning: 2,
  suggestion: 0,
  previews: [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded secret",
      file: "src/config.ts",
      start_line: 12,
      confidence: 0.98,
      rationale: "A live key is committed.",
    },
    {
      id: "f2",
      severity: "WARNING",
      category: "perf",
      title: "N+1 query",
      file: "src/api/users.ts",
      start_line: 45,
      confidence: 0.86,
      rationale: "One query per user.",
    },
  ],
};

function renderCell(findings: PrFindingsSummary | null, onRowClick = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <div onClick={onRowClick}>
        <FindingsCell findings={findings} />
      </div>
    </NextIntlClientProvider>,
  );
  return onRowClick;
}

describe("FindingsCell", () => {
  it("renders a dash for a PR that was never reviewed", () => {
    renderCell(null);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows counts only for severities that are present, popover closed by default", () => {
    renderCell(SUMMARY);
    const cell = screen.getByLabelText("3 findings in the latest review");
    expect(within(cell).getByText("1")).toBeInTheDocument();
    expect(within(cell).getByText("2")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens a read-only preview popover on hover and closes on leave", () => {
    renderCell(SUMMARY);
    const cell = screen.getByLabelText("3 findings in the latest review");
    fireEvent.mouseEnter(cell);

    const popover = screen.getByRole("tooltip");
    expect(within(popover).getByText("3 findings in this run")).toBeInTheDocument();
    expect(within(popover).getByText("Hardcoded secret")).toBeInTheDocument();
    expect(within(popover).getByText("security")).toBeInTheDocument();
    expect(within(popover).getByText("src/config.ts:12")).toBeInTheDocument();
    expect(within(popover).getByText("98%")).toBeInTheDocument();
    expect(within(popover).getByText("A live key is committed.")).toBeInTheDocument();
    expect(within(popover).getByText("+1 more on the pull request page")).toBeInTheDocument();
    // Read-only: no accept/reject (or any other) buttons inside the popover.
    expect(within(popover).queryAllByRole("button")).toHaveLength(0);

    fireEvent.mouseLeave(cell);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and does not trigger row navigation when clicked", () => {
    const onRowClick = renderCell(SUMMARY);
    const cell = screen.getByLabelText("3 findings in the latest review");
    fireEvent.focus(cell);
    fireEvent.click(screen.getByRole("tooltip"));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
