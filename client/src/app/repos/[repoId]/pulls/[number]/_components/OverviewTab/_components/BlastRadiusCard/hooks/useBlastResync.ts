"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";

/** Give up waiting for the index to advance after this long. */
const RESYNC_POLL_TIMEOUT_MS = 60_000;

/** Resync the repo index, poll its state until `updatedAt` advances (max 60 s),
    then refetch the blast radius + prior PRs for the PR. */
export function useBlastResync(repoId: string | null | undefined, prId: string | null | undefined) {
  const qc = useQueryClient();
  const [polling, setPolling] = useState(false);
  const [started, setStarted] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  const status = useRepoIntelStatus(repoId, polling);
  const resync = useResyncRepoIntel(repoId);
  const updatedAt = status.data?.updatedAt ?? null;

  useEffect(() => {
    if (!polling) return;
    if (updatedAt !== null && updatedAt !== baseline) {
      setPolling(false);
      setStarted(false);
      qc.invalidateQueries({ queryKey: ["blast", prId] });
      qc.invalidateQueries({ queryKey: ["prior-prs", prId] });
    }
  }, [polling, updatedAt, baseline, prId, qc]);

  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => {
      setPolling(false);
      setStarted(false);
    }, RESYNC_POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [polling]);

  const start = () => {
    setBaseline(updatedAt);
    resync.mutate(undefined, {
      onSuccess: () => {
        setStarted(true);
        setPolling(true);
      },
    });
  };

  return { start, isPending: resync.isPending, started };
}
