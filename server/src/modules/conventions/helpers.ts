import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';

/**
 * Conventions — pure helpers (no DB, no fs, no LLM) so they unit-test cleanly.
 */

/** Longest evidence snippet stored / shown per candidate. */
export const SNIPPET_MAX = 240;

/** Row → wire DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    accepted: row.status === 'accepted',
    category: row.category,
    evidence_line: row.evidenceLine,
    status: row.status,
  };
}

/** Dedup key for a rule: case/punctuation/whitespace-insensitive. */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[`'".,;:!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Model-supplied path → clone-relative posix path, or null when it escapes the clone. */
export function safeRelativePath(file: string): string | null {
  const cleaned = file.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('\0')) return null;
  if (cleaned.split('/').some((seg) => seg === '..')) return null;
  return cleaned;
}

export type EvidenceCheck =
  | { ok: true; line: number; snippet: string }
  | { ok: false; reason: 'line_out_of_range' | 'blank_line' };

/**
 * Code-level evidence check: the cited 1-based line must exist in the file and
 * carry code. The snippet is taken from the FILE, never from the model, so what
 * the user sees is what is really in the repo.
 */
export function verifyEvidence(content: string, line: number): EvidenceCheck {
  const lines = content.split('\n');
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    return { ok: false, reason: 'line_out_of_range' };
  }
  const text = (lines[line - 1] ?? '').trim();
  if (!text) return { ok: false, reason: 'blank_line' };
  return { ok: true, line, snippet: text.slice(0, SNIPPET_MAX) };
}

/** Prefix every line with its 1-based number so the model can cite real lines. */
export function numberLines(content: string, maxLines: number): string {
  const lines = content.split('\n').slice(0, maxLines);
  const width = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(width, ' ')}| ${l}`).join('\n');
}

/** Root config files that encode code style — picked by name, no model involved. */
export function isStyleConfigFile(name: string): boolean {
  return (
    /^\.eslintrc(\.(js|cjs|mjs|json|ya?ml))?$/.test(name) ||
    /^eslint\.config\.(js|cjs|mjs|ts)$/.test(name) ||
    /^tsconfig(\.[\w-]+)?\.json$/.test(name) ||
    /^\.prettierrc(\.(js|cjs|mjs|json|ya?ml|toml))?$/.test(name) ||
    /^prettier\.config\.(js|cjs|mjs|ts)$/.test(name) ||
    name === '.editorconfig' ||
    name === 'biome.json'
  );
}

/** Markdown body of the skill built from accepted candidates, grouped by category. */
export function buildSkillBody(
  repoFullName: string,
  accepted: Pick<ConventionCandidate, 'category' | 'rule' | 'evidence_path' | 'evidence_line'>[],
): string {
  const byCategory = new Map<string, typeof accepted>();
  for (const c of accepted) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  const out: string[] = [
    `# Repository conventions — ${repoFullName}`,
    '',
    'House rules extracted from this codebase and approved by a maintainer. When reviewing a diff, flag code that breaks a rule below and cite the rule. Do not flag code that merely differs in taste from rules not listed here.',
  ];
  for (const [category, items] of [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out.push('', `## ${category}`);
    for (const c of items) {
      const where = c.evidence_path
        ? ` _(seen in \`${c.evidence_path}${c.evidence_line ? `:${c.evidence_line}` : ''}\`)_`
        : '';
      out.push(`- ${c.rule}${where}`);
    }
  }
  return out.join('\n') + '\n';
}
