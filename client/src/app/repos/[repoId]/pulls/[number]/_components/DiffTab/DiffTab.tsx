"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { parseDiffTarget } from "@/lib/utils/diffLink";
import { notify } from "@/lib/contexts/toast";
import type { PrDetail } from "@devdigest/shared";
import type { DiffOrder } from "./constants";
import { buildRoleGroups, diffReviewState, groupFindingsByPath, selectLatestFindings } from "./helpers";
import { DiffFindingCard } from "./DiffFindingCard";
import { SmartDiffGroup } from "./SmartDiffGroup";
import { NotInDiffNotice } from "./NotInDiffNotice";
import { SmartDiffToolbar } from "./SmartDiffToolbar";
import { useStickyOffset } from "./useStickyOffset";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  pr: PrDetail;
  reviewRunning: boolean;
  /** Deep-link target from the URL (`file` / `line` search params); both optional. */
  targetFile?: string | null;
  targetLine?: string | null;
}

export function DiffTab({ prId, pr, reviewRunning, targetFile = null, targetLine = null }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const { data: reviews } = usePrReviews(prId);
  const create = useCreatePrComment(prId);
  const action = useFindingAction();
  const smart = useSmartDiff(prId, pr.head_sha);
  const stickyTop = useStickyOffset();

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

  const target = React.useMemo(
    () => parseDiffTarget(targetFile, targetLine, files.map((f) => f.path)),
    [targetFile, targetLine, files],
  );
  const targetPath = target.kind === "target" ? target.file : null;
  const targetLineNo = target.kind === "target" ? target.line : null;

  // Scroll once per (file, line, order). Called by the target FileCard from its own effect, i.e.
  // after the group/card opened and its lines rendered; marked handled only after a real scroll.
  const handledKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (targetPath == null) handledKeyRef.current = null; // re-arm after the target is cleared
  }, [targetPath]);
  const onTargetReady = React.useCallback(
    (cardEl: HTMLElement) => {
      if (targetPath == null) return;
      const key = `${targetPath}|${targetLineNo ?? ""}|${effectiveOrder}`;
      if (handledKeyRef.current === key) return;
      if (!cardEl.isConnected || cardEl.dataset.diffFile !== targetPath) return;
      const lineEl =
        targetLineNo != null ? cardEl.querySelector<HTMLElement>(`[data-new-line="${targetLineNo}"]`) : null;
      if (lineEl) lineEl.scrollIntoView({ block: "center" });
      else cardEl.scrollIntoView({ block: "start" });
      handledKeyRef.current = key;
    },
    [targetPath, targetLineNo, effectiveOrder],
  );
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
      {target.kind === "not_in_diff" && <NotInDiffNotice />}
      {hint && <p style={s.hint}>{t(`smartDiff.${hint}`)}</p>}
      {smartFailed && <p style={s.hint}>{t("smartDiff.smartUnavailable")}</p>}
      {effectiveOrder === "smart" && smart.data ? (
        <div style={s.list}>
          {buildRoleGroups(smart.data, files).map((g) => (
            <SmartDiffGroup key={g.role} role={g.role} files={g.files} commenting={commenting} findings={findingsApi} stickyTop={stickyTop}
              forceOpen={targetPath != null && g.files.some((f) => f.path === targetPath)}
              targetPath={targetPath}
              targetLine={targetLineNo}
              onTargetReady={onTargetReady}
            />
          ))}
        </div>
      ) : effectiveOrder === "smart" ? (
        <Skeleton height={120} />
      ) : (
        <DiffViewer
          files={files}
          commenting={commenting}
          findings={findingsApi}
          targetPath={targetPath}
          targetLine={targetLineNo}
          onTargetReady={onTargetReady}
          scrollMarginTop={stickyTop}
        />
      )}
    </section>
  );
}
