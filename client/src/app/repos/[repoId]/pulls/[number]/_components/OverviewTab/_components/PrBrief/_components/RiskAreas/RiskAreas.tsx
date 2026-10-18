"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, SectionLabel } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { parseFileRef } from "@/lib/utils/diffLink";
import { GENERIC_RISK_ICON, RISK_KIND_ICON, RISK_SEVERITY_TOKEN } from "../../constants";
import { s } from "../../styles";

export interface RiskAreasProps {
  risks: readonly Risk[];
  changedFiles: readonly string[];
  onOpenFile: (file: string, line: number | null) => void;
}

export function RiskAreas({ risks, changedFiles, onOpenFile }: RiskAreasProps) {
  const t = useTranslations("brief");
  const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(new Set());
  const [missIdx, setMissIdx] = React.useState<number | null>(null);

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const open = (i: number, ref: string) => {
    const { path, line } = parseFileRef(ref);
    if (changedFiles.includes(path)) {
      setMissIdx(null);
      onOpenFile(path, line);
    } else {
      setMissIdx(i);
    }
  };

  return (
    <section aria-label={t("block.risks")}>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {risks.length === 0 ? (
        <p style={s.muted}>{t("noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => {
            const sev = SEV[RISK_SEVERITY_TOKEN[risk.severity] ?? "SUGGESTION"];
            const iconName = Object.prototype.hasOwnProperty.call(RISK_KIND_ICON, risk.kind)
              ? RISK_KIND_ICON[risk.kind]!
              : GENERIC_RISK_ICON;
            const KindIcon = Icon[iconName];
            const isOpen = expanded.has(i);
            const ref = risk.file_refs[0];
            const head = (
              <>
                <KindIcon size={15} style={{ color: sev.c, marginTop: 2, flexShrink: 0 }} aria-hidden />
                <span>
                  <span style={s.riskTitle}>{risk.title}</span>
                  <span style={s.sevChip(sev.c, sev.bg)}>{t(`severity.${risk.severity}`)}</span>
                  {ref && <span style={s.riskRef}>{ref}</span>}
                </span>
              </>
            );
            return (
              <li key={`${risk.title}:${i}`} style={s.riskRow}>
                <div style={s.riskHead}>
                  {ref ? (
                    <button type="button" style={s.riskMain} title={t("risk.openFile")} onClick={() => open(i, ref)}>
                      {head}
                    </button>
                  ) : (
                    <div style={s.riskMain}>{head}</div>
                  )}
                  <button
                    type="button"
                    style={s.riskToggle}
                    aria-expanded={isOpen}
                    aria-controls={`brief-risk-${i}`}
                    aria-label={isOpen ? t("risk.collapse") : t("risk.expand")}
                    onClick={() => toggle(i)}
                  >
                    <Icon.ChevronDown size={16} style={{ transform: isOpen ? "rotate(180deg)" : "none" }} aria-hidden />
                  </button>
                </div>
                {isOpen && (
                  <p id={`brief-risk-${i}`} style={s.riskBody}>
                    {risk.explanation}
                  </p>
                )}
                <span role="status" aria-live="polite" style={s.inlineNote}>
                  {missIdx === i ? t("nav.notInDiff") : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
