import { createHash } from 'node:crypto';
import type { BlastRadiusResponse, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { withTimeout } from '../../platform/resilience.js';
import { parseLinkedIssueNumber } from '../../adapters/github/linked-issue.js';
import type { AgentRow, PullRow } from '../../db/rows.js';
import type * as schema from '../../db/schema.js';
import { buildSmartDiff, selectLatestReviewFindings } from '../smart-diff/helpers.js';
import { toBlastRadius } from '../blast/helpers.js';
import { diffFromPrFileRows } from '../reviews/diff-loader.js';
import { resolveSpecPaths } from '../project-context/injection.js';
import { readDocument } from '../project-context/documents.js';
import type { Logger } from '../reviews/run-executor.js';
import { BRIEF_FALLBACK_ROLE, BRIEF_ISSUE_FETCH_TIMEOUT_MS } from './constants.js';
import type { BriefFacts, BriefFileFact } from './types.js';

/**
 * Fail-soft fact gathering for the PR Brief. No model call, no embeddings:
 * everything here is a stored or index-only read. `pr_files` is read ONCE and
 * every file-derived fact comes from those rows (consistent snapshot).
 */

type PrFileRow = { path: string; additions: number; deletions: number; patch: string | null };
type RepoRow = typeof schema.repos.$inferSelect;

export interface GatherBriefFactsArgs {
  workspaceId: string;
  pull: PullRow;
  repo: RepoRow;
}

/** Fingerprint of the snapshot rows; changes when a path, its stats or its patch changes. */
export function filesFingerprint(rows: readonly PrFileRow[]): string {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const lines = rows
    .map((r) => `${r.path}\0${r.additions}\0${r.deletions}\0${sha(r.patch ?? '')}`)
    .sort();
  return sha(lines.join('\n'));
}

type BlastFact = BriefFacts['blast'];

/** Classify a blast lookup (response or thrown error) into the brief's presence status. */
export function classifyBlast(input: BlastRadiusResponse | Error): BlastFact {
  if (input instanceof Error) return { status: 'missing', reason: 'lookup_failed', data: null };
  if (input.degraded && input.stats.symbols === 0 && input.stats.callers === 0) {
    return { status: 'missing', reason: input.reason ?? 'no_data', data: null };
  }
  if (input.degraded) return { status: 'partial', reason: input.reason ?? 'unknown', data: input };
  return { status: 'present', reason: null, data: input };
}

/**
 * Attached spec paths: deterministic union over enabled agents (createdAt, then id)
 * and their enabled skills, deduped by exact path keeping the first occurrence.
 */
export function orderAttachedSpecPaths(
  agents: Array<{
    agent: Pick<AgentRow, 'id' | 'createdAt' | 'attachedDocPaths'>;
    skills: Array<{ enabled: boolean; attachedDocPaths: string[] }>;
  }>,
): string[] {
  const sorted = [...agents].sort((a, b) => {
    const d = a.agent.createdAt.getTime() - b.agent.createdAt.getTime();
    if (d !== 0) return d;
    return a.agent.id < b.agent.id ? -1 : a.agent.id > b.agent.id ? 1 : 0;
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { agent, skills } of sorted) {
    const paths = resolveSpecPaths({
      agentPaths: agent.attachedDocPaths ?? [],
      loadedSkills: skills.filter((s) => s.enabled).map((s) => ({ paths: s.attachedDocPaths ?? [] })),
    });
    for (const p of paths) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out;
}

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function gatherBriefFacts(
  container: Container,
  logger: Logger,
  args: GatherBriefFactsArgs,
): Promise<BriefFacts> {
  const { workspaceId, pull, repo } = args;
  const repoRef: RepoRef = { owner: repo.owner, name: repo.name };

  // ---- one snapshot of pr_files -------------------------------------------
  const rows = await container.reviewRepo.getPrFiles(pull.id);
  const snapshot = { headSha: pull.headSha, filesFingerprint: filesFingerprint(rows) };

  // ---- files: roles, finding lines, numeric hunk ranges --------------------
  const rangesByPath = new Map<string, Array<[number, number]>>();
  try {
    const diff = diffFromPrFileRows(rows);
    for (const f of diff.files) {
      const ranges: Array<[number, number]> = [];
      for (const h of f.hunks) {
        if (h.newLines > 0) ranges.push([h.newStart, h.newStart + h.newLines - 1]);
      }
      rangesByPath.set(f.path, ranges);
    }
  } catch (err) {
    logger.warn({ prId: pull.id, err: errMessage(err) }, 'brief: hunk range parsing failed');
  }

  const roleByPath = new Map<string, BriefFileFact['role']>();
  const linesByPath = new Map<string, number[]>();
  try {
    const reviews = await container.reviewRepo.reviewsForPull(pull.id);
    const smart = buildSmartDiff(rows, selectLatestReviewFindings(reviews));
    for (const g of smart.groups) {
      for (const f of g.files) {
        roleByPath.set(f.path, g.role);
        linesByPath.set(f.path, f.finding_lines);
      }
    }
  } catch (err) {
    logger.warn({ prId: pull.id, err: errMessage(err) }, 'brief: smart diff roles unavailable');
    roleByPath.clear();
    linesByPath.clear();
  }

  const files: BriefFileFact[] = rows.map((r) => ({
    path: r.path,
    role: roleByPath.get(r.path) ?? BRIEF_FALLBACK_ROLE,
    additions: r.additions,
    deletions: r.deletions,
    changedRanges: rangesByPath.get(r.path) ?? [],
    findingLines: linesByPath.get(r.path) ?? [],
  }));

  // ---- intent: stored only, never computed --------------------------------
  let intent: BriefFacts['intent'] = null;
  try {
    intent = (await container.reviewRepo.getIntent(pull.id)) ?? null;
  } catch (err) {
    logger.warn({ prId: pull.id, err: errMessage(err) }, 'brief: stored intent read failed');
  }

  // ---- blast: index-only lookup on the snapshot paths ----------------------
  let blast: BlastFact;
  try {
    const result = await container.repoIntel.getBlastRadius(
      repo.id,
      rows.map((r) => r.path),
    );
    const indexState = await container.repoIntel.getIndexState(repo.id);
    blast = classifyBlast(toBlastRadius(result, { indexState }));
  } catch (err) {
    logger.warn({ prId: pull.id, err: errMessage(err) }, 'brief: blast lookup failed');
    blast = classifyBlast(err instanceof Error ? err : new Error(String(err)));
  }

  // ---- linked issue: same rule as PR detail --------------------------------
  const linkedIssue = await gatherLinkedIssue(container, logger, repoRef, pull);

  // ---- attached specs ------------------------------------------------------
  const specs = await gatherSpecs(container, logger, workspaceId, repo, repoRef);

  return {
    snapshot,
    pr: {
      id: pull.id,
      title: pull.title,
      body: pull.body ?? null,
      headSha: pull.headSha,
      additions: pull.additions,
      deletions: pull.deletions,
      filesCount: pull.filesCount,
    },
    files,
    intent,
    blast,
    linkedIssue,
    specs,
  };
}

async function gatherLinkedIssue(
  container: Container,
  logger: Logger,
  repoRef: RepoRef,
  pull: PullRow,
): Promise<BriefFacts['linkedIssue']> {
  const n = parseLinkedIssueNumber(pull.body);
  if (n === null) return { status: 'none', reason: null, issue: null };

  let github;
  try {
    github = await container.github();
  } catch (err) {
    logger.warn({ prId: pull.id, err: errMessage(err) }, 'brief: GitHub unavailable for linked issue');
    return { status: 'unavailable', reason: 'github_unavailable', issue: null };
  }
  try {
    const issue = await withTimeout(github.getIssue(repoRef, n), BRIEF_ISSUE_FETCH_TIMEOUT_MS);
    return {
      status: 'present',
      reason: null,
      issue: { number: issue.number, title: issue.title, state: issue.state, body: issue.body ?? null },
    };
  } catch (err) {
    logger.warn({ prId: pull.id, issue: n, err: errMessage(err) }, 'brief: linked issue fetch failed');
    return { status: 'unavailable', reason: 'fetch_failed', issue: null };
  }
}

async function gatherSpecs(
  container: Container,
  logger: Logger,
  workspaceId: string,
  repo: RepoRow,
  repoRef: RepoRef,
): Promise<BriefFacts['specs']> {
  let paths: string[];
  try {
    const agents = await container.agentsRepo.listEnabled(workspaceId);
    const withSkills = await Promise.all(
      agents.map(async (agent) => ({
        agent,
        skills: (await container.agentsRepo.linkedSkills(agent.id)).map((l) => l.skill),
      })),
    );
    paths = orderAttachedSpecPaths(withSkills);
  } catch (err) {
    logger.warn({ err: errMessage(err) }, 'brief: attached spec lookup failed');
    return { status: 'missing', reason: 'none_attached', docs: [], missingPaths: [] };
  }

  if (paths.length === 0) return { status: 'missing', reason: 'none_attached', docs: [], missingPaths: [] };
  if (!repo.clonePath) return { status: 'missing', reason: 'clone_unavailable', docs: [], missingPaths: [] };

  const docs: Array<{ path: string; text: string }> = [];
  const missingPaths: string[] = [];
  for (const p of paths) {
    try {
      const text = await readDocument(container.git, repoRef, p);
      // fs.readFile('utf8') never throws on invalid UTF-8; it yields U+FFFD.
      if (text.includes('�')) {
        missingPaths.push(p);
        continue;
      }
      docs.push({ path: p, text });
    } catch (err) {
      logger.warn({ path: p, err: errMessage(err) }, 'brief: attached spec skipped');
      missingPaths.push(p);
    }
  }
  if (docs.length === 0) return { status: 'missing', reason: 'all_unreadable', docs: [], missingPaths };
  return { status: 'present', reason: null, docs, missingPaths };
}
