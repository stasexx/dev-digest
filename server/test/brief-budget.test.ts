import { describe, it, expect } from 'vitest';
import type { BriefSection } from '@devdigest/shared';
import { clip, estimateTokens, fitSections, truncateTail } from '../src/modules/brief/budget.js';
import { assembleBriefPrompt, buildSystemMessage } from '../src/modules/brief/prompt.js';
import { BRIEF_SECTION_ALLOWANCE, TRUNCATION_MARKER } from '../src/modules/brief/constants.js';
import type { BriefFacts } from '../src/modules/brief/types.js';
import { makeBlast, makeFacts, makeFile } from './helpers/brief-facts.js';

const big = (n: number, ch = 'x') => ch.repeat(n);

function assemble(facts: BriefFacts, opts?: Parameters<typeof assembleBriefPrompt>[1]) {
  const r = assembleBriefPrompt(facts, opts);
  if (!r.ok) throw new Error('over budget');
  return r;
}
const userOf = (r: ReturnType<typeof assemble>) => r.messages[1]?.content ?? '';

/** Extract one rendered section by heading (up to the next "\n\n## " or end). */
function section(user: string, heading: string): string {
  const start = user.indexOf(heading);
  if (start < 0) return '';
  const rest = user.slice(start);
  const next = rest.indexOf('\n\n## ', heading.length);
  return next < 0 ? rest : rest.slice(0, next);
}

const HEADINGS: Record<BriefSection, string> = {
  specs: '## Attached specs',
  blast_detail: '## Blast detail',
  linked_issue: '## Linked issue',
  description: '## PR description',
  files: '## Changed files',
};

function expectCaps(r: ReturnType<typeof assemble>) {
  const user = userOf(r);
  for (const [name, heading] of Object.entries(HEADINGS) as [BriefSection, string][]) {
    const text = section(user, heading);
    if (text) expect(estimateTokens(text)).toBeLessThanOrEqual(BRIEF_SECTION_ALLOWANCE[name]);
  }
  const total = Math.ceil((r.messages[0]!.content.length + user.length) / 4);
  expect(total).toBeLessThanOrEqual(8000);
  expect(r.inputTokensEstimate).toBe(total);
}

