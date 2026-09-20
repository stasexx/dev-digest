/* SeverityFilter — per-severity counters ("3 CRITICAL · 5 WARNING · 2 SUGGESTION")
   plus one toggle chip per severity. Purely presentational: the counts come from
   findings the panel already holds, so neither row triggers a fetch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, SeverityBadge, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { FILTER_SEVERITIES } from "../../constants";
import { s } from "./styles";

export function SeverityFilter({
  counts,
  active,
  onChange,
}: {
  counts: Record<Severity, number>;
  /** Severity currently filtered on; null = all findings shown. */
  active: Severity | null;
  onChange: (severity: Severity | null) => void;
}) {
  const t = useTranslations("prReview");
  const present = FILTER_SEVERITIES.filter((sev) => counts[sev] > 0);
  if (present.length === 0) return null;

  return (
    <div style={s.root}>
      <div style={s.counters} role="group" aria-label={t("panel.severity.countersLabel")}>
        {present.map((sev, i) => (
          <React.Fragment key={sev}>
            {i > 0 && (
              <span style={s.separator} aria-hidden>
                ·
              </span>
            )}
            <span data-testid={`severity-count-${sev}`}>
              <SeverityBadge severity={sev} count={counts[sev]} />
            </span>
          </React.Fragment>
        ))}
      </div>

      <div style={s.filters} role="group" aria-label={t("panel.severity.filterLabel")}>
        {FILTER_SEVERITIES.map((sev) => (
          <Chip
            key={sev}
            icon={SEV[sev].icon}
            color={SEV[sev].c}
            active={active === sev}
            // Clicking the active chip again clears the filter.
            onClick={() => onChange(active === sev ? null : sev)}
          >
            {t(`panel.severity.${sev}`)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
