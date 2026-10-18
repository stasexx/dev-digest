import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingCardProps, DiffFindingsApi } from "../findings";

afterEach(cleanup);

const PATH = "src/a.ts";
const file: PrFile = {
  path: PATH,
  additions: 1,
  deletions: 0,
  patch: "@@ -10,2 +10,3 @@\n ctx 10\n ctx 11\n+added 12",
};

function mk(id: string, start_line: number): FindingRecord {
  return {
    id,
    severity: "CRITICAL",
    category: "bug",
    title: `title-${id}`,
    file: PATH,
    start_line,
    end_line: start_line,
    rationale: "r",
    confidence: 0.9,
    review_id: "rev",
    accepted_at: null,
    dismissed_at: null,
  } as FindingRecord;
}

function StubCard({ finding }: DiffFindingCardProps) {
  return <div data-testid="card">{finding.title}</div>;
}

function api(show: boolean): DiffFindingsApi {
  return {
    byPath: new Map([[PATH, [mk("on", 12), mk("off", 999)]]]),
    show,
    pending: false,
    onAction: () => {},
    Card: StubCard,
  };
}

function renderCard(props: { findings?: DiffFindingsApi; commenting?: DiffCommentApi }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <FileCard file={file} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard findings", () => {
  it("(a) shows the file dot", () => {
    renderCard({ findings: api(true) });
    expect(screen.getByRole("img", { name: "Has review findings" })).toBeTruthy();
  });

  it("(b) renders the card and blocker label under the anchored line", () => {
    renderCard({ findings: api(true) });
    expect(screen.getByText("title-on")).toBeTruthy();
    expect(screen.getByText("blocker")).toBeTruthy();
  });

  it("(c) renders unanchored findings under the outside-diff heading", () => {
    renderCard({ findings: api(true) });
    const heading = screen.getByText("1 finding(s) outside the visible diff");
    const block = heading.parentElement as HTMLElement;
    expect(within(block).getByText("title-off")).toBeTruthy();
    expect(within(block).queryByText("title-on")).toBeNull();
  });

  it("(d) show:false hides cards but keeps label and dot", () => {
    renderCard({ findings: api(false) });
    expect(screen.queryByTestId("card")).toBeNull();
    expect(screen.queryByText(/outside the visible diff/)).toBeNull();
    expect(screen.getByText("blocker")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Has review findings" })).toBeTruthy();
  });

  it("(e) without findings renders as before (no dot, no label)", () => {
    renderCard({});
    expect(screen.queryByRole("img", { name: "Has review findings" })).toBeNull();
    expect(screen.queryByText("blocker")).toBeNull();
    expect(screen.getByText("added 12")).toBeTruthy();
  });

  it("(f) GitHub comment count and the dot are different elements", () => {
    const commenting: DiffCommentApi = {
      comments: [
        {
          id: 1,
          path: PATH,
          line: 12,
          side: "RIGHT",
          body: "hi",
          user: "u",
          created_at: "2026-01-01T00:00:00Z",
        } as unknown as DiffCommentApi["comments"][number],
      ],
      canComment: false,
      showComments: false,
      posting: false,
      onSubmit: async () => {},
    };
    renderCard({ findings: api(true), commenting });
    const dot = screen.getByRole("img", { name: "Has review findings" });
    const count = screen.getByText("1");
    expect(count).not.toBe(dot);
    expect(count.contains(dot)).toBe(false);
    expect(dot.textContent).toBe("");
  });
});
