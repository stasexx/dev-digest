/** Views the card can render; order = toggle order. */
export const VIEW_MODES = ["tree", "graph"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
