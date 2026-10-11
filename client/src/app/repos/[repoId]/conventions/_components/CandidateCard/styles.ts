import type { CSSProperties } from "react";

/** Co-located styles for CandidateCard. */
export const s = {
  card: (accepted: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 16,
    borderRadius: 10,
    border: "1px solid " + (accepted ? "var(--ok)" : "var(--border)"),
    background: "var(--bg-elevated)",
  }),
  head: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  rule: { flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 } satisfies CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  evidenceLink: { fontSize: 12, color: "var(--accent-text)", textDecoration: "none", wordBreak: "break-all" } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-secondary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  editForm: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
