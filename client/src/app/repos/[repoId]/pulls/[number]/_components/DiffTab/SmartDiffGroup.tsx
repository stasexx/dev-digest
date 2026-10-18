"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { GROUP_HEADER_HEIGHT, ROLE_META } from "./constants";
import { countFilesWithFindings } from "./helpers";
import { s } from "./styles";

interface SmartDiffGroupProps {
  role: SmartDiffRole;
  files: PrFile[];
  commenting: DiffCommentApi;
  findings: DiffFindingsApi;
  /** Offset below the page's sticky PR header. */
  stickyTop?: number;
  /** Open the group even if it is collapsed by default (deep-link target inside). */
  forceOpen?: boolean;
  targetPath?: string | null;
  targetLine?: number | null;
  onTargetReady?: (cardEl: HTMLElement) => void;
}

export function SmartDiffGroup({ role, files, commenting, findings, stickyTop = 0, forceOpen = false, targetPath, targetLine, onTargetReady }: SmartDiffGroupProps) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const [open, setOpen] = React.useState(forceOpen || !meta.defaultCollapsed);
  React.useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const withFindings = countFilesWithFindings(files, findings.byPath);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <section>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ ...s.groupHeader, top: stickyTop }}>
        <Chevron size={14} style={{ color: "var(--text-muted)" }} />
        <span style={s.square(meta.color)} aria-hidden />
        <span style={s.roleLabel}>{t(meta.labelKey)}</span>
        <span style={s.roleDesc}>{t(meta.descKey)}</span>
        {withFindings > 0 ? (
          <span style={s.counter} title={t("smartDiff.filesWithFindings", { count: withFindings })}>
            <span style={s.counterDot} aria-hidden />
            {withFindings}
          </span>
        ) : (
          <span style={{ marginLeft: "auto" }} />
        )}
        <span style={s.filesCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && (
        <div style={s.groupBody}>
          <DiffViewer
            files={files}
            commenting={commenting}
            findings={findings}
            targetPath={targetPath}
            targetLine={targetLine}
            onTargetReady={onTargetReady}
            scrollMarginTop={stickyTop + GROUP_HEADER_HEIGHT}
          />
        </div>
      )}
    </section>
  );
}
