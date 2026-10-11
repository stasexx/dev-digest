"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink } from "@devdigest/ui";
import type { RankedDownstreamImpact } from "@devdigest/shared";
import { callerHref, formatLocation } from "../../helpers";
import { s } from "../../styles";

export interface BlastTreeProps {
  downstream: RankedDownstreamImpact[];
  withoutCallerNames: string[];
  impactedEndpoints: string[];
  repoFullName: string | null;
  sha: string | null;
  /** Per-symbol caller cap from the API `limits`; renders the truncation hint when set. */
  truncatedMax?: number;
}

export function BlastTree({
  downstream,
  withoutCallerNames,
  impactedEndpoints,
  repoFullName,
  sha,
  truncatedMax,
}: BlastTreeProps) {
  const t = useTranslations("blast");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (symbol: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  const attributed = new Set(downstream.flatMap((d) => d.endpoints_affected));
  const unattributed = impactedEndpoints.filter((e) => !attributed.has(e));

  return (
    <div>
      <ul style={s.list}>
        {downstream.map((d) => {
          const open = !collapsed.has(d.symbol);
          return (
            <li key={d.symbol}>
              <div style={s.symbolRow}>
                <button
                  type="button"
                  style={s.chevronBtn}
                  aria-expanded={open}
                  aria-label={t(open ? "collapse" : "expand", { symbol: d.symbol })}
                  onClick={() => toggle(d.symbol)}
                >
                  {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
                </button>
                <Icon.Code size={14} style={s.statIcon} aria-hidden="true" />
                <span className="mono" style={s.symbolName}>
                  {d.symbol}()
                </span>
                <span style={s.muted}>{t("callerCount", { count: d.callers.length })}</span>
              </div>
              {open && (
                <div style={s.body}>
                  {d.callers.map((c) => {
                    const location = formatLocation(c.file, c.line);
                    const href = callerHref(repoFullName, sha, c.file, c.line);
                    return (
                      <div key={`${c.file}:${c.line}:${c.name}`} style={s.callerRow}>
                        <Icon.CornerDownRight size={13} style={s.statIcon} aria-hidden="true" />
                        {href ? (
                          <MonoLink href={href}>{location}</MonoLink>
                        ) : (
                          <span className="mono">{location}</span>
                        )}
                        <span className="mono" style={s.callerName}>
                          {c.name}
                        </span>
                      </div>
                    );
                  })}
                  {d.endpoints_affected.length > 0 && (
                    <div style={s.chipRow} data-testid="blast-endpoints">
                      {d.endpoints_affected.map((e) => (
                        <span key={e} className="mono" style={s.endpointChip}>
                          <Icon.Globe size={12} aria-hidden="true" />
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                  {d.crons_affected.length > 0 && (
                    <div style={s.chipRow} data-testid="blast-crons">
                      {d.crons_affected.map((c) => (
                        <span key={c} className="mono" style={s.cronChip}>
                          <Icon.Clock size={12} aria-hidden="true" />
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {unattributed.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={s.muted}>{t("unattributedEndpoints")}</div>
          <div style={{ ...s.chipRow, marginTop: 6 }}>
            {unattributed.map((e) => (
              <span key={e} className="mono" style={s.endpointChip}>
                <Icon.Globe size={12} aria-hidden="true" />
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {withoutCallerNames.length > 0 && (
        <p style={s.footnote}>{t("withoutCallers", { names: withoutCallerNames.join(", ") })}</p>
      )}
      {truncatedMax != null && <p style={s.footnote}>{t("truncated", { max: truncatedMax })}</p>}
    </div>
  );
}
