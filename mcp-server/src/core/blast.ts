/**
 * Blast-radius compaction — application layer, pure (no I/O, no MCP SDK).
 *
 * Projects the full GET /pulls/:id/blast response into the concise shape the
 * tool returns. Computes nothing new: order of symbols and callers is preserved
 * exactly as the server sent it (parity with the UI block).
 */

import type { BlastRadiusResponse } from '@devdigest/shared';

export type CompactBlastSymbol = {
  symbol: string;
  callers: string[];
  endpoints: string[];
  crons: string[];
};

export type CompactBlast = {
  repo: string;
  pr: number;
  summary: string;
  stats: BlastRadiusResponse['stats'];
  index_status: BlastRadiusResponse['index_status'];
  degraded: boolean;
  reason: BlastRadiusResponse['reason'];
  hint?: string;
  symbols: CompactBlastSymbol[];
  without_callers: string[];
  truncated: boolean;
};

export function compactBlast(
  resp: BlastRadiusResponse,
  ctx: { repo: string; pr: number },
): CompactBlast {
  const symbols: CompactBlastSymbol[] = resp.downstream.map((d) => ({
    symbol: d.symbol,
    callers: d.callers.map((c) => `${c.file}:${c.line} (${c.name})`),
    endpoints: [...d.endpoints_affected],
    crons: [...d.crons_affected],
  }));

  const withCallers = new Set(resp.downstream.map((d) => d.symbol));
  const without_callers: string[] = [];
  for (const s of resp.changed_symbols) {
    if (!withCallers.has(s.name) && !without_callers.includes(s.name)) {
      without_callers.push(s.name);
    }
  }

  const out: CompactBlast = {
    repo: ctx.repo,
    pr: ctx.pr,
    summary: resp.summary,
    stats: resp.stats,
    index_status: resp.index_status,
    degraded: resp.degraded,
    reason: resp.reason,
    symbols,
    without_callers,
    truncated: resp.truncated,
  };

  if (resp.degraded) {
    out.hint = `Index is ${resp.index_status} (${resp.reason ?? 'unknown'}): this map may be incomplete. A resync can be started from the Blast radius block in the DevDigest UI.`;
  }
  return out;
}
