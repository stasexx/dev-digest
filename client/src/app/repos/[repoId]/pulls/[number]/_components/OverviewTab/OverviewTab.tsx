"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { s } from "./styles";
import { IntentCard } from "./IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { PrBriefBlock } from "./_components/PrBrief";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  changedFiles: readonly string[];
  onOpenFile: (file: string, line: number | null) => void;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha, changedFiles, onOpenFile }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {prId && (
        <PrBriefBlock
          prId={prId}
          changedFiles={changedFiles}
          onOpenFile={onOpenFile}
          intentSlot={<IntentCard prId={prId} />}
          blastSlot={<BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />}
        />
      )}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.descriptionLabel")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </div>
  );
}
