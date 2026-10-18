import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import { BlastService } from '../src/modules/blast/service.js';
import type { BlastRepository } from '../src/modules/blast/repository.js';
import { diffFromPrFileRows, diffFromPrFiles } from '../src/modules/reviews/diff-loader.js';
import {
  classifyBlast,
  filesFingerprint,
  gatherBriefFacts,
  orderAttachedSpecPaths,
} from '../src/modules/brief/inputs.js';
import type { BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

const PATCH = (marker: string) =>
  `@@ -1,3 +1,4 @@ function ${marker}HEADERCTX() {\n a\n+${marker}BODY\n b\n c\n@@ -20,2 +30,3 @@\n x\n+y\n z`;

const ROWS = [
  { path: 'src/service.ts', additions: 5, deletions: 1, patch: PATCH('SENTINEL') },
  { path: 'src/service.test.ts', additions: 2, deletions: 0, patch: null as string | null },
  { path: 'README.md', additions: 1, deletions: 1, patch: PATCH('DOC') },
];

const STATE: IndexState = {
  repoId: 'repo1',
  status: 'full',
  filesIndexed: 1,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'sha1',
  indexerVersion: 2,
  updatedAt: new Date(0),
};
const BLAST: BlastResult = {
  changedSymbols: [{ name: 'doThing', file: 'src/service.ts', kind: 'function' }],
  callers: [{ file: 'src/routes.ts', symbol: 'route', viaSymbol: 'doThing', line: 9, rank: 1 }],
  impactedEndpoints: ['GET /x'],
  factsByFile: { 'src/routes.ts': { endpoints: ['GET /x'], crons: [] } },
};

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });
const d = (n: number) => new Date(n * 1000);

const pull = (over: Record<string, unknown> = {}) =>
  ({
    id: 'pr1',
    number: 6,
    repoId: 'repo1',
    title: 'T',
    body: null,
    headSha: 'abc',
    additions: 8,
    deletions: 2,
    filesCount: 3,
    ...over,
  }) as never;
const repoRow = (clonePath: string | null = null) =>
  ({ id: 'repo1', owner: 'o', name: 'n', fullName: 'o/n', clonePath }) as never;

interface Opts {
  rows?: typeof ROWS;
  intent?: unknown;
  reviews?: unknown[];
  blast?: () => Promise<BlastResult>;
  state?: IndexState;
  github?: () => Promise<unknown>;
  agents?: unknown[];
  skillsByAgent?: Record<string, unknown[]>;
  cloneRoot?: string;
  smartThrows?: boolean;
}

function fakeContainer(o: Opts = {}) {
  const getPrFiles = vi.fn(async () => o.rows ?? ROWS);
  const reviewRepo = {
    getPrFiles,
    getIntent: vi.fn(async () => o.intent),
    reviewsForPull: vi.fn(async () => {
      if (o.smartThrows) throw new Error('boom');
      return o.reviews ?? [];
    }),
  };
  const repoIntel = {
    getBlastRadius: vi.fn(o.blast ?? (async () => BLAST)),
    getIndexState: vi.fn(async () => o.state ?? STATE),
  };
  const getIssue = vi.fn(async (_r: unknown, n: number) => ({ number: n, title: `Issue ${n}`, body: 'b', state: 'open' }));
  const container = {
    reviewRepo,
    repoIntel,
    github: o.github ?? (async () => ({ getIssue })),
    agentsRepo: {
      listEnabled: vi.fn(async () => o.agents ?? []),
      linkedSkills: vi.fn(async (id: string) => (o.skillsByAgent?.[id] ?? []).map((skill) => ({ skill, order: 0 }))),
    },
    git: { clonePathFor: () => o.cloneRoot ?? '/nonexistent' },
  };
  return { container: container as never, reviewRepo, repoIntel, getIssue, getPrFiles };
}

const agent = (id: string, created: number, paths: string[]) => ({
  id,
  createdAt: d(created),
  attachedDocPaths: paths,
});
const skill = (paths: string[], enabled = true) => ({ enabled, attachedDocPaths: paths });

const tmpDirs: string[] = [];
async function mkClone(files: Record<string, string | Buffer>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brief-clone-'));
  tmpDirs.push(dir);
  for (const [p, c] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, p)), { recursive: true });
    await fs.writeFile(path.join(dir, p), c);
  }
  return dir;
}
afterEach(async () => {
  while (tmpDirs.length) await fs.rm(tmpDirs.pop()!, { recursive: true, force: true });
});

const run = (c: ReturnType<typeof fakeContainer>, p = pull(), r = repoRow()) =>
  gatherBriefFacts(c.container, logger(), { workspaceId: 'ws', pull: p, repo: r });

