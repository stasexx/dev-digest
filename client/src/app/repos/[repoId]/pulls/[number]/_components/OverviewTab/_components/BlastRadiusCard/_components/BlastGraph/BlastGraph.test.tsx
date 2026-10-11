import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { BlastGraph } from "./BlastGraph";
import { DOWNSTREAM, FACTS } from "./fixtures";

afterEach(cleanup);

// Mirrors the graph.* keys of messages/en/blast.json (written by T9).
const messages = {
  blast: {
    graph: {
      empty: "No downstream callers to graph.",
      ariaLabel: "Blast radius graph",
      legend: {
        symbol: "changed symbol",
        callers: "callers",
        endpoints: "endpoints affected",
        crons: "crons affected",
      },
    },
  },
};

function renderGraph(props: Partial<React.ComponentProps<typeof BlastGraph>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BlastGraph
        downstream={DOWNSTREAM}
        factsByFile={FACTS}
        repoFullName="stasexx/dev-digest"
        sha="abc123"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("BlastGraph", () => {
  it("renders an accessible svg image and the legend", () => {
    renderGraph();
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeTruthy();
    expect(screen.getByText("changed symbol")).toBeTruthy();
    expect(screen.getByText("callers")).toBeTruthy();
    expect(screen.getByText("endpoints affected")).toBeTruthy();
    expect(screen.queryByText("crons affected")).toBeNull();
  });

  it("links caller nodes to the exact GitHub line", () => {
    const { container } = renderGraph();
    const link = container.querySelector(
      'a[href="https://github.com/stasexx/dev-digest/blob/abc123/server/src/modules/settings/routes.ts#L65"]',
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.querySelector("title")?.textContent).toBe(
      "server/src/modules/settings/routes.ts:65",
    );
  });

  it("renders no links without a repo", () => {
    const { container } = renderGraph({ repoFullName: null });
    expect(container.querySelector("a")).toBeNull();
  });

  it("truncates long endpoint labels but keeps the full text in a title", () => {
    renderGraph();
    expect(screen.getByText("GET /settings/secrets-s…")).toBeTruthy();
    expect(screen.getAllByText("GET /settings/secrets-status").length).toBeGreaterThan(0);
  });

  it("shows the empty copy for no downstream", () => {
    renderGraph({ downstream: [], factsByFile: {} });
    expect(screen.getByText("No downstream callers to graph.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
