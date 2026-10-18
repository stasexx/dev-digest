import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";
import {
  buildRoleGroups,
  countFilesWithFindings,
  diffReviewState,
  groupFindingsByPath,
  selectLatestFindings,
} from "./helpers";

function finding(id: string, file = "a.ts", start_line = 1): FindingRecord {
  return { id, file, start_line, end_line: start_line, severity: "WARNING", title: id } as FindingRecord;
}

function review(agent: string | null, kind: "review" | "summary", created_at: string, ids: string[]): ReviewRecord {
  return { id: `r-${agent}-${created_at}`, agent_id: agent, kind, created_at, findings: ids.map((i) => finding(i)) } as ReviewRecord;
}

// Scenario names mirror server helpers.test.ts `selectLatestReviewFindings` (plan D1) - keep in sync.
describe("selectLatestFindings", () => {
  const cases: { name: string; rows: ReviewRecord[]; expected: string[] }[] = [
    {
      name: "agent A with two reviews -> only the newest one's findings",
      rows: [review("A", "review", "2026-01-02", ["new"]), review("A", "review", "2026-01-01", ["old"])],
      expected: ["new"],
    },
    {
      name: "agent A with two reviews -> newest wins regardless of input order",
      rows: [review("A", "review", "2026-01-01", ["old"]), review("A", "review", "2026-01-02", ["new"])],
      expected: ["new"],
    },
    {
      name: "agents A and B -> the union",
      rows: [review("A", "review", "2026-01-02", ["a"]), review("B", "review", "2026-01-01", ["b"])],
      expected: ["a", "b"],
    },
    {
      name: "null-agent bucket is kept separately",
      rows: [
        review(null, "review", "2026-01-02", ["seed"]),
        review("A", "review", "2026-01-01", ["a"]),
        review(null, "review", "2026-01-01", ["seed-old"]),
      ],
      expected: ["seed", "a"],
    },
    {
      name: "summary review is excluded",
      rows: [review("A", "summary", "2026-01-03", ["sum"]), review("A", "review", "2026-01-01", ["a"])],
      expected: ["a"],
    },
    {
      name: "tie on createdAt keeps the first (newest-first API order)",
      rows: [review("A", "review", "2026-01-01", ["first"]), review("A", "review", "2026-01-01", ["second"])],
      expected: ["first"],
    },
    { name: "empty input -> []", rows: [], expected: [] },
  ];
  it.each(cases)("$name", ({ rows, expected }) => {
    expect(selectLatestFindings(rows).map((f) => f.id)).toEqual(expected);
  });
  it("undefined input -> []", () => {
    expect(selectLatestFindings(undefined)).toEqual([]);
  });
});

describe("groupFindingsByPath", () => {
  it("sorts by start_line and drops paths outside the PR", () => {
    const m = groupFindingsByPath(
      [finding("x", "a.ts", 9), finding("y", "a.ts", 2), finding("z", "gone.ts", 1)],
      new Set(["a.ts"]),
    );
    expect([...m.keys()]).toEqual(["a.ts"]);
    expect(m.get("a.ts")?.map((f) => f.id)).toEqual(["y", "x"]);
  });
});

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: null });
const smartOf = (groups: [SmartDiffRole, string[]][]): SmartDiffResponse => ({
  groups: groups.map(([role, paths]) => ({
    role,
    files: paths.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })),
  })),
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
});

describe("buildRoleGroups", () => {
  const smart = smartOf([
    ["core", ["c1.ts", "c2.ts"]],
    ["tests", ["t.test.ts"]],
    ["boilerplate", ["pnpm-lock.yaml"]],
  ]);

  it("takes role order from the response and keeps GitHub order inside a group", () => {
    const files = [file("pnpm-lock.yaml"), file("c2.ts"), file("t.test.ts"), file("c1.ts")];
    const groups = buildRoleGroups(smart, files);
    expect(groups.map((g) => g.role)).toEqual(["core", "tests", "boilerplate"]);
    expect(groups[0]?.files.map((f) => f.path)).toEqual(["c2.ts", "c1.ts"]);
  });

  it("sends a path unknown to the response to core", () => {
    const groups = buildRoleGroups(smart, [file("t.test.ts"), file("new.ts")]);
    expect(groups.map((g) => g.role)).toEqual(["core", "tests"]);
    expect(groups[0]?.files.map((f) => f.path)).toEqual(["new.ts"]);
  });

  it("skips empty roles", () => {
    expect(buildRoleGroups(smart, [file("c1.ts")]).map((g) => g.role)).toEqual(["core"]);
  });
});

describe("countFilesWithFindings", () => {
  it("counts files, not findings: 2 files with 5 findings -> 2", () => {
    const byPath = new Map<string, FindingRecord[]>([
      ["a.ts", [finding("1", "a.ts"), finding("2", "a.ts"), finding("3", "a.ts")]],
      ["b.ts", [finding("4", "b.ts"), finding("5", "b.ts")]],
    ]);
    expect(countFilesWithFindings([file("a.ts"), file("b.ts"), file("c.ts")], byPath)).toBe(2);
  });
});

describe("diffReviewState", () => {
  it("covers all four branches", () => {
    expect(diffReviewState([], true, 0)).toBe("running");
    expect(diffReviewState([], false, 0)).toBe("none");
    expect(diffReviewState([review("A", "summary", "2026-01-01", [])], false, 0)).toBe("none");
    expect(diffReviewState([review("A", "review", "2026-01-01", [])], false, 0)).toBe("clean");
    expect(diffReviewState([review("A", "review", "2026-01-01", ["x"])], false, 1)).toBe("has");
  });
});
