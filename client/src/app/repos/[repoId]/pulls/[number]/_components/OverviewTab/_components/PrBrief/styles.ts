import type { CSSProperties } from "react";

const card = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-elevated)",
  padding: 18,
} satisfies CSSProperties;

const resetBtn = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
} satisfies CSSProperties;

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  card,
  resetBtn,
  summaryText: { margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)", whiteSpace: "pre-wrap" } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    marginTop: 12,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metaSpacer: { marginLeft: "auto" } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(560px, 1fr))", gap: 20, alignItems: "start" } satisfies CSSProperties,
  col: { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 } satisfies CSSProperties,
  empty: { ...card, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  emptyTitle: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  emptyHint: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  skeleton: { ...card, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  muted: { margin: 0, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  riskRow: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)" } satisfies CSSProperties,
  riskHead: { display: "flex", alignItems: "stretch" } satisfies CSSProperties,
  riskMain: { ...resetBtn, flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px" } satisfies CSSProperties,
  riskTitle: { fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  riskRef: { display: "block", fontSize: 12, color: "var(--accent-text, var(--accent))", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  riskToggle: { ...resetBtn, padding: "0 10px", borderLeft: "1px solid var(--border)", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" } satisfies CSSProperties,
  riskBody: { margin: 0, padding: "0 12px 12px 40px", fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)", whiteSpace: "pre-wrap" } satisfies CSSProperties,
  sevChip: (c: string, bg: string) =>
    ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 6px", borderRadius: 4, fontSize: 11, color: c, background: bg, marginLeft: 8 }) satisfies CSSProperties,
  focusBtn: { ...resetBtn, display: "block", width: "100%", padding: "6px 4px", fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  focusRef: { color: "var(--accent-text, var(--accent))", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  notice: (c: string, bg: string) =>
    ({ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${c}`, background: bg, fontSize: 13, color: "var(--text-primary)" }) satisfies CSSProperties,
  noticeList: { margin: "4px 0 0", paddingLeft: 18, fontSize: 13 } satisfies CSSProperties,
  inlineNote: { marginLeft: 8, fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
} as const;
