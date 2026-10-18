/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { VERDICT_META } from "./constants";
import type { VerdictBannerLabels } from "./types";
import { s } from "./styles";

type BannerProps = {
  verdict: Verdict;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName?: string | null;
};

/** `labels` given: render them without touching the `prReview` namespace.
    Absent: resolve today's strings from `prReview`. */
export function VerdictBanner({ labels, ...props }: BannerProps & { labels?: VerdictBannerLabels }) {
  if (labels) return <BannerView {...props} labels={labels} />;
  return <PrReviewBanner {...props} />;
}

function PrReviewBanner(props: BannerProps) {
  const t = useTranslations("prReview");
  const labels: VerdictBannerLabels = {
    verdict: {
      request_changes: t("verdict.requestChanges"),
      approve: t("verdict.approve"),
      comment: t("verdict.comment"),
    },
    findingsCount: t("verdict.findingsCount", { count: props.findingsCount }),
    blockers: t("verdict.blockers", { count: props.blockers }),
    prScore: t("verdict.prScore"),
  };
  return <BannerView {...props} labels={labels} />;
}

function BannerView({
  verdict,
  summary,
  score,
  findingsCount: _fc,
  blockers,
  agentName,
  labels,
}: BannerProps & { labels: VerdictBannerLabels }) {
  const m = VERDICT_META[verdict] ?? VERDICT_META.comment;
  const VIcon = Icon[m.icon];
  return (
    <div style={s.wrap}>
      <div style={s.iconBox(m.bg, m.c)}>
        <VIcon size={22} />
      </div>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.label(m.c)}>{labels.verdict[verdict] ?? labels.verdict.comment}</span>
          <Badge color="var(--text-secondary)">
            {labels.findingsCount}
            {blockers > 0 ? labels.blockers : ""}
          </Badge>
          {agentName && (
            <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Cpu">
              {agentName}
            </Badge>
          )}
        </div>
        {summary && <p style={s.summary}>{summary}</p>}
      </div>
      {score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{labels.prScore}</span>
        </div>
      )}
    </div>
  );
}
