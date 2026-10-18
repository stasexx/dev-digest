"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "../../styles";

export interface ReviewFocusListProps {
  items: readonly ReviewFocusItem[];
  changedFiles: readonly string[];
  onOpenFile: (file: string, line: number | null) => void;
}

export function ReviewFocusList({ items, changedFiles, onOpenFile }: ReviewFocusListProps) {
  const t = useTranslations("brief");
  const [missIdx, setMissIdx] = React.useState<number | null>(null);

  const open = (i: number, item: ReviewFocusItem) => {
    if (changedFiles.includes(item.file)) {
      setMissIdx(null);
      onOpenFile(item.file, item.line);
    } else {
      setMissIdx(i);
    }
  };

  return (
    <section style={s.card} aria-label={t("block.reviewFocus")}>
      <SectionLabel icon="ListChecks" right={items.length > 0 ? <Badge>{items.length}</Badge> : undefined}>
        {t("block.reviewFocus")}
      </SectionLabel>
      {items.length === 0 ? (
        <p style={s.muted}>{t("noReviewFocus")}</p>
      ) : (
        <ol style={s.list}>
          {items.map((item, i) => (
            <li key={`${item.file}:${item.line}:${i}`}>
              <button type="button" style={s.focusBtn} title={t("focus.openFile")} onClick={() => open(i, item)}>
                <span style={s.focusRef}>
                  {item.file}:{item.line}
                </span>
                <span> — {item.reason}</span>
              </button>
              <span role="status" aria-live="polite" style={s.inlineNote}>
                {missIdx === i ? t("nav.notInDiff") : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