describe('gatherBriefFacts: files and snapshot', () => {
  it('reads pr_files exactly once and builds numeric hunk ranges', async () => {
    const c = fakeContainer();
    const facts = await run(c);
    expect(c.getPrFiles).toHaveBeenCalledTimes(1);
    const svc = facts.files.find((f) => f.path === 'src/service.ts')!;
    expect(svc.changedRanges).toEqual([[1, 4], [30, 32]]);
    expect(facts.files.find((f) => f.path === 'src/service.test.ts')!.changedRanges).toEqual([]);
    expect(facts.snapshot).toEqual({ headSha: 'abc', filesFingerprint: filesFingerprint(ROWS) });
  });

  it('never leaks hunk bodies or hunk-header context', async () => {
    const facts = await run(fakeContainer());
    const json = JSON.stringify(facts);
    expect(json).not.toContain('SENTINEL');
    expect(json).not.toContain('HEADERCTX');
    expect(json).not.toContain('DOCBODY');
  });

  it('filesFingerprint changes when additions or patch change', () => {
    const base = filesFingerprint(ROWS);
    expect(filesFingerprint(ROWS.map((r, i) => (i === 0 ? { ...r, additions: 6 } : r)))).not.toBe(base);
    expect(filesFingerprint(ROWS.map((r, i) => (i === 0 ? { ...r, patch: 'x' } : r)))).not.toBe(base);
    expect(filesFingerprint([...ROWS].reverse())).toBe(base);
  });

  it('falls back to role core and no finding lines when Smart Diff throws', async () => {
    const facts = await run(fakeContainer({ smartThrows: true }));
    expect(facts.files.every((f) => f.role === 'core' && f.findingLines.length === 0)).toBe(true);
  });

  it('matches SmartDiffService.forPull roles and finding lines (snapshot parity)', async () => {
    const reviews = [
      {
        review: { agentId: 'a', kind: 'review', createdAt: d(5) },
        findings: [{ file: 'src/service.ts', startLine: 12 }, { file: 'src/service.ts', startLine: 3 }],
      },
    ];
    const c = fakeContainer({ reviews });
    const facts = await run(c);
    const smart = await new SmartDiffService({
      reviewRepo: { getPull: async () => ({ id: 'pr1' }), getPrFiles: async () => ROWS, reviewsForPull: async () => reviews },
    } as never).forPull('ws', 'pr1');
    const expected = new Map(smart.groups.flatMap((g) => g.files.map((f) => [f.path, { role: g.role, lines: f.finding_lines }])));
    for (const f of facts.files) {
      expect({ role: f.role, lines: f.findingLines }).toEqual({
        role: expected.get(f.path)!.role,
        lines: expected.get(f.path)!.lines,
      });
    }
    expect(facts.files.find((f) => f.path === 'src/service.ts')!.findingLines).toEqual([3, 12]);
  });
});

describe('diffFromPrFileRows', () => {
  it('equals diffFromPrFiles for the same rows', async () => {
    const repo = { getPrFiles: async () => ROWS } as never;
    expect(diffFromPrFileRows(ROWS)).toEqual(await diffFromPrFiles(repo, 'pr1'));
  });
});

describe('gatherBriefFacts: intent', () => {
  it('missing intent -> null (never computed)', async () => {
    const c = fakeContainer({ intent: undefined });
    expect((await run(c)).intent).toBeNull();
  });
  it('stored intent is returned as is', async () => {
    const intent = { intent: 'x', in_scope: [], out_of_scope: [] };
    expect((await run(fakeContainer({ intent }))).intent).toEqual(intent);
  });
});

describe('gatherBriefFacts: blast', () => {
  it('full -> present and equals BlastService output', async () => {
    const c = fakeContainer();
    const facts = await run(c);
    expect(facts.blast.status).toBe('present');
    expect(c.repoIntel.getBlastRadius).toHaveBeenCalledWith('repo1', ROWS.map((r) => r.path));
    const svc = new BlastService(
      { repoIntel: { getBlastRadius: async () => BLAST, getIndexState: async () => STATE } } as never,
      undefined,
      {
        getPullWithRepo: async () => ({ pull: {}, repo: { id: 'repo1' } }),
        listChangedFiles: async () => ROWS.map((r) => r.path),
      } as unknown as BlastRepository,
    );
    expect(facts.blast.data).toEqual(await svc.getBlastRadius('ws', 'pr1'));
  });

  it('lookup error -> missing lookup_failed', async () => {
    const facts = await run(fakeContainer({ blast: async () => { throw new Error('x'); } }));
    expect(facts.blast).toEqual({ status: 'missing', reason: 'lookup_failed', data: null });
  });

  it('empty degraded -> missing with its reason', async () => {
    const facts = await run(
      fakeContainer({ blast: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'flag_off' }) }),
    );
    expect(facts.blast.status).toBe('missing');
    expect(facts.blast.reason).toBe('flag_off');
    expect(facts.blast.data).toBeNull();
  });

  it('degraded with data -> partial', async () => {
    const facts = await run(fakeContainer({ blast: async () => ({ ...BLAST, degraded: true, reason: 'index_partial' }) }));
    expect(facts.blast.status).toBe('partial');
    expect(facts.blast.reason).toBe('index_partial');
    expect(facts.blast.data).not.toBeNull();
  });

  it('classifyBlast: empty degraded without reason -> no_data', () => {
    const r = { degraded: true, reason: null, stats: { symbols: 0, callers: 0 } } as unknown as BlastRadiusResponse;
    expect(classifyBlast(r).reason).toBe('no_data');
  });
});

