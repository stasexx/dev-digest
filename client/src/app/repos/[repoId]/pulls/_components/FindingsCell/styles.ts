import type { CSSProperties } from "react";

const POPOVER_MAX_HEIGHT = 420;

// No gap between cell and popover, so moving the pointer into it never crosses dead space.
const popoverBase: CSSProperties = {
  position: "fixed",
  zIndex: 40,
  width: 380,
  maxHeight: POPOVER_MAX_HEIGHT,
  overflowY: "auto",
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  boxShadow: "0 12px 32px rgba(0,0,0,.35)",
  cursor: "default",
  textAlign: "left",
};

/** Co-located styles for FindingsCell + its hover popover. */
export const s = {
  cell: { position: "relative", display: "inline-flex", alignItems: "center", gap: 4, outline: "none" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  /** Fixed to the viewport under the cell; flips above it when there is no room below. */
  popover: (anchor: DOMRect): CSSProperties => {
    const below = window.innerHeight - anchor.bottom;
    const flip = below < POPOVER_MAX_HEIGHT + 16 && anchor.top > below;
    return {
      ...popoverBase,
      right: Math.max(8, window.innerWidth - anchor.right),
      ...(flip ? { bottom: window.innerHeight - anchor.top } : { top: anchor.bottom }),
    };
  },
  heading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 4, paddingBottom: 10, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  itemLast: { borderBottom: "none", paddingBottom: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.35 } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  rationale: { fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 } satisfies CSSProperties,
  more: { marginTop: 10, fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
