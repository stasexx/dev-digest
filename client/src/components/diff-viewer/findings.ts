/* Review-finding support for the DiffViewer (Smart Diff). Route-agnostic: the
   finding card itself is injected by the caller via DiffFindingsApi.Card. */
import type React from "react";
import type { FindingActionKind, FindingRecord, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";

/** Props the injected card component receives for one finding. */
export interface DiffFindingCardProps {
  finding: FindingRecord;
  pending: boolean;
  onAction: (action: FindingActionKind) => void;
}

/** What the viewer needs to show review findings inline. */
export interface DiffFindingsApi {
  /** Caller-filtered (latest set) findings keyed by file path. */
  byPath: ReadonlyMap<string, FindingRecord[]>;
  /** Same switch as GitHub comments: hides the cards only (bar/label/dot stay). */
  show: boolean;
  pending: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
  /** Module-level component injected by the route. */
  Card: React.ComponentType<DiffFindingCardProps>;
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 };

/** Highest severity among the findings (CRITICAL > WARNING > SUGGESTION). */
export function topSeverity(findings: FindingRecord[]): Severity {
  let top: Severity = "SUGGESTION";
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[top]) top = f.severity;
  }
  return top;
}

/**
 * Split findings into those whose `start_line` is a rendered new-side line
 * (keyed `RIGHT:<line>`) and the rest, which are surfaced in a separate block.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of findings) {
    const key = lineKey("RIGHT", f.start_line);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}
