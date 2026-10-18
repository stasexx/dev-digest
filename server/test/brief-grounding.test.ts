import { describe, it, expect } from 'vitest';
import type { BriefModelOutput } from '@devdigest/shared';
import { buildAllowedSet, groundBriefOutput, normaliseRef } from '../src/modules/brief/grounding.js';
import { makeBlast } from './helpers/brief-facts.js';

const risk = (file_refs: string[], title = 't') => ({
  kind: 'other',
  title,
  explanation: 'e',
  severity: 'low' as const,
  file_refs,
});
const out = (over: Partial<BriefModelOutput>): BriefModelOutput => ({
  summary: 's',
  risks: [],
  review_focus: [],
  ...over,
});
const allowed = new Set(['src/a.ts', 'src/b.ts']);

describe('normaliseRef', () => {
  it('strips line suffixes and leading ./ or /', () => {
    expect(normaliseRef('src/a.ts:12-18')).toEqual({ path: 'src/a.ts', suffix: ':12-18' });
    expect(normaliseRef('./src/a.ts:3')).toEqual({ path: 'src/a.ts', suffix: ':3' });
    expect(normaliseRef('/src/a.ts')).toEqual({ path: 'src/a.ts', suffix: '' });
  });
});

describe('groundBriefOutput - risk refs', () => {
  it('keeps only the real ref when one is fabricated', () => {
    const r = groundBriefOutput(out({ risks: [risk(['src/a.ts:4', 'src/fake.ts'])] }), allowed);
    expect(r.risks).toHaveLength(1);
    expect(r.risks[0]?.file_refs).toEqual(['src/a.ts:4']);
    expect(r.dropped.risk_refs).toBe(1);
  });
  it('drops a risk whose refs are all fabricated', () => {
    const r = groundBriefOutput(out({ risks: [risk(['nope.ts']), risk(['src/b.ts'], 'keep')] }), allowed);
    expect(r.risks.map((x) => x.title)).toEqual(['keep']);
    expect(r.dropped.risks).toBe(1);
  });
  it('normalises ./src/a.ts:3 to src/a.ts', () => {
    const r = groundBriefOutput(out({ risks: [risk(['./src/a.ts:3'])] }), allowed);
    expect(r.risks[0]?.file_refs).toEqual(['src/a.ts:3']);
  });
  it('drops a case-only mismatch', () => {
    const r = groundBriefOutput(out({ risks: [risk(['SRC/a.ts'])] }), allowed);
    expect(r.risks).toHaveLength(0);
  });
});

describe('groundBriefOutput - focus items', () => {
  it('drops focus items outside the allowed set and keeps order', () => {
    const r = groundBriefOutput(
      out({
        review_focus: [
          { file: 'src/b.ts', line: 2, reason: 'x' },
          { file: 'ghost.ts', line: 1, reason: 'y' },
          { file: './src/a.ts', line: 9, reason: 'z' },
        ],
      }),
      allowed,
    );
    expect(r.reviewFocus.map((f) => `${f.file}:${f.line}`)).toEqual(['src/b.ts:2', 'src/a.ts:9']);
    expect(r.dropped.review_focus).toBe(1);
  });
  it('12 items including duplicates give 8 in order with counts recorded', () => {
    const items = [];
    for (let i = 1; i <= 10; i++) items.push({ file: 'src/a.ts', line: i, reason: `r${i}` });
    items.splice(3, 0, { file: 'src/a.ts', line: 1, reason: 'dup' });
    items.splice(6, 0, { file: './src/a.ts', line: 2, reason: 'dup2' });
    expect(items).toHaveLength(12);
    const r = groundBriefOutput(out({ review_focus: items }), allowed);
    expect(r.reviewFocus.map((f) => f.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.reviewFocus[0]?.reason).toBe('r1');
    expect(r.dropped.duplicates).toBe(2);
    expect(r.dropped.over_cap).toEqual({ risks: 0, review_focus: 2 });
  });
  it('caps risks at 8 and records the overflow', () => {
    const risks = Array.from({ length: 10 }, (_, i) => risk(['src/a.ts'], `r${i}`));
    const r = groundBriefOutput(out({ risks }), allowed);
    expect(r.risks).toHaveLength(8);
    expect(r.dropped.over_cap.risks).toBe(2);
  });
});

describe('buildAllowedSet - blast missing', () => {
  const blast = makeBlast();
  it('includes blast symbol and caller files when blast is present', () => {
    const set = buildAllowedSet(['src/a.ts'], blast);
    expect(set.has('src/caller.ts')).toBe(true);
    const r = groundBriefOutput(out({ risks: [risk(['src/caller.ts:10'])] }), set);
    expect(r.risks).toHaveLength(1);
  });
  it('is changed files only when blast is missing', () => {
    const set = buildAllowedSet(['src/a.ts'], null);
    expect([...set]).toEqual(['src/a.ts']);
    const r = groundBriefOutput(out({ risks: [risk(['src/caller.ts:10'])] }), set);
    expect(r.risks).toHaveLength(0);
  });
});
