import { eq } from 'drizzle-orm';
import type { PrBriefRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * brief module - infrastructure layer. Drizzle access to `pr_brief` only.
 * The JSON is returned unparsed: the service validates it (a malformed row is
 * treated as "no brief", never a 500).
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async getJson(prId: string): Promise<unknown | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId))
      .limit(1);
    return row ? row.json : null;
  }

  async upsert(prId: string, record: PrBriefRecord): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: record })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: record } });
  }
}
