/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { topSeverity, type DiffFindingsApi } from "../findings";
import { s, lineRowFor, lineSignFor, barFor, labelFor, highlightFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { LineFindings } from "../LineFindings";

const NO_FINDINGS: FindingRecord[] = [];

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings = NO_FINDINGS,
  findingsApi,
  highlighted = false,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Review findings anchored to this line (bar + label always; cards per findingsApi.show). */
  findings?: FindingRecord[];
  findingsApi?: DiffFindingsApi;
  /** Deep-link target line: accent highlight + data-target-line marker. */
  highlighted?: boolean;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const top = findings.length > 0 ? SEV[topSeverity(findings)] : null;
  const SevIcon = top ? Icon[top.icon] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        data-new-line={ln.newNo ?? undefined}
        data-target-line={highlighted ? "true" : undefined}
        style={{
          ...lineRowFor(ln.kind),
          ...(top ? barFor(top.c) : null),
          ...(highlighted ? highlightFor(!top) : null),
        }}
      >
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {top && SevIcon && (
          <span style={labelFor(top.c)}>
            <SevIcon size={12} />
            {t(`diffViewer.findingLabel.${topSeverity(findings)}`)}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {findingsApi && findingsApi.show && (
        <LineFindings findings={findings} api={findingsApi} />
      )}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
