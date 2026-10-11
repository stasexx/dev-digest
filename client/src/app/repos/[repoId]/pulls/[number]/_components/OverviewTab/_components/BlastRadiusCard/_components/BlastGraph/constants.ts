/** Geometry of the blast-radius graph (SVG user units; no runtime text measuring). */
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 34;
export const ROW_GAP = 16;
export const COLUMN_GAP = 60;
export const PADDING_Y = 12;
/** Max label characters per node before it is cut with an ellipsis. */
export const LABEL_MAX_CHARS = 24;

export const COLUMN_X = [
  0,
  NODE_WIDTH + COLUMN_GAP,
  2 * (NODE_WIDTH + COLUMN_GAP),
] as const;
export const GRAPH_WIDTH = COLUMN_X[2] + NODE_WIDTH;
