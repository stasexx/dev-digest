"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/contexts/toast";
import type { PrDetail } from "@devdigest/shared";
import type { DiffOrder } from "./constants";
import { buildRoleGroups, diffReviewState, groupFindingsByPath, selectLatestFindings } from "./helpers";
import { DiffFindingCard } from "./DiffFindingCard";
import { SmartDiffGroup } from "./SmartDiffGroup";
import { SmartDiffToolbar } from "./SmartDiffToolbar";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  pr: PrDetail;
  reviewRunning: boolean;
}

export function DiffTab({ prId, pr, reviewRunning }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const { data: reviews } = usePrReviews(prId);
  const create = useCreatePrComment(prId);
  const action = useFindingAction();
  const smart = useSmartDiff(prId, pr.head_sha);

  const [order, setOrder] = React.useState<DiffOrder>("smart");
  // null = automatic (see showAnnotations); one switch for GitHub threads + finding cards.
  const [showOverride, setShowOverride] = React.useState<boolean | null>(null);

  const files = pr.files;
  const byPath = React.useMemo(
    () => groupFindingsByPath(selectLatestFindings(reviews), new Set(files.map((f) => f.path))),
    [reviews, files],
  );
  let findingsInDiff = 0;
  for (const list of byPath.values()) findingsInDiff += list.length;
  const commentCount = comments?.length ?? 0;
  const showAnnotations = showOverride ?? findingsInDiff > 0;
  const state = diffReviewState(reviews, reviewRunning, findingsInDiff);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: pr.status === "open" && !!prId,
    showComments: showAnnotations,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowOverride(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("smartDiff.postFailed"));
        throw err;
      }
    },
  };

  const findingsApi: DiffFindingsApi = {
    byPath,
    show: showAnnotations,
    pending: action.isPending,
    onAction: (findingId, act) => action.mutate({ findingId, action: act, prId: prId ?? undefined }),
    Card: DiffFindingCard,
  };

  const smartFailed = smart.isError;
  const effectiveOrder: DiffOrder = smartFailed ? "original" : order;
  const hint = { none: "emptyNoReview", running: "reviewRunning", clean: "noFindings", has: null }[state];

  return (
    <section>
      <SmartDiffToolbar
        filesCount={files.length}
        additions={files.reduce((n, f) => n + f.additions, 0)}
        deletions={files.reduce((n, f) => n + f.deletions, 0)}
        order={effectiveOrder}
        smartDisabled={smartFailed}
        onOrder={setOrder}
        annotationsCount={commentCount + findingsInDiff}
        showAnnotations={showAnnotations}
        onToggleAnnotations={() => setShowOverride(!showAnnotations)}
      />
      {hint && <p style={s.hint}>{t(`smartDiff.${hint}`)}</p>}
      {smartFailed && <p style={s.hint}>{t("smartDiff.smartUnavailable")}</p>}
      {effectiveOrder === "smart" && smart.data ? (
        <div style={s.list}>
          {buildRoleGroups(smart.data, files).map((g) => (
            <SmartDiffGroup key={g.role} role={g.role} files={g.files} commenting={commenting} findings={findingsApi} />
          ))}
        </div>
      ) : effectiveOrder === "smart" ? (
        <Skeleton height={120} />
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findingsApi} />
      )}
    </section>
  );
}
