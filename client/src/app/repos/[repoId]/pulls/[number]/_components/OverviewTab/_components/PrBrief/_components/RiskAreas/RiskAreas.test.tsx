import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const RISKS: Risk[] = [
  { kind: "auth", title: "Auth surface touched", explanation: "Explains auth.", severity: "high", file_refs: ["a.ts:12-18"] },
  { kind: "weird_kind", title: "Odd one", explanation: "Odd explanation.", severity: "low", file_refs: ["blast-only.ts:3"] },
];

function ui(risks = RISKS, onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas risks={risks} changedFiles={["a.ts"]} onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("RiskAreas", () => {
  it("renders risk rows", () => {
    ui();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("a.ts:12-18")).toBeInTheDocument();
  });
  it("expands with aria-expanded", () => {
    ui();
    const toggles = screen.getAllByRole("button", { name: "Show details" });
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Explains auth.")).toBeNull();
    fireEvent.click(toggles[0]!);
    expect(screen.getByText("Explains auth.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide details" })).toHaveAttribute("aria-expanded", "true");
  });
  it("unknown kind falls back without error", () => {
    ui();
    expect(screen.getByText("Odd one")).toBeInTheDocument();
  });
  it("risk click opens first ref's first line", () => {
    const open = ui();
    fireEvent.click(screen.getByText("Auth surface touched"));
    expect(open).toHaveBeenCalledWith("a.ts", 12);
  });
  it("file outside the diff shows a note, no navigation", () => {
    const open = ui();
    fireEvent.click(screen.getByText("Odd one"));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
  });
  it("zero risks", () => {
    ui([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});
