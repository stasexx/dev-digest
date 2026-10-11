/* UnanchoredFindings — findings whose line is not in the rendered patch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { fs } from "../styles";
import type { DiffFindingsApi } from "../findings";

export function UnanchoredFindings({
  findings,
  api,
}: {
  findings: FindingRecord[];
  api: DiffFindingsApi;
}) {
  const t = useTranslations("shell");
  if (findings.length === 0) return null;
  const { Card } = api;
  return (
    <div style={fs.unanchoredWrap}>
      <span style={fs.unanchoredTitle}>
        {t("diffViewer.unanchoredFindingsTitle", { count: findings.length })}
      </span>
      {findings.map((f) => (
        <Card
          key={f.id}
          finding={f}
          pending={api.pending}
          onAction={(action) => api.onAction(f.id, action)}
        />
      ))}
    </div>
  );
}
