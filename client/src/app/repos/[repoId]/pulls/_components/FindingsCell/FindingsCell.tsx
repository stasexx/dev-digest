/* FindingsCell — PR-list FINDINGS column: severity icons with counts for the PR's
   latest review, plus a read-only hover/focus popover previewing those findings.
   Everything comes from the list payload — no fetch, no actions (accept/dismiss
   live on the PR page). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import type { PrFindingsSummary } from "@devdigest/shared";
import { SEVERITY_COUNT_KEYS } from "./constants";
import { s } from "./styles";

export function FindingsCell({ findings }: { findings: PrFindingsSummary | null | undefined }) {
  const t = useTranslations("prReview");
  // Anchor rect of the cell while the popover is open (null = closed). The popover is
  // position:fixed because the list card clips overflow — an absolute one gets cut off.
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  const popoverId = React.useId();
  const open = anchor !== null;
  const show = (e: React.SyntheticEvent<HTMLElement>) => setAnchor(e.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);

  if (!findings) return <span style={s.muted}>—</span>;
  if (findings.total === 0) return <span style={s.muted}>{t("list.findings.none")}</span>;

  const hidden = findings.total - findings.previews.length;
  return (
    <div
      style={s.cell}
      tabIndex={0}
      aria-describedby={open ? popoverId : undefined}
      aria-label={t("list.findings.cellLabel", { count: findings.total })}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {SEVERITY_COUNT_KEYS.filter(({ key }) => findings[key] > 0).map(({ severity, key }) => (
        <SeverityBadge key={severity} severity={severity} count={findings[key]} compact />
      ))}

      {anchor && (
        // Swallow clicks so reading the popover never triggers the row's navigation.
        <div
          id={popoverId}
          role="tooltip"
          style={s.popover(anchor)}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={s.heading}>{t("list.findings.popoverTitle", { count: findings.total })}</div>
          <ul style={s.list}>
            {findings.previews.map((f, i) => (
              <li
                key={f.id}
                style={i === findings.previews.length - 1 ? { ...s.item, ...s.itemLast } : s.item}
              >
                <div style={s.titleRow}>
                  <SeverityBadge severity={f.severity} compact />
                  <span style={s.title}>{f.title}</span>
                </div>
                <div style={s.meta}>
                  <span>{f.category}</span>
                  <span className="mono">
                    {f.file}:{f.start_line}
                  </span>
                  <span className="tnum">{Math.round(f.confidence * 100)}%</span>
                </div>
                <div style={s.rationale}>{f.rationale}</div>
              </li>
            ))}
          </ul>
          {hidden > 0 && <div style={s.more}>{t("list.findings.more", { count: hidden })}</div>}
        </div>
      )}
    </div>
  );
}
