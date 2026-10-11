/**
 * service.ts - BlastService: application layer for the blast-radius and
 * prior-PRs routes.
 *
 * Blast path is index-read only: one facade call, one index-state read, a pure
 * mapping. No model call, no parsing, no index rebuild.
 * Prior PRs come from the local clone's git history (works without a GitHub token).
 */
import type { GitCommit, PriorPrsResponse, BlastRadiusResponse, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { Logger } from '../reviews/run-executor.js';
import { BlastRepository, type BlastPullContext } from './repository.js';
import { toBlastRadius } from './helpers.js';
import { buildPriorPrs, selectCandidates, type PrCandidate } from './prior-prs.js';
import { MAX_HISTORY_COMMITS, MAX_PRIOR_PR_CANDIDATES, MAX_PRIOR_PRS } from './constants.js';

export class BlastService {
  constructor(
    private container: Container,
    private logger?: Logger,
    private repo: BlastRepository = new BlastRepository(container.db),
  ) {}

  private async loadContext(workspaceId: string, prId: string): Promise<BlastPullContext> {
    const ctx = await this.repo.getPullWithRepo(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    return ctx;
  }

  async getBlastRadius(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const started = Date.now();
    const { repo } = await this.loadContext(workspaceId, prId);
    const changedFiles = await this.repo.listChangedFiles(prId);

    const result = await this.container.repoIntel.getBlastRadius(repo.id, changedFiles);
    const indexState = await this.container.repoIntel.getIndexState(repo.id);
    const response = toBlastRadius(result, { indexState });

    const served = result.factsByFile && !result.degraded ? 'persistent-index' : 'fallback';
    this.logger?.info(
      {
        prId,
        repoId: repo.id,
        changedFiles: changedFiles.length,
        served,
        indexStatus: indexState.status,
        indexedSha: indexState.lastIndexedSha,
        degraded: response.degraded,
        reason: response.reason,
        stats: response.stats,
        ms: Date.now() - started,
      },
      `blast: served from ${served} (index read only, no re-parse)`,
    );
    return response;
  }

  async getPriorPrs(workspaceId: string, prId: string): Promise<PriorPrsResponse> {
    const { pull, repo } = await this.loadContext(workspaceId, prId);
    if (!repo.clonePath) {
      return { history: [], source: 'git', clone_available: false, commits_scanned: 0 };
    }
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    let commits: GitCommit[] = [];
    try {
      commits = (await this.container.git.log(ref)).slice(0, MAX_HISTORY_COMMITS);
    } catch (err) {
      this.logger?.warn({ prId, repoId: repo.id, err: errMessage(err) }, 'blast: git log failed');
    }

    const changedFiles = await this.repo.listChangedFiles(prId);
    const candidates = selectCandidates(commits, {
      excludeNumber: pull.number,
      max: MAX_PRIOR_PR_CANDIDATES,
    });

    const withFiles: Array<PrCandidate & { files: string[] }> = [];
    for (const c of candidates) {
      try {
        // Parent missing (shallow boundary) or root commit -> git throws; skip it.
        const files = await this.container.git.diffNameOnly(ref, `${c.commit.sha}^1`, c.commit.sha);
        withFiles.push({ ...c, files });
      } catch {
        continue;
      }
    }

    const localPulls = await this.repo.getPullsByNumbers(
      repo.id,
      withFiles.map((c) => c.parsed.number),
    );
    const history = buildPriorPrs({
      candidates: withFiles,
      changedFiles,
      localPulls,
      limit: MAX_PRIOR_PRS,
    });

    this.logger?.info(
      { prId, repoId: repo.id, commitsScanned: commits.length, candidates: candidates.length, found: history.length },
      'blast: prior PRs from local git history',
    );
    return { history, source: 'git', clone_available: true, commits_scanned: commits.length };
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
