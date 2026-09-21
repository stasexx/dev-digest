/** Rough token estimate (~4 chars per token) — for UI hints, not billing. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}
