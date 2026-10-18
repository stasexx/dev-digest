"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { PrBriefRecord, ReviewRecord, Verdict } from "@devdigest/shared";
import { VerdictBanner } from "../../../../../VerdictBanner";
import type { VerdictBannerLabels } from "../../../../../VerdictBanner";
import { countBlockers, formatCost, formatTokens } from "../../helpers";
import { s } from "../../styles";

export interface BriefSummaryProps {
  brief: PrBriefRecord;
  review: ReviewRecord | null;
  regenerating: boolean;
  busy: boolean;
  onRefresh: () => void;
}

export function BriefSummary({ brief, review, regenerating, busy, onRefresh }: BriefSummaryProps) {
  const t = useTranslations("brief");
  const g = brief.generation;

  const refresh = (
    <Button kind="ghost" size="sm" icon="RefreshCw" loading={regenerating} disabled={busy} aria-label={t("refresh")} title={t("refresh")} onClick={onRefresh} />
  );

  let body: React.ReactNode;
  if (review?.verdict) {
    const blockers = countBlockers(review);
    const count = review.findings.length;
    const labels: VerdictBannerLabels = {
      verdict: { request_changes: t("verdict.requestChanges"), approve: t("verdict.approve"), comment: t("verdict.comment") },
      findingsCount: t("verdict.findingsCount", { count }),
      blockers: t("verdict.blockers", { count: blockers }),
      prScore: t("verdict.prScore"),
    };
    body = (
      <VerdictBanner
        verdict={review.verdict as Verdict}
        summary={brief.summary}
        score={review.score}
        findingsCount={count}
        blockers={blockers}
        labels={labels}
      />
    );
  } else {
    body = <p style={s.summaryText}>{brief.summary}</p>;
  }

  return (
    <div style={s.card}>
      {body}
      <div style={s.metaRow}>
        <span>
          {t("meta.model")}: <span style={s.mono}>{brief.model.model}</span>
        </span>
        <span>
          {t("meta.generatedAt")}: {new Date(brief.generated_at).toLocaleString()}
        </span>
        <span>
          {t("meta.tokens")}:{" "}
          <span style={s.mono}>
            {formatTokens(g.tokens_in)}→{formatTokens(g.tokens_out)}
          </span>
        </span>
        {g.cost_usd != null && (
          <span>
            {t("meta.cost")}: <span style={s.mono}>{formatCost(g.cost_usd)}</span>
          </span>
        )}
        <span style={s.metaSpacer}>{refresh}</span>
      </div>
    </div>
  );
}
