"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { BlastStats } from "@devdigest/shared";
import { VIEW_MODES, type ViewMode } from "../../constants";
import { s } from "../../styles";

export interface BlastStatRowProps {
  stats: BlastStats;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function BlastStatRow({ stats, view, onViewChange }: BlastStatRowProps) {
  const t = useTranslations("blast");
  const items = [
    { key: "symbols", Ico: Icon.Code, value: stats.symbols },
    { key: "callers", Ico: Icon.CornerDownRight, value: stats.callers },
    { key: "endpoints", Ico: Icon.Globe, value: stats.endpoints },
    { key: "crons", Ico: Icon.Clock, value: stats.crons },
  ] as const;

  return (
    <div style={s.statRow}>
      {items.map(({ key, Ico, value }) => (
        <span key={key} style={s.stat}>
          <Ico size={14} style={s.statIcon} aria-hidden="true" />
          <strong className="tnum">{value}</strong> {t(`stat.${key}`)}
        </span>
      ))}
      <div role="group" aria-label={t("toggle.ariaLabel")} style={s.toggle}>
        {VIEW_MODES.map((mode) => (
          <Button
            key={mode}
            kind="ghost"
            size="sm"
            active={view === mode}
            aria-pressed={view === mode}
            onClick={() => onViewChange(mode)}
          >
            {t(`view.${mode}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
