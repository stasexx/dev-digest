import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Risk kind -> registry icon. Unknown kinds fall back to GENERIC_RISK_ICON (AC-12). */
export const RISK_KIND_ICON: Record<string, IconName> = {
  auth: "Lock",
  security: "Shield",
  secrets: "Lock",
  dependency: "Boxes",
  performance: "Zap",
  config: "Settings",
  data: "Database",
  migration: "Database",
  api: "GitMerge",
  breaking_change: "GitMerge",
  concurrency: "Layers",
  reliability: "Gauge",
};
export const GENERIC_RISK_ICON: IconName = "AlertTriangle";

/** Contract severity -> UI severity token key (contract has 3, UI Severity has 4). */
export const RISK_SEVERITY_TOKEN: Record<RiskSeverity, "CRITICAL" | "WARNING" | "SUGGESTION"> = {
  high: "CRITICAL",
  medium: "WARNING",
  low: "SUGGESTION",
};

/** Reason codes that have a `missing.reasons.*` message. Anything else maps to `unknown`. */
export const KNOWN_MISSING_REASONS: readonly string[] = [
  "not_computed",
  "lookup_failed",
  "flag_off",
  "index_failed",
  "index_partial",
  "repo_too_large",
  "no_data",
  "none_attached",
  "clone_unavailable",
  "all_unreadable",
  "github_unavailable",
  "fetch_failed",
];

/** Translated name key for each missing input. */
export const MISSING_INPUT_KEY: Record<string, string> = {
  intent: "block.intent",
  blast: "block.blast",
  specs: "missing.input.specs",
  linked_issue: "missing.input.linked_issue",
};
