/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import type { DiffFindingsApi } from "../findings";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  findings,
  targetPath,
  targetLine = null,
  onTargetReady,
  scrollMarginTop,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
  /** Deep-link target: that card is force-opened, highlighted and reported via onTargetReady. */
  targetPath?: string | null;
  targetLine?: number | null;
  onTargetReady?: (cardEl: HTMLElement) => void;
  scrollMarginTop?: number;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard
          key={f.path}
          file={f}
          commenting={commenting}
          findings={findings}
          isTarget={f.path === targetPath}
          forceOpen={f.path === targetPath}
          highlightLine={f.path === targetPath ? targetLine : null}
          onTargetReady={onTargetReady}
          scrollMarginTop={scrollMarginTop}
        />
      ))}
    </div>
  );
}
