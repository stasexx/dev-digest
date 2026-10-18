/* hooks/brief.ts — React Query hooks for the PR Why + Risk Brief. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

/** Re-check cadence while a brief is generating and none is cached (AC-55, <= 5 s). */
export const BRIEF_POLL_MS = 3000;

/** Read the cached brief (never triggers an LLM call server-side). */
export function useBrief(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["brief", prId],
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (q) =>
      q.state.data?.generating && !q.state.data?.brief ? BRIEF_POLL_MS : false,
  });
}

/** Generate (or regenerate) the brief and put the response into the cache. */
export function useGenerateBrief(prId: string | number | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (d) => qc.setQueryData(["brief", prId], d),
  });
}
