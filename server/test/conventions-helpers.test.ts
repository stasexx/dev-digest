/**
 * Conventions Extractor — pure helpers: evidence check, path safety, rule dedup
 * key, config-file picking and the generated skill body.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSkillBody,
  isStyleConfigFile,
  normalizeRule,
  numberLines,
  safeRelativePath,
  verifyEvidence,
  SNIPPET_MAX,
} from '../src/modules/conventions/helpers.js';

const FILE = ['import { z } from "zod";', '', 'export const A = 1;'].join('\n');

describe('verifyEvidence', () => {
  it('accepts a real, non-blank line and takes the snippet from the file', () => {
    expect(verifyEvidence(FILE, 3)).toEqual({ ok: true, line: 3, snippet: 'export const A = 1;' });
  });

  it('rejects lines outside the file, non-integers and blank lines', () => {
    expect(verifyEvidence(FILE, 0)).toEqual({ ok: false, reason: 'line_out_of_range' });
    expect(verifyEvidence(FILE, 4)).toEqual({ ok: false, reason: 'line_out_of_range' });
    expect(verifyEvidence(FILE, 1.5)).toEqual({ ok: false, reason: 'line_out_of_range' });
    expect(verifyEvidence(FILE, 2)).toEqual({ ok: false, reason: 'blank_line' });
  });

  it('caps the stored snippet', () => {
    const r = verifyEvidence('x'.repeat(1000), 1);
    expect(r.ok && r.snippet.length).toBe(SNIPPET_MAX);
  });
});

describe('safeRelativePath', () => {
  it('normalises model-supplied paths', () => {
    expect(safeRelativePath('./src/a.ts')).toBe('src/a.ts');
    expect(safeRelativePath('/src/a.ts')).toBe('src/a.ts');
    expect(safeRelativePath('src\\a.ts')).toBe('src/a.ts');
  });

  it('refuses anything that could escape the clone', () => {
    expect(safeRelativePath('../etc/passwd')).toBeNull();
    expect(safeRelativePath('src/../../secret')).toBeNull();
    expect(safeRelativePath('  ')).toBeNull();
  });
});

describe('normalizeRule', () => {
  it('ignores case, punctuation and spacing so a rescan cannot resurrect a rejected rule', () => {
    expect(normalizeRule('Use `async/await`, never .then() chains.')).toBe(
      normalizeRule('use async/await  never .then   chains'),
    );
  });
});

describe('isStyleConfigFile', () => {
  it('picks eslint / tsconfig / prettier configs by name only', () => {
    for (const f of ['.eslintrc.json', 'eslint.config.mjs', 'tsconfig.json', 'tsconfig.build.json', '.prettierrc', 'prettier.config.js'])
      expect(isStyleConfigFile(f), f).toBe(true);
    for (const f of ['package.json', 'index.ts', 'tsconfig.ts', 'README.md'])
      expect(isStyleConfigFile(f), f).toBe(false);
  });
});

describe('numberLines', () => {
  it('prefixes 1-based line numbers and truncates', () => {
    expect(numberLines('a\nb\nc', 2)).toBe('1| a\n2| b');
  });
});

describe('buildSkillBody', () => {
  it('groups accepted rules by category and cites the evidence location', () => {
    const body = buildSkillBody('acme/api', [
      { category: 'naming', rule: 'Name hooks useThing.', evidence_path: 'src/h.ts', evidence_line: 4 },
      { category: 'async', rule: 'Use async/await.', evidence_path: 'src/a.ts', evidence_line: null },
    ]);
    expect(body).toContain('# Repository conventions — acme/api');
    expect(body.indexOf('## async')).toBeLessThan(body.indexOf('## naming'));
    expect(body).toContain('- Name hooks useThing. _(seen in `src/h.ts:4`)_');
    expect(body).toContain('- Use async/await. _(seen in `src/a.ts`)_');
  });
});
