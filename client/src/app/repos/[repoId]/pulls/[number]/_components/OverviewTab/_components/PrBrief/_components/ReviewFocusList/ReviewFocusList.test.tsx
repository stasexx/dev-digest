import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/brief.json";
import { ReviewFocusList } from "./ReviewFocusList";

afterEach(cleanup);

const ITEMS = [
  { file: "a.ts", line: 12, reason: "first reason" },
  { file: "blast.ts", line: 3, reason: "second reason" },
  { file: "c.ts", line: 7, reason: "third reason" },
];

function ui(items = ITEMS, onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocusList items={items} changedFiles={["a.ts", "c.ts"]} onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("ReviewFocusList", () => {
  it("order and count", () => {
    ui();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("a.ts:12 — first reason");
    expect(rows[2]).toHaveTextContent("c.ts:7 — third reason");
    expect(screen.getByText("3")).toBeInTheDocument();
  });
  it("click calls onOpenFile for a changed file", () => {
    const open = ui();
    fireEvent.click(screen.getByText("a.ts:12"));
    expect(open).toHaveBeenCalledWith("a.ts", 12);
  });
  it("not in diff", () => {
    const open = ui();
    fireEvent.click(screen.getByText("blast.ts:3"));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
  });
  it("empty", () => {
    ui([]);
    expect(screen.getByText("Nothing specific to read first.")).toBeInTheDocument();
  });
});
