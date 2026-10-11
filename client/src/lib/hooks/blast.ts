/* hooks/blast.ts — React Query hooks for the PR Blast radius card.
     GET /pulls/:id/blast       → BlastRadiusResponse (index-only, no LLM)
     GET /pulls/:id/prior-prs   → PriorPrsResponse (local git history)
   Resync reuses useResyncRepoIntel / useRepoIntelStatus from ./repo-intel. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse, PriorPrsResponse } from "@devdigest/shared";

/** Blast-radius map for a PR. Pass `undefined` to keep the query disabled. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/** Earlier merged PRs that touched the same files (from the local clone's git history). */
export function usePriorPrs(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["prior-prs", prId],
    queryFn: () => api.get<PriorPrsResponse>(`/pulls/${prId}/prior-prs`),
    enabled: !!prId,
  });
}
