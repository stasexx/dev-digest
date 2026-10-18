"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { BriefMissingInput } from "@devdigest/shared";
import { briefError, missingInputKey, missingReasonKey, shortSha } from "../../helpers";
import { s } from "../../styles";

export interface BriefNoticesProps {
  missingInputs: readonly BriefMissingInput[];
  stale: boolean;
  briefSha: string | null;
  currentSha: string;
  error: unknown;
  busy: boolean;
  onRegenerate: () => void;
  onRetry: () => void;
}

/** Polite live regions for: missing inputs, stale brief, last error. */
export function BriefNotices({ missingInputs, stale, briefSha, currentSha, error, busy, onRegenerate, onRetry }: BriefNoticesProps) {
  const t = useTranslations("brief");
  const err = error ? briefError(error) : null;
  return (
    <>
      {missingInputs.length > 0 && (
        <div role="status" aria-live="polite" style={s.notice("var(--border-strong)", "var(--bg-hover)")}>
          <Icon.Info size={14} aria-hidden />
          <div>
            <strong>{t("missing.title")}</strong>
            <ul style={s.noticeList}>
              {missingInputs.map((m) => {
                const nameKey = missingInputKey(m.input);
                return (
                  <li key={`${m.input}:${m.reason}`}>
                    {nameKey ? t(nameKey) : m.input} — {t(missingReasonKey(m.reason))}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      {stale && briefSha && (
        <div role="status" aria-live="polite" style={s.notice("var(--warn)", "var(--warn-bg)")}>
          <Icon.AlertTriangle size={14} aria-hidden />
          <span>{t("stale", { briefSha: shortSha(briefSha), currentSha: shortSha(currentSha) })}</span>
          <Button size="sm" kind="secondary" icon="RefreshCw" disabled={busy} onClick={onRegenerate}>
            {t("regenerate")}
          </Button>
        </div>
      )}
      <div role="status" aria-live="polite">
        {err && (
          <div style={s.notice("var(--crit)", "var(--crit-bg)")}>
            <Icon.AlertOctagon size={14} aria-hidden />
            <span>{t(err.key, err.values)}</span>
            <Button size="sm" kind="secondary" disabled={busy} onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
