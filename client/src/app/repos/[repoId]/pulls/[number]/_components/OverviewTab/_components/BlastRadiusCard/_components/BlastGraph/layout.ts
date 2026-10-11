import type { BlastFileFacts, RankedDownstreamImpact } from "@devdigest/shared";
import {
  COLUMN_X,
  GRAPH_WIDTH,
  LABEL_MAX_CHARS,
  NODE_HEIGHT,
  NODE_WIDTH,
  PADDING_Y,
  ROW_GAP,
} from "./constants";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Full, untruncated label. */
  label: string;
  /** Caller nodes only: where the caller lives (first occurrence). */
  file?: string;
  line?: number;
  column: 0 | 1 | 2;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface BlastGraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/** Cut `label` to `max` characters, ending in an ellipsis when shortened. */
export function truncateLabel(label: string, max: number = LABEL_MAX_CHARS): string {
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * Deterministic 3-column layout: changed symbols -> callers -> endpoints/crons.
 * Callers are de-duplicated by `file#name`, endpoints/crons by value, edges by
 * their endpoints. Each column is vertically centred against the tallest one.
 */
export function buildBlastGraph(
  downstream: readonly RankedDownstreamImpact[],
  factsByFile: Readonly<Record<string, BlastFileFacts>>,
): BlastGraphLayout {
  type Draft = Omit<GraphNode, "x" | "y" | "width" | "height">;
  const columns: [Draft[], Draft[], Draft[]] = [[], [], []];
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];

  const addNode = (node: Draft): void => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    columns[node.column].push(node);
  };
  const addEdge = (from: string, to: string): void => {
    const id = `${from}->${to}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ id, from, to });
  };

  for (const entry of downstream) {
    const symbolId = `sym:${entry.symbol}`;
    addNode({ id: symbolId, kind: "symbol", label: `${entry.symbol}()`, column: 0 });

    for (const caller of entry.callers) {
      const callerId = `${caller.file}#${caller.name}`;
      addNode({
        id: callerId,
        kind: "caller",
        label: caller.name,
        file: caller.file,
        line: caller.line,
        column: 1,
      });
      addEdge(symbolId, callerId);

      const facts = factsByFile[caller.file];
      for (const ep of facts?.endpoints ?? []) {
        const id = `ep:${ep}`;
        addNode({ id, kind: "endpoint", label: ep, column: 2 });
        addEdge(callerId, id);
      }
      for (const cron of facts?.crons ?? []) {
        const id = `cron:${cron}`;
        addNode({ id, kind: "cron", label: cron, column: 2 });
        addEdge(callerId, id);
      }
    }
  }

  const rowHeight = NODE_HEIGHT + ROW_GAP;
  const tallest = Math.max(0, ...columns.map((c) => c.length));
  const innerHeight = tallest === 0 ? 0 : tallest * rowHeight - ROW_GAP;

  const nodes: GraphNode[] = columns.flatMap((col) => {
    const colHeight = col.length === 0 ? 0 : col.length * rowHeight - ROW_GAP;
    const offset = PADDING_Y + (innerHeight - colHeight) / 2;
    return col.map((node, i) => ({
      ...node,
      x: COLUMN_X[node.column],
      y: offset + i * rowHeight,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }));
  });

  return {
    nodes,
    edges,
    width: GRAPH_WIDTH,
    height: tallest === 0 ? 0 : innerHeight + 2 * PADDING_Y,
  };
}
