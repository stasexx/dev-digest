import type { GitCommit, PrHistoryItem } from '@devdigest/shared';
import { MERGE_PR_SUBJECT, SQUASH_PR_SUBJECT } from './constants.js';

/**
 * Pure helpers for the "prior PRs touching these files" list. Commit subjects
 * are untrusted text: they are only matched against fixed regexes and copied
 * into strings - never evaluated or passed to a shell.
 */

export interface ParsedPr {
  number: number;
  kind: 'merge' | 'squash';
  title?: string;
  headOwner?: string;
  headRef?: string;
}

export interface PrCandidate {
  commit: GitCommit;
  parsed: ParsedPr;
}

/** Extract a PR number (and hints) from a merge/squash commit subject. */
export function parsePrSubject(subject: string): ParsedPr | null {
  const line = subject.split('\n', 1)[0] ?? '';

  const merge = MERGE_PR_SUBJECT.exec(line);
  if (merge) {
    const number = Number(merge[1] ?? '');
    if (!Number.isSafeInteger(number) || number <= 0) return null;
    return {
      number,
      kind: 'merge',
      ...(merge[2] ? { headOwner: merge[2] } : {}),
      ...(merge[3] ? { headRef: merge[3] } : {}),
    };
  }

  const squash = SQUASH_PR_SUBJECT.exec(line);
  if (squash) {
    const number = Number(squash[2] ?? '');
    if (!Number.isSafeInteger(number) || number <= 0) return null;
    return { number, kind: 'squash', ...(squash[1] ? { title: squash[1] } : {}) };
  }

  return null;
}

/** PR-numbered commits (input order = newest first), excluding the current PR. */
export function selectCandidates(
  commits: GitCommit[],
  opts: { excludeNumber: number; max: number },
): PrCandidate[] {
  const out: PrCandidate[] = [];
  for (const commit of commits) {
    if (out.length >= opts.max) break;
    const parsed = parsePrSubject(commit.message);
    if (!parsed || parsed.number === opts.excludeNumber) continue;
    out.push({ commit, parsed });
  }
  return out;
}

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Turn candidates + their changed files into overlap items (newest first, deduped by number). */
export function buildPriorPrs(input: {
  candidates: Array<PrCandidate & { files: string[] }>;
  changedFiles: string[];
  localPulls: Map<number, { title: string; author: string }>;
  limit: number;
}): PrHistoryItem[] {
  const changed = new Set(input.changedFiles);
  const byNumber = new Map<number, PrHistoryItem>();

  for (const { commit, parsed, files } of input.candidates) {
    if (byNumber.has(parsed.number)) continue;
    const overlap = [...new Set(files.filter((f) => changed.has(f)))].sort();
    if (overlap.length === 0) continue;

    const local = input.localPulls.get(parsed.number);
    const fallbackTitle =
      parsed.title ??
      (parsed.headOwner && parsed.headRef ? `${parsed.headOwner}/${parsed.headRef}` : `PR #${parsed.number}`);

    byNumber.set(parsed.number, {
      pr_number: parsed.number,
      title: local?.title ?? fallbackTitle,
      merged_at: commit.date,
      author: local?.author ?? parsed.headOwner ?? commit.author,
      files_overlap: overlap,
      notes: `${parsed.kind} commit ${commit.sha.slice(0, 7)}`,
    });
  }

  return [...byNumber.values()]
    .sort((a, b) => time(b.merged_at) - time(a.merged_at))
    .slice(0, input.limit);
}
