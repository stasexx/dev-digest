/* PrBriefBlock — "PR Brief" container: summary, the risk section, the review-focus section, notices.
   Intent and Blast radius are supplied as slots by the Overview tab (always shown). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { BriefNotices } from "./_components/BriefNotices";
import { BriefSummary } from "./_components/BriefSummary";
import { ReviewFocusList } from "./_components/ReviewFocusList";
import { RiskAreas } from "./_components/RiskAreas";
import { selectLatestReview } from "./helpers";
import { s } from "./styles";

export interface PrBriefBlockProps {
  prId: string;
  /** Paths changed in this PR; targets outside it show "not in diff" instead of navigating. */
  changedFiles: readonly string[];
  onOpenFile: (file: string, line: number | null) => void;
  intentSlot: React.ReactNode;
  blastSlot: React.ReactNode;
}

export function PrBriefBlock({ prId, changedFiles, onOpenFile, intentSlot, blastSlot }: PrBriefBlockProps) {
  const t = useTranslations("brief");
  const query = useBrief(prId);
  const gen = useGenerateBrief(prId);
  const reviews = usePrReviews(prId);

  const data = query.data;
  const brief = data?.brief ?? null;
  const generating = gen.isPending || !!data?.generating;
  const busy = generating;
  const error = gen.error ?? (query.isError && !data ? query.error : null);
  const generate = () => gen.mutate();
  const retry = () => (gen.error || !query.isError ? gen.mutate() : void query.refetch());

  const showSkeleton = !brief && (generating || (query.isLoading && !data));

  const notices = (
    <BriefNotices
      missingInputs={brief?.missing_inputs ?? []}
      stale={!!brief && !!data?.stale}
      briefSha={brief?.head_sha ?? null}
      currentSha={data?.current_head_sha ?? ""}
      error={error}
      busy={busy}
      onRegenerate={generate}
      onRetry={retry}
    />
  );

  let top: React.ReactNode;
  if (brief) {
    top = (
      <BriefSummary
        brief={brief}
        review={selectLatestReview(reviews.data)}
        regenerating={generating}
        busy={busy}
        onRefresh={generate}
      />
    );
  } else if (showSkeleton) {
    top = (
      <div style={s.skeleton} aria-busy="true" aria-live="polite">
        <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          {t("generating")}
        </span>
        <Skeleton height={16} width="70%" />
        <Skeleton height={14} width="90%" />
        <Skeleton height={14} width="55%" />
      </div>
    );
  } else {
    top = (
      <div style={s.empty}>
        <p style={s.emptyTitle}>{t("unavailable")}</p>
        <p style={s.emptyHint}>{t("unavailableHint")}</p>
        <Button kind="primary" icon="Sparkles" disabled={busy} onClick={generate}>
          {t("generate")}
        </Button>
      </div>
    );
  }

  return (
    <section style={s.root} aria-label={t("title")}>
      <SectionLabel icon="FileText">{t("title")}</SectionLabel>
      {top}
      {notices}
      <div style={s.grid}>
        <div style={s.col}>
          {intentSlot}
          {brief && <RiskAreas risks={brief.risks.risks} changedFiles={changedFiles} onOpenFile={onOpenFile} />}
        </div>
        <div style={s.col}>{blastSlot}</div>
      </div>
      {brief && <ReviewFocusList items={brief.review_focus} changedFiles={changedFiles} onOpenFile={onOpenFile} />}
    </section>
  );
}
