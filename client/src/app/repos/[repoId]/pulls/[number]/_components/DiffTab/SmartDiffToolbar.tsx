"use client";

import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import type { DiffOrder } from "./constants";
import { s } from "./styles";

interface SmartDiffToolbarProps {
  filesCount: number;
  additions: number;
  deletions: number;
  order: DiffOrder;
  smartDisabled: boolean;
  onOrder: (order: DiffOrder) => void;
  /** GitHub comments + finding cards in the diff; the toggle is hidden at 0. */
  annotationsCount: number;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
}

export function SmartDiffToolbar(p: SmartDiffToolbarProps) {
  const t = useTranslations("prReview");
  return (
    <div style={s.toolbar}>
      <SectionLabel icon="Code">{t("smartDiff.toolbarTitle")}</SectionLabel>
      <div style={s.toolbarRow}>
        <span>{t("smartDiff.filesSummary", { count: p.filesCount })}</span>
        <span>·</span>
        <span style={s.add}>+{p.additions}</span>
        <span style={s.del}>{"−"}{p.deletions}</span>
        <div style={s.rowRight}>
          {p.annotationsCount > 0 && (
            <Button
              kind="ghost"
              size="sm"
              icon={p.showAnnotations ? "EyeOff" : "Eye"}
              onClick={p.onToggleAnnotations}
            >
              {t(p.showAnnotations ? "smartDiff.hideAnnotations" : "smartDiff.showAnnotations", {
                count: p.annotationsCount,
              })}
            </Button>
          )}
          <div role="group" aria-label={t("smartDiff.orderToggleLabel")} style={s.segmented}>
            <Button
              kind="ghost"
              size="sm"
              active={p.order === "smart"}
              aria-pressed={p.order === "smart"}
              disabled={p.smartDisabled}
              onClick={() => p.onOrder("smart")}
            >
              {t("smartDiff.smartOrder")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              active={p.order === "original"}
              aria-pressed={p.order === "original"}
              onClick={() => p.onOrder("original")}
            >
              {t("smartDiff.originalOrder")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
