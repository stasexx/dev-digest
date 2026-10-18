import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { briefError, countBlockers, formatTokens, selectLatestReview, shortSha } from "./helpers";

const rev = (o: Partial<ReviewRecord>) => ({ kind: "review", verdict: "approve", created_at: "2026-01-01", findings: [], ...o }) as ReviewRecord;

describe("formatTokens", () => {
  it("formats", () => {
    expect(formatTokens(8213)).toBe("8.2K");
    expect(formatTokens(1300)).toBe("1.3K");
    expect(formatTokens(950)).toBe("950");
  });
});

describe("shortSha", () => {
  it("takes 7 chars", () => expect(shortSha("abcdef0123456")).toBe("abcdef0"));
});

describe("briefError", () => {
  it("maps statuses and codes, never the server message", () => {
    expect(briefError(new ApiError("x", 429)).key).toBe("errors.rateLimited");
    expect(briefError(new ApiError("secret", 400, "brief_model_not_configured", { provider: "openai" }))).toEqual({
      key: "errors.modelNotConfigured",
      values: { provider: "openai" },
    });
    expect(briefError(new ApiError("m", 400, "brief_model_not_configured")).values).toEqual({ provider: "?" });
    expect(briefError(new ApiError("m", 502, "brief_model_failed")).key).toBe("errors.modelFailed");
    expect(briefError(new ApiError("m", 409, "brief_generation_in_progress")).key).toBe("errors.inProgress");
    expect(briefError(new ApiError("m", 422, "brief_input_over_budget")).key).toBe("errors.overBudget");
    expect(briefError(new Error("boom")).key).toBe("errors.generic");
  });
});

describe("selectLatestReview / countBlockers", () => {
  it("picks newest review with verdict, ignores summaries", () => {
    const a = rev({ id: "a", created_at: "2026-01-01" });
    const b = rev({ id: "b", created_at: "2026-02-01" });
    const c = rev({ id: "c", created_at: "2026-03-01", kind: "summary" });
    const d = rev({ id: "d", created_at: "2026-04-01", verdict: null });
    expect(selectLatestReview([a, b, c, d])?.id).toBe("b");
    expect(selectLatestReview([])).toBeNull();
  });
  it("counts CRITICAL not dismissed", () => {
    const r = rev({
      findings: [
        { severity: "CRITICAL", dismissed_at: null },
        { severity: "CRITICAL", dismissed_at: "t" },
        { severity: "WARNING", dismissed_at: null },
      ] as ReviewRecord["findings"],
    });
    expect(countBlockers(r)).toBe(1);
  });
});
