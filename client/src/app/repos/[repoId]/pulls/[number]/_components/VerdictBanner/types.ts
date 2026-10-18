import type { Verdict } from "@devdigest/shared";

/** Already-translated banner strings supplied by a caller outside the `prReview` namespace. */
export interface VerdictBannerLabels {
  verdict: Record<Verdict, string>;
  findingsCount: string;
  blockers: string;
  prScore: string;
}
