"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBlastRadius, usePriorPrs } from "@/lib/hooks/blast";
import { s } from "./styles";
import { withoutCallers } from "./helpers";
import type { ViewMode } from "./constants";
import { useBlastResync } from "./hooks/useBlastResync";
import { BlastStatRow } from "./_components/BlastStatRow";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { DegradedNotice } from "./_components/DegradedNotice";
import { PriorPrsSection } from "./_components/PriorPrsSection";

export interface BlastRadiusCardProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
}

export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const [view, setView] = useState<ViewMode>("tree");
  const blast = useBlastRadius(prId);
  const prior = usePriorPrs(prId);
  const resync = useBlastResync(repoId, prId);
  const data = blast.data;

  let body: React.ReactNode = null;
  if (blast.isLoading) {
    body = (
      <div data-testid="blast-loading" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={16} width="70%" />
        <Skeleton height={14} width="50%" />
        <Skeleton height={14} width="60%" />
      </div>
    );
  } else if (blast.isError || !data) {
    body = <p style={{ ...s.muted, margin: 0 }}>{t("error")}</p>;
  } else {
    const sha = data.commit_sha ?? headSha;
    let content: React.ReactNode;
    if (data.stats.symbols === 0) {
      content = <p style={{ ...s.muted, margin: 0 }}>{t("noSymbols")}</p>;
    } else if (data.downstream.length === 0) {
      content = (
        <p style={{ ...s.muted, margin: 0 }}>{t("noDownstream", { count: data.stats.symbols })}</p>
      );
    } else if (view === "graph") {
      content = (
        <BlastGraph
          downstream={data.downstream}
          factsByFile={data.facts_by_file}
          repoFullName={repoFullName}
          sha={sha}
        />
      );
    } else {
      content = (
        <BlastTree
          downstream={data.downstream}
          withoutCallerNames={withoutCallers(data.changed_symbols, data.downstream)}
          impactedEndpoints={data.impacted_endpoints}
          repoFullName={repoFullName}
          sha={sha}
          truncatedMax={data.truncated ? data.limits.max_callers_per_symbol : undefined}
        />
      );
    }
    body = (
      <>
        <BlastStatRow stats={data.stats} view={view} onViewChange={setView} />
        {data.degraded && (
          <DegradedNotice
            reason={data.reason}
            indexStatus={data.index_status}
            onResync={resync.start}
            resyncPending={resync.isPending}
            resyncStarted={resync.started}
          />
        )}
        {content}
      </>
    );
  }

  return (
    <Card pad style={{ marginBottom: 0 }}>
      <SectionLabel icon="Workflow">{t("title")}</SectionLabel>
      {body}
      <PriorPrsSection
        data={prior.data}
        isLoading={prior.isLoading}
        isError={prior.isError}
        repoFullName={repoFullName}
      />
    </Card>
  );
}
