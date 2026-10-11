import { describe, expect, it } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, selectLatestReviewFindings } from './helpers.js';

const FILES = [
  { path: 'pnpm-lock.yaml', additions: 10, deletions: 2 },
  { path: 'README.md', additions: 3, deletions: 0 },
  { path: 'server/src/modules/index.ts', additions: 1, deletions: 1 },
  { path: 'server/test/x.test.ts', additions: 20, deletions: 0 },
  { path: 'server/src/modules/x/service.ts', additions: 40, deletions: 5 },
  { path: 'server/src/modules/x/a.ts', additions: 1, deletions: 0 },
];

describe('buildSmartDiff', () => {
  it('(a) five-role input -> groups in fixed order, every file exactly once', () => {
    const d = buildSmartDiff(FILES, []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const paths = d.groups.flatMap((g) => g.files.map((f) => f.path)).sort();
    expect(paths).toEqual(FILES.map((f) => f.path).sort());
  });

  it('sorts files by path inside a group', () => {
    const core = buildSmartDiff(FILES, []).groups[0]!;
    expect(core.files.map((f) => f.path)).toEqual([
      'server/src/modules/x/a.ts',
      'server/src/modules/x/service.ts',
    ]);
  });

  it('(b) missing roles -> no empty groups', () => {
    const d = buildSmartDiff([FILES[0]!, FILES[4]!], []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'boilerplate']);
  });

  it('(c) finding_lines are deduped and sorted; findings on unknown paths are ignored', () => {
    const d = buildSmartDiff(FILES, [
      { file: 'server/src/modules/x/service.ts', startLine: 30 },
      { file: 'server/src/modules/x/service.ts', startLine: 5 },
      { file: 'server/src/modules/x/service.ts', startLine: 30 },
      { file: 'not/in/pr.ts', startLine: 1 },
    ]);
    const svc = d.groups[0]!.files.find((f) => f.path.endsWith('service.ts'))!;
    expect(svc.finding_lines).toEqual([5, 30]);
    const all = d.groups.flatMap((g) => g.files);
    expect(all.filter((f) => f.finding_lines.length > 0)).toHaveLength(1);
  });

  it('(d) minimal split_suggestion: total_lines = sum(additions+deletions)', () => {
    const d = buildSmartDiff(FILES, []);
    expect(d.split_suggestion).toEqual({
      too_big: false,
      total_lines: FILES.reduce((s, f) => s + f.additions + f.deletions, 0),
      proposed_splits: [],
    });
  });

  it('(e) result passes the SmartDiff contract', () => {
    const d = buildSmartDiff(FILES, [{ file: 'README.md', startLine: 2 }]);
    expect(SmartDiff.safeParse(d).success).toBe(true);
  });

  it('(g) no findings -> groups still produced, all finding_lines empty', () => {
    const d = buildSmartDiff(FILES, []);
    expect(d.groups.length).toBe(5);
    expect(d.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
  });
});

/**
 * (f) Latest-rule scenario names — mirrored VERBATIM by the client
 * `selectLatestFindings` test (T8). Keep names in sync:
 *   - "agent A with two reviews -> only the newest one's findings"
 *   - "agents A and B -> the union"
 *   - "null-agent bucket is kept separately"
 *   - "summary review is excluded"
 *   - "empty input -> []"
 */
describe('selectLatestReviewFindings', () => {
  const at = (s: string) => new Date(s);
  const row = (
    agentId: string | null,
    kind: string,
    createdAt: string,
    findings: string[],
  ) => ({ review: { agentId, kind, createdAt: at(createdAt) }, findings });

  const cases: { name: string; rows: ReturnType<typeof row>[]; expected: string[] }[] = [
    {
      name: "agent A with two reviews -> only the newest one's findings",
      // API order: newest first
      rows: [row('A', 'review', '2026-01-02', ['new']), row('A', 'review', '2026-01-01', ['old'])],
      expected: ['new'],
    },
    {
      name: 'agent A with two reviews -> newest wins regardless of input order',
      rows: [row('A', 'review', '2026-01-01', ['old']), row('A', 'review', '2026-01-02', ['new'])],
      expected: ['new'],
    },
    {
      name: 'agents A and B -> the union',
      rows: [row('A', 'review', '2026-01-02', ['a']), row('B', 'review', '2026-01-01', ['b'])],
      expected: ['a', 'b'],
    },
    {
      name: 'null-agent bucket is kept separately',
      rows: [
        row(null, 'review', '2026-01-02', ['seed']),
        row('A', 'review', '2026-01-01', ['a']),
        row(null, 'review', '2026-01-01', ['seed-old']),
      ],
      expected: ['seed', 'a'],
    },
    {
      name: 'summary review is excluded',
      rows: [row('A', 'summary', '2026-01-03', ['sum']), row('A', 'review', '2026-01-01', ['a'])],
      expected: ['a'],
    },
    {
      name: 'tie on createdAt keeps the first (newest-first API order)',
      rows: [row('A', 'review', '2026-01-01', ['first']), row('A', 'review', '2026-01-01', ['second'])],
      expected: ['first'],
    },
    { name: 'empty input -> []', rows: [], expected: [] },
  ];

  it.each(cases)('$name', ({ rows, expected }) => {
    expect(selectLatestReviewFindings(rows)).toEqual(expected);
  });
});
