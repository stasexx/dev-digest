"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink } from "@devdigest/ui";
import type { PriorPrsResponse } from "@devdigest/shared";
import { githubPrUrl } from "@/lib/utils/githubUrls";
import { s } from "../../styles";

export interface PriorPrsSectionProps {
  data?: PriorPrsResponse;
  isLoading: boolean;
  isError: boolean;
  repoFullName: string | null;
}

/** `2026-10-03T12:00:00Z` -> `2026-10-03`; non-ISO strings are shown as-is. */
function toDay(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}

export function PriorPrsSection({ data, isLoading, isError, repoFullName }: PriorPrsSectionProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(false);
  const count = data?.history.length;

  return (
    <div style={s.priorWrap}>
      <button type="button" style={s.priorHeader} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        <Icon.History size={14} aria-hidden="true" />
        <span>{t("priorPrs.title")}</span>
        <span className="tnum" style={s.count}>
          {isLoading || count == null ? "…" : count}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {isError && <p style={s.muted}>{t("priorPrs.error")}</p>}
          {!isError && data && !data.clone_available && <p style={s.muted}>{t("priorPrs.noClone")}</p>}
          {!isError && data && data.clone_available && data.history.length === 0 && (
            <p style={s.muted}>{t("priorPrs.empty", { commits: data.commits_scanned })}</p>
          )}
          {!isError && data && data.history.length > 0 && (
            <ul style={s.list}>
              {data.history.map((pr) => (
                <li key={pr.pr_number} style={s.priorItem}>
                  <div style={s.priorTitleRow}>
                    {repoFullName ? (
                      <MonoLink href={githubPrUrl(repoFullName, pr.pr_number)}>#{pr.pr_number}</MonoLink>
                    ) : (
                      <span className="mono">#{pr.pr_number}</span>
                    )}
                    <span>{pr.title}</span>
                    <span style={s.muted}>{t("priorPrs.by", { author: pr.author })}</span>
                    <span className="tnum" style={s.muted}>
                      {toDay(pr.merged_at)}
                    </span>
                  </div>
                  {pr.files_overlap.map((f) => (
                    <span key={f} className="mono" style={s.muted}>
                      {f}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {!isError && data && data.clone_available && (
            <p style={s.footnote}>{t("priorPrs.source", { commits: data.commits_scanned })}</p>
          )}
        </div>
      )}
    </div>
  );
}
