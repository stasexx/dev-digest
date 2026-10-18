import type { BlastRadiusResponse } from '@devdigest/shared';
import type { BriefFacts, BriefFileFact } from '../../src/modules/brief/types.js';

export function makeBlast(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [{ name: 'doThing', file: 'src/a.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'doThing',
        callers: [{ name: 'caller', file: 'src/caller.ts', line: 10, rank: 1 }],
        endpoints_affected: ['GET /things'],
        crons_affected: [],
        rank: 1,
      },
    ],
    summary: 'doThing is used by one caller.',
    stats: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
    impacted_endpoints: ['GET /things'],
    facts_by_file: {},
    degraded: false,
    reason: null,
    index_status: 'full',
    commit_sha: 'abc',
    limits: { max_callers_per_symbol: 20, bfs_depth: 1 },
    truncated: false,
    ...over,
  };
}

export function makeFile(path: string, over: Partial<BriefFileFact> = {}): BriefFileFact {
  return { path, role: 'core', additions: 5, deletions: 1, changedRanges: [[10, 24]], findingLines: [], ...over };
}

export function makeFacts(over: Partial<BriefFacts> = {}): BriefFacts {
  return {
    snapshot: { headSha: 'sha1', filesFingerprint: 'fp' },
    pr: { id: 'pr-1', title: 'Add retry to webhooks', body: 'Adds retry.', headSha: 'sha1', additions: 5, deletions: 1, filesCount: 1 },
    files: [makeFile('src/a.ts')],
    intent: { intent: 'Retry webhook delivery', in_scope: ['webhook'], out_of_scope: ['queue'] },
    blast: { status: 'present', reason: null, data: makeBlast() },
    linkedIssue: { status: 'none', reason: null, issue: null },
    specs: { status: 'missing', reason: 'none_attached', docs: [], missingPaths: [] },
    ...over,
  };
}
