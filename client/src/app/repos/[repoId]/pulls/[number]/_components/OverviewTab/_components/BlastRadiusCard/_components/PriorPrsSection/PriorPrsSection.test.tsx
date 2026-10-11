import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PriorPrsResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { PriorPrsSection } from "./PriorPrsSection";

afterEach(cleanup);

function renderSection(data: PriorPrsResponse | undefined, over: { isLoading?: boolean; isError?: boolean } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <PriorPrsSection
        data={data}
        isLoading={over.isLoading ?? false}
        isError={over.isError ?? false}
        repoFullName="stasexx/dev-digest"
      />
    </NextIntlClientProvider>,
  );
}

const BASE = { source: "git", clone_available: true, commits_scanned: 50 } as const;

describe("PriorPrsSection", () => {
  it("shows the count and expands to PR details", () => {
    renderSection({
      ...BASE,
      history: [
        {
          pr_number: 3,
          title: "Tweak settings",
          merged_at: "2026-10-03T12:00:00Z",
          author: "alice",
          files_overlap: ["server/src/modules/settings/helpers.ts"],
          notes: "merge commit abc1234",
        },
      ],
    });
    const header = screen.getByRole("button", { name: /Prior PRs touching these files/ });
    expect(header.textContent).toContain("1");
    expect(screen.queryByText("#3")).toBeNull();
    fireEvent.click(header);
    expect(screen.getByText("#3").closest("a")?.getAttribute("href")).toBe(
      "https://github.com/stasexx/dev-digest/pull/3",
    );
    expect(screen.getByText("by alice")).toBeTruthy();
    expect(screen.getByText("2026-10-03")).toBeTruthy();
    expect(screen.getByText("server/src/modules/settings/helpers.ts")).toBeTruthy();
  });

  it("shows the empty copy with commits scanned", () => {
    renderSection({ ...BASE, history: [] });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No merged PRs in the last 50 local commit(s) touched these files.")).toBeTruthy();
  });

  it("shows the no-clone copy", () => {
    renderSection({ source: "git", clone_available: false, commits_scanned: 0, history: [] });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No local clone — PR history is unavailable.")).toBeTruthy();
  });

  it("shows an ellipsis while loading and an error message on failure", () => {
    renderSection(undefined, { isLoading: true });
    expect(screen.getByRole("button").textContent).toContain("…");
    cleanup();
    renderSection(undefined, { isError: true });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Couldn't load prior PRs.")).toBeTruthy();
  });
});
