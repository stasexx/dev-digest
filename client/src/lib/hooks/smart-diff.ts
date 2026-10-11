/* hooks/smart-diff.ts — React Query hook for the deterministic Smart Diff
   (role grouping of a PR's files). No LLM involved server-side. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

/** Role-grouped files for a PR. The key includes `headSha`, so a moved PR head
   refetches by itself (grouping depends only on the files) — no invalidation wiring. */
export function useSmartDiff(
  prId: string | null | undefined,
  headSha: string | null | undefined,
) {
  return useQuery({
    queryKey: ["smart-diff", prId, headSha],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
