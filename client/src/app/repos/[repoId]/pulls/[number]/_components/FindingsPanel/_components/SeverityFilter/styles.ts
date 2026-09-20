import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilter. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  counters: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  separator: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  filters: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
} as const;
