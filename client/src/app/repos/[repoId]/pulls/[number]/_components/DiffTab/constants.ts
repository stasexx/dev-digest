import type { SmartDiffRole } from "@devdigest/shared";

export type DiffOrder = "smart" | "original";

export interface RoleMeta {
  /** i18n keys inside the `prReview` namespace. */
  labelKey: string;
  descKey: string;
  color: string;
  /** docs + boilerplate start collapsed; the rest open. */
  defaultCollapsed: boolean;
}

/** Typed by role so a role added to the contract fails typecheck here. */
export const ROLE_META: Record<SmartDiffRole, RoleMeta> = {
  core: { labelKey: "smartDiff.coreLabel", descKey: "smartDiff.coreDesc", color: "var(--accent)", defaultCollapsed: false },
  tests: { labelKey: "smartDiff.testsLabel", descKey: "smartDiff.testsDesc", color: "var(--ok)", defaultCollapsed: false },
  wiring: { labelKey: "smartDiff.wiringLabel", descKey: "smartDiff.wiringDesc", color: "var(--warn)", defaultCollapsed: false },
  docs: { labelKey: "smartDiff.docsLabel", descKey: "smartDiff.docsDesc", color: "var(--info)", defaultCollapsed: true },
  boilerplate: { labelKey: "smartDiff.boilerplateLabel", descKey: "smartDiff.boilerplateDesc", color: "var(--text-muted)", defaultCollapsed: true },
};

/** Files whose path the smart-diff response does not know fall back to this role. */
export const FALLBACK_ROLE: SmartDiffRole = "core";
