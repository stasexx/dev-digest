/**
 * devdigest_get_blast_radius — map what a PR's changed symbols can break.
 *
 * Thin transport layer: Zod-validate -> resolve (repo, pr#) -> GET /pulls/:id/blast
 * -> compact -> format. The server computes the map; this tool only compacts it.
 * The handler never throws — every failure becomes a forward-leading toolError.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError, type DevDigestClient } from '../http/client.js';
import type { resolvePullId } from '../core/resolve.js';
import type { compactBlast } from '../core/blast.js';
import { toolOk, toolError } from '../format.js';

const inputSchema = {
  repo: z
    .string()
    .describe(
      "Repository as 'owner/name' (e.g. 'stasexx/dev-digest'), or just the name if unambiguous.",
    ),
  pr: z.number().int().positive().describe('Pull request number (e.g. 6), not an internal id.'),
};

export type GetBlastRadiusDeps = {
  resolvePullId: typeof resolvePullId;
  compactBlast: typeof compactBlast;
};

export function registerGetBlastRadius(
  server: McpServer,
  client: DevDigestClient,
  deps: GetBlastRadiusDeps,
): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      description:
        "Map the blast radius of a pull request: the symbols its changed files declare, who calls them (file:line, caller name), and which HTTP endpoints and cron jobs depend on those callers. Call this before reviewing or approving a PR to see what else the diff can break. Read-only; served from the prebuilt code index (no LLM, no re-parse) and identical to the Blast radius block on the PR Overview tab. If 'degraded' is true the index is incomplete — say so instead of claiming there is no impact.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ repo, pr }) => {
      try {
        const resolved = await deps.resolvePullId(client, repo, pr);
        if ('error' in resolved) {
          return toolError(resolved.error);
        }
        const resp = await client.getBlastRadius(resolved.pullId);
        return toolOk(deps.compactBlast(resp, { repo, pr }));
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            return toolError(
              `PR #${pr} not found in '${repo}' anymore — call devdigest_get_blast_radius again with a current PR number.`,
            );
          }
          if (err.status === 0) {
            return toolError(
              `DevDigest API unreachable at ${err.url} — start it with ./scripts/dev.sh.`,
            );
          }
          return toolError(
            `DevDigest API error ${err.status} for PR #${pr} in '${repo}' — retry, or check the API log.`,
          );
        }
        return toolError(
          `DevDigest API error for PR #${pr} in '${repo}' — retry, or check the API log.`,
        );
      }
    },
  );
}
