import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * blast module - infrastructure layer. Drizzle reads only; returns plain DTOs.
 */

export interface BlastPullContext {
  pull: { id: string; number: number; repoId: string; headSha: string };
  repo: { id: string; owner: string; name: string; fullName: string; clonePath: string | null };
}

export class BlastRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped PR + its repo; null when the PR is unknown or foreign. */
  async getPullWithRepo(workspaceId: string, prId: string): Promise<BlastPullContext | null> {
    const [row] = await this.db
      .select({
        pullId: t.pullRequests.id,
        number: t.pullRequests.number,
        repoId: t.pullRequests.repoId,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.id, prId), eq(t.pullRequests.workspaceId, workspaceId)))
      .limit(1);
    if (!row) return null;
    return {
      pull: { id: row.pullId, number: row.number, repoId: row.repoId, headSha: row.headSha },
      repo: {
        id: row.repoId,
        owner: row.owner,
        name: row.name,
        fullName: row.fullName,
        clonePath: row.clonePath,
      },
    };
  }

  /** Changed file paths of a PR (deduped, sorted). */
  async listChangedFiles(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
    return [...new Set(rows.map((r) => r.path))];
  }

  /** Locally known PRs of a repo by number (title/author enrichment). */
  async getPullsByNumbers(
    repoId: string,
    numbers: number[],
  ): Promise<Map<number, { title: string; author: string }>> {
    const out = new Map<number, { title: string; author: string }>();
    if (numbers.length === 0) return out;
    const rows = await this.db
      .select({
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), inArray(t.pullRequests.number, numbers)));
    for (const r of rows) out.set(r.number, { title: r.title, author: r.author });
    return out;
  }
}