describe('gatherBriefFacts: linked issue', () => {
  it('no reference -> none, getIssue never called', async () => {
    const c = fakeContainer();
    const facts = await run(c, pull({ body: 'nothing here' }));
    expect(facts.linkedIssue.status).toBe('none');
    expect(c.getIssue).toHaveBeenCalledTimes(0);
  });
  it('fetched -> present', async () => {
    const c = fakeContainer();
    const facts = await run(c, pull({ body: 'Fixes #42' }));
    expect(facts.linkedIssue).toMatchObject({ status: 'present', issue: { number: 42, title: 'Issue 42', state: 'open' } });
  });
  it('fetch failure -> unavailable fetch_failed', async () => {
    const github = async () => new MockGitHubClient();
    const gh = await github();
    gh.getIssue = async () => { throw new Error('404'); };
    const facts = await run(fakeContainer({ github: async () => gh }), pull({ body: '#5' }));
    expect(facts.linkedIssue).toMatchObject({ status: 'unavailable', reason: 'fetch_failed', issue: null });
  });
  it('no token -> unavailable github_unavailable', async () => {
    const facts = await run(fakeContainer({ github: async () => { throw new Error('no token'); } }), pull({ body: '#5' }));
    expect(facts.linkedIssue).toMatchObject({ status: 'unavailable', reason: 'github_unavailable' });
  });
});

describe('orderAttachedSpecPaths', () => {
  it('orders by createdAt then id, dedupes, honours disabled skills', () => {
    const out = orderAttachedSpecPaths([
      { agent: agent('b', 20, ['b.md', 'shared.md']), skills: [skill(['s1.md', 'shared.md']), skill(['off.md'], false)] },
      { agent: agent('z', 10, ['z.md']), skills: [] },
      { agent: agent('a', 20, ['a.md']), skills: [skill(['b.md'])] },
    ]);
    expect(out).toEqual(['z.md', 'a.md', 'b.md', 'shared.md', 's1.md']);
  });
});

describe('gatherBriefFacts: specs', () => {
  it('reads union in order and records stale, traversal and non-UTF-8 paths', async () => {
    const root = await mkClone({
      'docs/a.md': 'AAA',
      'docs/b.md': 'BBB',
      'docs/bin.md': Buffer.from([0xff, 0xfe, 0x41]),
    });
    const c = fakeContainer({
      cloneRoot: root,
      agents: [agent('a1', 1, ['docs/a.md', 'docs/gone.md', '../outside.md']), agent('a2', 2, ['docs/b.md', 'docs/bin.md'])],
      skillsByAgent: { a1: [skill(['docs/a.md'])], a2: [skill(['docs/off.md'], false)] },
    });
    const facts = await run(c, pull(), repoRow(root));
    expect(facts.specs.status).toBe('present');
    expect(facts.specs.docs.map((x) => x.path)).toEqual(['docs/a.md', 'docs/b.md']);
    expect(facts.specs.missingPaths).toEqual(['docs/gone.md', '../outside.md', 'docs/bin.md']);
  });

  it('no attached docs -> none_attached', async () => {
    const facts = await run(fakeContainer({ agents: [agent('a', 1, [])] }), pull(), repoRow('/x'));
    expect(facts.specs).toMatchObject({ status: 'missing', reason: 'none_attached' });
  });

  it('clone absent -> clone_unavailable and nothing read', async () => {
    const c = fakeContainer({ agents: [agent('a', 1, ['docs/a.md'])] });
    const facts = await run(c, pull(), repoRow(null));
    expect(facts.specs).toMatchObject({ status: 'missing', reason: 'clone_unavailable', docs: [], missingPaths: [] });
  });

  it('all unreadable -> all_unreadable', async () => {
    const root = await mkClone({});
    const c = fakeContainer({ cloneRoot: root, agents: [agent('a', 1, ['nope.md'])] });
    const facts = await run(c, pull(), repoRow(root));
    expect(facts.specs).toMatchObject({ status: 'missing', reason: 'all_unreadable', missingPaths: ['nope.md'] });
  });
});
