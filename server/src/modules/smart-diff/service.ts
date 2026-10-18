import type { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { Logger } from '../reviews/run-executor.js';
import { buildSmartDiff, selectLatestReviewFindings } from './helpers.js';

/**
 * Smart Diff application service. Deterministic: groups PR files by role and
 * attaches the lines of the latest review's findings. Reads only through
 * `container.reviewRepo`; never touches the LLM, GitHub or git.
 */
export class SmartDiffService {
  constructor(
    private container: Container,
    private logger?: Logger,
  ) {}

  async forPull(workspaceId: string, prId: string): Promise<SmartDiff> {
    const repo = this.container.reviewRepo;
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, reviews] = await Promise.all([repo.getPrFiles(prId), repo.reviewsForPull(prId)]);
    const findings = selectLatestReviewFindings(reviews);
    const result = buildSmartDiff(files, findings);

    this.logger?.info(
      {
        prId,
        files: files.length,
        groups: result.groups.length,
        findingLines: result.groups.reduce(
          (n, g) => n + g.files.reduce((m, f) => m + f.finding_lines.length, 0),
          0,
        ),
      },
      'smart-diff: deterministic role grouping (no LLM call)',
    );
    return result;
  }
}
