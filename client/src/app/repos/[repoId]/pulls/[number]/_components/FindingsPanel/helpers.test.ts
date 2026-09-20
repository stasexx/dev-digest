import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { confidentFindings, countBySeverity, visibleFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS = [
  finding("s1", "SUGGESTION"),
  finding("c1", "CRITICAL"),
  finding("w1", "WARNING", 0.4),
  finding("c2", "CRITICAL"),
];

describe("countBySeverity", () => {
  it("groups findings by severity and zero-fills missing levels", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("sums to the number of findings", () => {
    const total = Object.values(countBySeverity(FINDINGS)).reduce((a, b) => a + b, 0);
    expect(total).toBe(FINDINGS.length);
  });
});

describe("visibleFindings", () => {
  it("sorts by severity when no filter is set", () => {
    expect(visibleFindings(FINDINGS, false).map((f) => f.id)).toEqual(["c1", "c2", "w1", "s1"]);
  });

  it("keeps only the requested severity", () => {
    expect(visibleFindings(FINDINGS, false, "CRITICAL").map((f) => f.id)).toEqual(["c1", "c2"]);
    expect(visibleFindings(FINDINGS, false, null)).toHaveLength(4);
  });

  it("combines the severity filter with hide-low-confidence", () => {
    expect(visibleFindings(FINDINGS, true, "WARNING")).toEqual([]);
    expect(confidentFindings(FINDINGS, true)).toHaveLength(3);
  });
});
