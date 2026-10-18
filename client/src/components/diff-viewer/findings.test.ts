import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { parsePatch } from "./helpers";
import { keysForLine } from "./comments";
import { partitionFindings, topSeverity } from "./findings";

function finding(id: string, start_line: number, severity: FindingRecord["severity"] = "WARNING"): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: `t-${id}`,
    file: "a.ts",
    start_line,
    end_line: start_line,
    rationale: "r",
    confidence: 0.9,
    review_id: "rev",
    accepted_at: null,
    dismissed_at: null,
  } as FindingRecord;
}

function keysOf(patch: string | null): Set<string> {
  const keys = new Set<string>();
  for (const ln of parsePatch(patch)) for (const k of keysForLine(ln)) keys.add(k);
  return keys;
}

const PATCH = "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;";

describe("partitionFindings", () => {
  it("matches an add line and a ctx line", () => {
    const { matched, unanchored } = partitionFindings([finding("1", 2), finding("2", 1)], keysOf(PATCH));
    expect(matched.get("RIGHT:2")?.map((f) => f.id)).toEqual(["1"]);
    expect(matched.get("RIGHT:1")?.map((f) => f.id)).toEqual(["2"]);
    expect(unanchored).toEqual([]);
  });

  it("puts a start_line absent from the patch into unanchored", () => {
    const { matched, unanchored } = partitionFindings([finding("1", 999)], keysOf(PATCH));
    expect(matched.size).toBe(0);
    expect(unanchored.map((f) => f.id)).toEqual(["1"]);
  });

  it("treats everything as unanchored when patch is null", () => {
    const { matched, unanchored } = partitionFindings([finding("1", 1), finding("2", 2)], keysOf(null));
    expect(matched.size).toBe(0);
    expect(unanchored).toHaveLength(2);
  });
});

describe("topSeverity", () => {
  it("orders CRITICAL > WARNING > SUGGESTION", () => {
    expect(topSeverity([finding("1", 1, "SUGGESTION"), finding("2", 1, "WARNING")])).toBe("WARNING");
    expect(topSeverity([finding("1", 1, "WARNING"), finding("2", 1, "CRITICAL"), finding("3", 1, "SUGGESTION")])).toBe("CRITICAL");
    expect(topSeverity([finding("1", 1, "SUGGESTION")])).toBe("SUGGESTION");
  });
});
