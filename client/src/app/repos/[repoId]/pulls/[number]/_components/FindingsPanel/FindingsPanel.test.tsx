import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return { ...FINDINGS[0]!, id, severity, title: `${severity} ${id}`, confidence };
}

const MIXED: FindingRecord[] = [
  finding("c1", "CRITICAL"),
  finding("w1", "WARNING"),
  finding("w2", "WARNING", 0.4),
  finding("s1", "SUGGESTION"),
];

describe("FindingsPanel severity counters + filter", () => {
  it("shows one counter per present severity, matching the rendered cards", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(within(screen.getByTestId("severity-count-CRITICAL")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("severity-count-WARNING")).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByTestId("severity-count-SUGGESTION")).getByText("1")).toBeInTheDocument();
    expect(screen.getAllByText(/^WARNING w/)).toHaveLength(2);
  });

  it("omits counters for severities with no findings", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByTestId("severity-count-CRITICAL")).toBeInTheDocument();
    expect(screen.queryByTestId("severity-count-WARNING")).not.toBeInTheDocument();
    expect(screen.queryByTestId("severity-count-SUGGESTION")).not.toBeInTheDocument();
  });

  it("filters to one severity on click and clears on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const warning = screen.getByRole("button", { name: "Warning" });

    fireEvent.click(warning);
    expect(warning).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText(/^WARNING w/)).toHaveLength(2);
    expect(screen.queryByText("CRITICAL c1")).not.toBeInTheDocument();
    expect(screen.queryByText("SUGGESTION s1")).not.toBeInTheDocument();

    fireEvent.click(warning);
    expect(warning).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("CRITICAL c1")).toBeInTheDocument();
    expect(screen.getByText("SUGGESTION s1")).toBeInTheDocument();
  });

  it("switches directly between severities", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(screen.getByText("CRITICAL c1")).toBeInTheDocument();
    expect(screen.queryByText(/^WARNING w/)).not.toBeInTheDocument();
  });

  it("keeps counters in sync with the hide-low-confidence toggle", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(within(screen.getByTestId("severity-count-WARNING")).getByText("1")).toBeInTheDocument();
    expect(screen.getAllByText(/^WARNING w/)).toHaveLength(1);
  });
});
