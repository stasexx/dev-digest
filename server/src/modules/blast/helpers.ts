import type {
  BlastRadiusResponse,
  RankedBlastCaller,
  RankedDownstreamImpact,
} from '@devdigest/shared';
import type { BlastResult, IndexState } from '../repo-intel/types.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';

/**
 * Pure mapper: facade `BlastResult` (flat callers) -> `BlastRadiusResponse`
 * (callers grouped per changed symbol). No I/O, no imports from db/container.
 */

type ChangedSymbols = BlastResult['changedSymbols'];
type CallerRow = BlastResult['callers'][number];
type FactsByFile = NonNullable<BlastResult['factsByFile']>;

const uniqSorted = (items: Iterable<string>): string[] => [...new Set(items)].sort();

/** Changed symbols deduped by name+file, facade order kept. */
function dedupeSymbols(symbols: ChangedSymbols): ChangedSymbols {
  const seen = new Set<string>();
  const out: ChangedSymbols = [];
  for (const s of symbols) {
    const key = `${s.name}\u0000${s.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Group flat callers by the changed symbol they reach. Facade order (rank-desc)
 * is kept inside a group. A caller living in the file that declares the changed
 * symbol is dropped (the symbol's own file is not a downstream consumer), and
 * each group is capped at MAX_CALLERS_PER_SYMBOL.
 */
export function groupCallers(
  callers: CallerRow[],
  changedSymbols: ChangedSymbols,
): Map<string, RankedBlastCaller[]> {
  const declFiles = new Map<string, Set<string>>();
  for (const s of changedSymbols) {
    const files = declFiles.get(s.name) ?? new Set<string>();
    files.add(s.file);
    declFiles.set(s.name, files);
  }
  const groups = new Map<string, RankedBlastCaller[]>();
  for (const c of callers) {
    if (declFiles.get(c.viaSymbol)?.has(c.file)) continue;
    const list = groups.get(c.viaSymbol) ?? [];
    if (list.length >= MAX_CALLERS_PER_SYMBOL) continue;
    list.push({ name: c.symbol, file: c.file, line: c.line, rank: c.rank });
    groups.set(c.viaSymbol, list);
  }
  return groups;
}

/** Build downstream entries (endpoints/crons attributed via caller files) and sort them. */
export function rankDownstream(
  groups: Map<string, RankedBlastCaller[]>,
  factsByFile: FactsByFile | undefined,
): RankedDownstreamImpact[] {
  const out: RankedDownstreamImpact[] = [];
  for (const [symbol, callers] of groups) {
    if (callers.length === 0) continue;
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    let rank = 0;
    for (const c of callers) {
      rank += c.rank;
      const facts = factsByFile?.[c.file];
      for (const e of facts?.endpoints ?? []) endpoints.add(e);
      for (const k of facts?.crons ?? []) crons.add(k);
    }
    out.push({
      symbol,
      callers,
      endpoints_affected: uniqSorted(endpoints),
      crons_affected: uniqSorted(crons),
      rank,
    });
  }
  return out.sort(
    (a, b) =>
      b.rank - a.rank || b.callers.length - a.callers.length || a.symbol.localeCompare(b.symbol),
  );
}

/** Deterministic summary line (no model involved). */
export function buildSummary(args: {
  symbols: number;
  withCallers: number;
  callers: number;
  endpoints: number;
  crons: number;
  degraded: boolean;
  indexStatus: string;
  reason: string | null;
}): string {
  const base = `${args.symbols} changed symbol(s), ${args.withCallers} with callers: ${args.callers} caller(s), ${args.endpoints} endpoint(s), ${args.crons} cron(s) affected.`;
  return args.degraded
    ? `${base} Index ${args.indexStatus} (${args.reason ?? 'unknown'}) — map may be incomplete.`
    : base;
}

export function toBlastRadius(
  result: BlastResult,
  ctx: { indexState: IndexState },
): BlastRadiusResponse {
  const { indexState } = ctx;
  const changed_symbols = dedupeSymbols(result.changedSymbols).map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const downstream = rankDownstream(
    groupCallers(result.callers, result.changedSymbols),
    result.factsByFile,
  );

  const partial = indexState.status === 'partial';
  const degraded = result.degraded === true || partial;
  const reason = result.reason ?? (partial ? 'index_partial' : null);

  const impacted_endpoints = uniqSorted(result.impactedEndpoints);
  const endpointSet = new Set<string>(impacted_endpoints);
  const cronSet = new Set<string>();
  const facts_by_file: BlastRadiusResponse['facts_by_file'] = {};
  let callerCount = 0;
  for (const d of downstream) {
    callerCount += d.callers.length;
    for (const e of d.endpoints_affected) endpointSet.add(e);
    for (const k of d.crons_affected) cronSet.add(k);
    for (const c of d.callers) {
      const facts = result.factsByFile?.[c.file];
      if (facts) facts_by_file[c.file] = { endpoints: facts.endpoints, crons: facts.crons };
    }
  }

  const stats = {
    symbols: changed_symbols.length,
    callers: callerCount,
    endpoints: endpointSet.size,
    crons: cronSet.size,
  };

  return {
    changed_symbols,
    downstream,
    summary: buildSummary({
      symbols: stats.symbols,
      withCallers: downstream.length,
      callers: stats.callers,
      endpoints: stats.endpoints,
      crons: stats.crons,
      degraded,
      indexStatus: indexState.status,
      reason,
    }),
    stats,
    impacted_endpoints,
    facts_by_file,
    degraded,
    reason,
    index_status: indexState.status,
    commit_sha: indexState.lastIndexedSha || null,
    limits: { max_callers_per_symbol: MAX_CALLERS_PER_SYMBOL, bfs_depth: BFS_DEPTH },
    truncated: result.callers.length >= MAX_CALLERS_PER_SYMBOL,
  };
}
