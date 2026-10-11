"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { BlastDegradedReason, BlastIndexStatus } from "@devdigest/shared";
import { s } from "../../styles";

export interface DegradedNoticeProps {
  reason: BlastDegradedReason | null;
  indexStatus: BlastIndexStatus;
  onResync: () => void;
  resyncPending: boolean;
  resyncStarted: boolean;
}

export function DegradedNotice({
  reason,
  indexStatus,
  onResync,
  resyncPending,
  resyncStarted,
}: DegradedNoticeProps) {
  const t = useTranslations("blast");
  return (
    <div role="status" style={s.notice}>
      <Icon.AlertTriangle size={14} aria-hidden="true" />
      <span style={s.noticeLabel}>{t("degraded.label")}</span>
      {reason && <span>{t(`degraded.reason.${reason}`)}</span>}
      <span style={s.muted}>{t("degraded.status", { status: indexStatus })}</span>
      <span style={s.noticeAction}>
        {resyncStarted ? (
          <span style={s.muted}>{t("degraded.resyncStarted")}</span>
        ) : (
          <Button kind="secondary" size="sm" icon="RefreshCw" loading={resyncPending} onClick={onResync}>
            {t("degraded.resync")}
          </Button>
        )}
      </span>
    </div>
  );
}
