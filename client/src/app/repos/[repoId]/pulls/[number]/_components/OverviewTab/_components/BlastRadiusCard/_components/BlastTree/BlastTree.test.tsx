import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RankedDownstreamImpact } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastTree, type BlastTreeProps } from "./BlastTree";

afterEach(cleanup);

const SHA = "abc1234";
const DOWNSTREAM: RankedDownstreamImpact[] = [
  {
    symbol: "rowsToSettings",
    rank: 3,
    callers: [
      { name: "settingsRoutes", file: "server/src/modules/settings/routes.ts", line: 65, rank: 2 },
      { name: "getFeatureModelOverride", file: "server/src/modules/settings/feature-models.ts", line: 45, rank: 1 },
    ],
    endpoints_affected: ["GET /settings", "PUT /settings"],
    crons_affected: ["nightly-sync"],
  },
  {
    symbol: "taskLine",
    rank: 1,
    callers: [{ name: "render", file: "server/src/a.ts", line: 3, rank: 1 }],
    endpoints_affected: [],
    crons_affected: [],
  },
];

function renderTree(over: Partial<BlastTreeProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastTree
        downstream={DOWNSTREAM}
        withoutCallerNames={[]}
        impactedEndpoints={[]}
        repoFullName="stasexx/dev-digest"
        sha={SHA}
        {...over}
      />
    </NextIntlClientProvider>,
  );
}

describe("BlastTree", () => {
  it("renders symbols in the given order", () => {
    renderTree();
    const names = screen.getAllByText(/\(\)$/).map((n) => n.textContent);
    expect(names).toEqual(["rowsToSettings()", "taskLine()"]);
  });

  it("shows the caller count", () => {
    renderTree();
    expect(screen.getByText("2 callers")).toBeTruthy();
    expect(screen.getByText("1 caller")).toBeTruthy();
  });

  it("links the caller to the exact GitHub line", () => {
    renderTree();
    const link = screen.getByText("server/src/modules/settings/routes.ts:65").closest("a");
    expect(link?.getAttribute("href")).toBe(
      `https://github.com/stasexx/dev-digest/blob/${SHA}/server/src/modules/settings/routes.ts#L65`,
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("renders no link when repoFullName is null", () => {
    renderTree({ repoFullName: null });
    expect(screen.getByText("server/src/modules/settings/routes.ts:65").closest("a")).toBeNull();
  });

  it("keeps endpoints and crons in separate containers", () => {
    renderTree();
    const eps = screen.getByTestId("blast-endpoints");
    const crons = screen.getByTestId("blast-crons");
    expect(within(eps).getByText("GET /settings")).toBeTruthy();
    expect(within(eps).queryByText("nightly-sync")).toBeNull();
    expect(within(crons).getByText("nightly-sync")).toBeTruthy();
  });

  it("collapses a symbol and flips aria-expanded", () => {
    renderTree();
    const btn = screen.getByRole("button", { name: "Collapse rowsToSettings" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(screen.queryByText("server/src/modules/settings/routes.ts:65")).toBeNull();
    const again = screen.getByRole("button", { name: "Expand rowsToSettings" });
    expect(again.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the truncation hint from the prop", () => {
    renderTree({ truncatedMax: 7 });
    expect(screen.getByText(/Showing the top 7 callers across all symbols/)).toBeTruthy();
  });

  it("lists symbols without callers and unattributed endpoints", () => {
    renderTree({ withoutCallerNames: ["ReviewDto"], impactedEndpoints: ["GET /settings", "GET /other"] });
    expect(screen.getByText("No callers: ReviewDto")).toBeTruthy();
    expect(screen.getByText("Other affected endpoints")).toBeTruthy();
    expect(screen.getByText("GET /other")).toBeTruthy();
  });
});
