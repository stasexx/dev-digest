import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classifier.js';
import { ROLE_ORDER } from './constants.js';

export interface ReviewRowLike<F> {
  review: { agentId: string | null; kind: string; createdAt: Date };
  findings: F[];
}

/**
 * "Findings of the latest review": the newest `kind:'review'` review per agent
 * (reviews without an agent form one bucket), unioned. `kind:'summary'` reviews
 * are ignored. Ties on `createdAt` keep the first row (the API returns newest first).
 * Mirrored on the client by `selectLatestFindings`.
 */
export function selectLatestReviewFindings<F>(rows: ReviewRowLike<F>[]): F[] {
  const newest = new Map<string | null, ReviewRowLike<F>>();
  for (const row of rows) {
    if (row.review.kind !== 'review') continue;
    const prev = newest.get(row.review.agentId);
    if (!prev || row.review.createdAt.getTime() > prev.review.createdAt.getTime()) {
      newest.set(row.review.agentId, row);
    }
  }
  return [...newest.values()].flatMap((r) => r.findings);
}

/**
 * Group PR files by role in fixed `ROLE_ORDER`, skipping empty roles. Files are
 * sorted by path inside a group; `finding_lines` are the sorted unique
 * `start_line`s of findings on that file.
 */
export function buildSmartDiff(
  files: { path: string; additions: number; deletions: number }[],
  findings: { file: string; startLine: number }[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    linesByFile.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;
  for (const f of files) {
    totalLines += f.additions + f.deletions;
    const role = classifyFile(f.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: [...(linesByFile.get(f.path) ?? [])].sort((a, b) => a - b),
    });
    byRole.set(role, list);
  }

  const groups = ROLE_ORDER.flatMap((role) => {
    const list = byRole.get(role);
    if (!list || list.length === 0) return [];
    return [{ role, files: list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) }];
  });

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
