/* LineFindings — finding cards rendered under the code line they anchor to. */
"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { cs } from "../comments";
import type { DiffFindingsApi } from "../findings";

export function LineFindings({
  findings,
  api,
}: {
  findings: FindingRecord[];
  api: DiffFindingsApi;
}) {
  if (findings.length === 0) return null;
  const { Card } = api;
  return (
    <div style={cs.thread}>
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
