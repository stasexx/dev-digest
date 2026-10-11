import type { CSSProperties } from "react";

export const s = {
  scroll: {
    overflowX: "auto",
    width: "100%",
  } satisfies CSSProperties,
  svg: {
    display: "block",
    minWidth: 640,
    maxWidth: "100%",
    height: "auto",
  } satisfies CSSProperties,
  edge: {
    fill: "none",
    stroke: "var(--border-strong)",
    strokeWidth: 1.5,
  } satisfies CSSProperties,
  label: {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: 13,
    fill: "var(--text-primary)",
    dominantBaseline: "central",
    textAnchor: "middle",
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 18,
    marginTop: 14,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

export const NODE_STYLE = {
  symbol: { stroke: "var(--accent)", fill: "var(--bg-elevated)", strokeWidth: 1.5 },
  caller: { stroke: "var(--border-strong)", fill: "var(--bg-elevated)", strokeWidth: 1.5 },
  endpoint: { stroke: "var(--accent)", fill: "var(--bg-elevated)", strokeWidth: 1.5 },
  cron: { stroke: "var(--warn)", fill: "var(--bg-elevated)", strokeWidth: 1.5 },
} as const;

export const LEGEND_DOT_COLOR = {
  symbol: "var(--accent)",
  callers: "var(--border-strong)",
  endpoints: "var(--accent)",
  crons: "var(--warn)",
} as const;

export function legendDot(color: string): CSSProperties {
  return {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: color,
    display: "inline-block",
  };
}