describe('primitives', () => {
  it('estimateTokens is ceil(chars/4)', () => {
    expect(estimateTokens('abcde')).toBe(2);
  });
  it('truncateTail fits the budget including the marker', () => {
    const t = truncateTail(big(1000), 50);
    expect(t.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(estimateTokens(t)).toBeLessThanOrEqual(50);
    expect(truncateTail('short', 50)).toBe('short');
  });
  it('clip is single-line, bounded and deterministic', () => {
    const c = clip(`a\n${big(50)}`, 10);
    expect(c).toHaveLength(10);
    expect(c.endsWith('…')).toBe(true);
    expect(clip('a  b', 10)).toBe('a b');
  });
});

describe('per-section rules', () => {
  it('description is tail-truncated with the marker', () => {
    const r = assemble(makeFacts({ pr: { ...makeFacts().pr, body: big(50_000) } }));
    expect(section(userOf(r), HEADINGS.description)).toContain(TRUNCATION_MARKER);
    expect(r.truncatedSections).toContain('description');
    expectCaps(r);
  });

  it('specs: doc 2 truncated, doc 3 omitted and recorded', () => {
    const docs = [
      { path: 'docs/one.md', text: big(4000, 'a') },
      { path: 'docs/two.md', text: big(20_000, 'b') },
      { path: 'docs/three.md', text: big(500, 'c') },
    ];
    const r = assemble(makeFacts({ specs: { status: 'present', reason: null, docs, missingPaths: [] } }));
    const user = userOf(r);
    expect(user).toContain(big(4000, 'a'));
    expect(user).toContain('spec:docs/two.md');
    expect(user).not.toContain(big(20_000, 'b'));
    expect(user).not.toContain('docs/three.md');
    expect(r.specs).toEqual({
      read: ['docs/one.md', 'docs/two.md', 'docs/three.md'],
      truncated: ['docs/two.md'],
      omitted: ['docs/three.md'],
    });
    expect(r.truncatedSections).toContain('specs');
    expectCaps(r);
  });

  it('300 files collapse to per-role aggregates', () => {
    const files = Array.from({ length: 300 }, (_, i) =>
      makeFile(`src/mod${String(i).padStart(3, '0')}/file.ts`, {
        role: i % 3 === 0 ? 'core' : i % 3 === 1 ? 'tests' : 'docs',
        changedRanges: [[1, 10], [20, 30]],
      }),
    );
    const r = assemble(makeFacts({ files, pr: { ...makeFacts().pr, filesCount: 300 } }));
    expect(r.filesListed).toBeGreaterThan(0);
    expect(r.filesListed).toBeLessThan(300);
    const text = section(userOf(r), HEADINGS.files);
    expect(text).toMatch(/docs: \+\d+ files \(\+\d+ −\d+\)/);
    expect(text).toMatch(/tests: \+\d+ files/);
    expect(r.truncatedSections).toContain('files');
    expectCaps(r);
  });

  it('files are ordered core, wiring, tests, docs, boilerplate then churn desc then path', () => {
    const files = [
      makeFile('z.md', { role: 'docs' }),
      makeFile('b.ts', { role: 'core', additions: 1, deletions: 0 }),
      makeFile('a.ts', { role: 'core', additions: 1, deletions: 0 }),
      makeFile('big.ts', { role: 'core', additions: 50, deletions: 0 }),
      makeFile('t.test.ts', { role: 'tests' }),
      makeFile('w.ts', { role: 'wiring' }),
      makeFile('lock.json', { role: 'boilerplate' }),
    ];
    const text = section(userOf(assemble(makeFacts({ files }))), HEADINGS.files);
    const order = ['big.ts', 'a.ts [', 'b.ts', 'w.ts', 't.test.ts', 'z.md', 'lock.json'].map((s) => text.indexOf(s));
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it('40 callers give +K more callers', () => {
    const callers = Array.from({ length: 40 }, (_, i) => ({
      name: `c${i}`,
      file: `src/${big(150, 'd')}${i}.ts`,
      line: i + 1,
      rank: 1,
    }));
    const blast = makeBlast({
      downstream: [{ symbol: 'doThing', callers, endpoints_affected: [], crons_affected: [], rank: 1 }],
      impacted_endpoints: [],
    });
    const r = assemble(makeFacts({ blast: { status: 'present', reason: null, data: blast } }));
    expect(section(userOf(r), HEADINGS.blast_detail)).toMatch(/\+\d+ more callers/);
    expect(r.truncatedSections).toContain('blast_detail');
    expectCaps(r);
  });
});

describe('section cap invariant', () => {
  it('500 symbols with 300-char names', () => {
    const changed_symbols = Array.from({ length: 500 }, (_, i) => ({ name: `${big(300, 's')}${i}`, file: 'src/a.ts', kind: 'function' }));
    const r = assemble(makeFacts({ blast: { status: 'present', reason: null, data: makeBlast({ changed_symbols }) } }));
    expect(section(userOf(r), HEADINGS.blast_detail)).toMatch(/\+\d+ more changed symbols/);
    expect(r.truncatedSections).toContain('blast_detail');
    expectCaps(r);
  });

  it('500 endpoints and 500 crons', () => {
    const eps = Array.from({ length: 500 }, (_, i) => `GET /${big(300, 'e')}${i}`);
    const crons = Array.from({ length: 500 }, (_, i) => `cron-${big(300, 'c')}${i}`);
    const blast = makeBlast({
      changed_symbols: [],
      downstream: [{ symbol: 'x', callers: [], endpoints_affected: eps, crons_affected: crons, rank: 1 }],
      impacted_endpoints: eps,
    });
    const r = assemble(makeFacts({ blast: { status: 'present', reason: null, data: blast } }));
    const text = section(userOf(r), HEADINGS.blast_detail);
    expect(text).toMatch(/\+\d+ more endpoints/);
    expect(text).toMatch(/\+\d+ more crons/);
    expect(r.truncatedSections).toContain('blast_detail');
    expectCaps(r);
  });

  it('10,000-char issue title with a 50,000-char body', () => {
    const issue = { number: 9, title: big(10_000, 't'), state: 'open', body: big(50_000, 'b') };
    const r = assemble(makeFacts({ linkedIssue: { status: 'present', reason: null, issue } }));
    const text = section(userOf(r), HEADINGS.linked_issue);
    expect(text).toContain(TRUNCATION_MARKER);
    expect(text).not.toContain(big(400, 't'));
    expect(r.truncatedSections).toContain('linked_issue');
    expectCaps(r);
  });

  it('2,000-char file paths', () => {
    const files = Array.from({ length: 50 }, (_, i) => makeFile(`${big(2000, 'p')}${i}.ts`));
    const r = assemble(makeFacts({ files }));
    expect(r.truncatedSections).toContain('files');
    expectCaps(r);
  });

  it('1,000-char spec path label', () => {
    const docs = [{ path: big(1000, 'q'), text: 'spec text' }];
    const r = assemble(makeFacts({ specs: { status: 'present', reason: null, docs, missingPaths: [] } }));
    expect(userOf(r)).not.toContain(big(300, 'q'));
    expect(r.truncatedSections).toContain('specs');
    expectCaps(r);
  });

  it('everything oversized at once still fits 8,000', () => {
    const docs = Array.from({ length: 3 }, (_, i) => ({ path: `d${i}.md`, text: big(30_000) }));
    const r = assemble(
      makeFacts({
        pr: { ...makeFacts().pr, body: big(40_000) },
        files: Array.from({ length: 300 }, (_, i) => makeFile(`src/f${i}.ts`)),
        linkedIssue: { status: 'present', reason: null, issue: { number: 1, title: 'T', state: 'open', body: big(30_000) } },
        specs: { status: 'present', reason: null, docs, missingPaths: [] },
      }),
    );
    expectCaps(r);
  });

  it('a forced allowance below the overhead drops the section and records it', () => {
    const r = assemble(makeFacts(), { allowances: { files: 5 } });
    expect(userOf(r)).not.toContain(HEADINGS.files);
    expect(r.removedSections).toEqual(['files']);
    expect(r.filesListed).toBe(0);
  });
});

describe('budget enforcement', () => {
  it('removes whole sections in cut order and never touches fixed content', () => {
    const base = makeFacts({
      pr: { ...makeFacts().pr, body: big(3000) },
      linkedIssue: { status: 'present', reason: null, issue: { number: 1, title: 'T', state: 'open', body: big(2000) } },
      specs: { status: 'present', reason: null, docs: [{ path: 'd.md', text: big(8000) }], missingPaths: [] },
    });
    const full = assemble(base);
    expect(full.removedSections).toEqual([]);
    // Tighten the budget just below the full size: only the first cut (specs) happens.
    const r1 = assemble(base, { budgetTokens: full.inputTokensEstimate - 1 });
    expect(r1.removedSections).toEqual(['specs']);
    expect(r1.specs.omitted).toEqual(['d.md']);
    expect(r1.specs.truncated).toEqual([]);
    // Much tighter: several sections go, in order, and fixed text stays.
    const fixedOnly = assemble(makeFacts({ files: [] }), { budgetTokens: 100_000 });
    const tight = assemble(base, { budgetTokens: estimateTokens(buildSystemMessage()) + 400 });
    expect(tight.removedSections.slice(0, 2)).toEqual(['specs', 'blast_detail']);
    expect(tight.removedSections).not.toContain('files');
    const user = userOf(tight);
    expect(user).toContain('Add retry to webhooks');
    expect(user).toContain('Retry webhook delivery');
    expect(fixedOnly.ok).toBe(true);
  });

  it('fixed content alone over budget returns ok:false', () => {
    const r = assembleBriefPrompt(makeFacts({ pr: { ...makeFacts().pr, title: big(40_000) } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('fixed_over_budget');
      expect(r.fixedTokensEstimate).toBeGreaterThan(8000);
    }
  });

  it('fitSections throws when a renderer breaks its allowance', () => {
    expect(() =>
      fitSections({
        system: 's',
        fixed: 'f',
        sections: [{ name: 'files', text: big(1000), allowanceTokens: 10 }],
        budgetTokens: 8000,
      }),
    ).toThrow(/allowance/);
  });

  it('is byte-identical across runs', () => {
    const facts = makeFacts({ pr: { ...makeFacts().pr, body: big(9000) }, files: Array.from({ length: 80 }, (_, i) => makeFile(`f${i}.ts`)) });
    expect(JSON.stringify(assembleBriefPrompt(facts))).toBe(JSON.stringify(assembleBriefPrompt(facts)));
  });
});
