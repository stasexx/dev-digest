/* hooks/conventions.ts — React Query hooks for the Conventions Extractor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionScanResult,
  ConventionUpdateInput,
  ConventionsToSkillInput,
  Skill,
} from "@devdigest/shared";

export interface ConventionSkillDraft {
  name: string;
  description: string;
  body: string;
  accepted: number;
}

const key = (repoId: string | null | undefined) => ["conventions", repoId];

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run Scan / ReScan — one LLM call server-side; the result replaces the cached list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionScanResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (scan) => qc.setQueryData(key(repoId), scan.candidates),
  });
}

/** Accept / Reject / Edit one candidate. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionUpdateInput }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

export function useConventionSkillDraft(repoId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["conventions-skill-draft", repoId],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreateSkillFromConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConventionsToSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
