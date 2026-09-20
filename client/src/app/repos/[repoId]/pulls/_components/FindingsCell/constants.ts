import type { Severity } from "@devdigest/shared";
import type { PrFindingsSummary } from "@devdigest/shared";

/** Severity → its count field on the PR-list findings summary, in display order. */
export const SEVERITY_COUNT_KEYS: { severity: Severity; key: keyof Pick<PrFindingsSummary, "critical" | "warning" | "suggestion"> }[] = [
  { severity: "CRITICAL", key: "critical" },
  { severity: "WARNING", key: "warning" },
  { severity: "SUGGESTION", key: "suggestion" },
];
