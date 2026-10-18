import type { ReviewRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { KNOWN_MISSING_REASONS, MISSING_INPUT_KEY } from "./constants";

/** Newest `kind:'review'` record that carries a verdict (AC-15). */
export function selectLatestReview(reviews: readonly ReviewRecord[] | undefined): ReviewRecord | null {
  let best: ReviewRecord | null = null;
  for (const r of reviews ?? []) {
    if (r.kind !== "review" || !r.verdict) continue;
    if (!best || r.created_at > best.created_at) best = r;
  }
  return best;
}

/** CRITICAL and not dismissed; mirrors ReviewRunAccordion. */
export function countBlockers(review: ReviewRecord): number {
  return review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}

/** 8213 -> "8.2K"; 1300 -> "1.3K"; 950 -> "950". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  return `${k.toFixed(1)}K`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(3)}`;
}

export interface BriefErrorMessage {
  key: string;
  values?: Record<string, string>;
}

/** Map a failed request to a localized message key. The server's `message` is never used (AC-16). */
export function briefError(err: unknown): BriefErrorMessage {
  if (err instanceof ApiError) {
    if (err.status === 429) return { key: "errors.rateLimited" };
    switch (err.code) {
      case "brief_model_not_configured": {
        const d = err.details as { provider?: unknown } | null | undefined;
        const provider = typeof d?.provider === "string" && d.provider ? d.provider : "?";
        return { key: "errors.modelNotConfigured", values: { provider } };
      }
      case "brief_model_failed":
        return { key: "errors.modelFailed" };
      case "brief_generation_in_progress":
        return { key: "errors.inProgress" };
      case "brief_input_over_budget":
        return { key: "errors.overBudget" };
    }
  }
  return { key: "errors.generic" };
}

export function missingReasonKey(reason: string): string {
  return `missing.reasons.${KNOWN_MISSING_REASONS.includes(reason) ? reason : "unknown"}`;
}

export function missingInputKey(input: string): string | null {
  return Object.prototype.hasOwnProperty.call(MISSING_INPUT_KEY, input) ? MISSING_INPUT_KEY[input]! : null;
}
