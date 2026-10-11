"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { BlastFileFacts, RankedDownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/utils/githubUrls";
import { buildBlastGraph, truncateLabel, type GraphNode } from "./layout";
import { LEGEND_DOT_COLOR, NODE_STYLE, legendDot, s } from "./styles";

export interface BlastGraphProps {
  downstream: readonly RankedDownstreamImpact[];
  factsByFile: Readonly<Record<string, BlastFileFacts>>;
  /** `owner/name`; when null caller nodes are not linked. */
  repoFullName: string | null;
  /** Commit the caller lines refer to. */
  sha: string | null;
}

function edgePath(from: GraphNode, to: GraphNode): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function BlastGraph({ downstream, factsByFile, repoFullName, sha }: BlastGraphProps) {
  const t = useTranslations("blast");
  const layout = useMemo(() => buildBlastGraph(downstream, factsByFile), [downstream, factsByFile]);

  if (layout.nodes.length === 0) {
    return <p style={s.empty}>{t("graph.empty")}</p>;
  }

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  const renderNode = (node: GraphNode) => {
    const tooltip =
      node.kind === "caller" && node.file ? `${node.file}:${node.line ?? ""}` : node.label;
    const box = (
      <g data-testid={`graph-node-${node.kind}`}>
        <title>{tooltip}</title>
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx={6}
          {...NODE_STYLE[node.kind]}
        />
        <text x={node.x + node.width / 2} y={node.y + node.height / 2} style={s.label}>
          {truncateLabel(node.label)}
        </text>
      </g>
    );
    if (node.kind === "caller" && node.file && repoFullName && sha) {
      return (
        <a
          key={node.id}
          href={githubBlobUrl(repoFullName, sha, node.file, node.line)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {box}
        </a>
      );
    }
    return <g key={node.id}>{box}</g>;
  };

  const legend = [
    ["symbol", LEGEND_DOT_COLOR.symbol, "graph.legend.symbol"],
    ["callers", LEGEND_DOT_COLOR.callers, "graph.legend.callers"],
    ["endpoints", LEGEND_DOT_COLOR.endpoints, "graph.legend.endpoints"],
    ...(layout.nodes.some((n) => n.kind === "cron")
      ? ([["crons", LEGEND_DOT_COLOR.crons, "graph.legend.crons"]] as const)
      : []),
  ] as const;

  return (
    <div>
      <div style={s.scroll}>
        <svg
          role="img"
          aria-label={t("graph.ariaLabel")}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          style={s.svg}
        >
          {layout.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            return from && to ? <path key={edge.id} d={edgePath(from, to)} style={s.edge} /> : null;
          })}
          {layout.nodes.map(renderNode)}
        </svg>
      </div>
      <div style={s.legend}>
        {legend.map(([key, color, label]) => (
          <span key={key} style={s.legendItem}>
            <span style={legendDot(color)} aria-hidden="true" />
            {t(label)}
          </span>
        ))}
      </div>
    </div>
  );
}
