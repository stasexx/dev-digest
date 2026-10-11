import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse, PriorPrsResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module routes (read-only).
 *
 * GET /pulls/:id/blast      -> blast radius from the prebuilt repo index
 * GET /pulls/:id/prior-prs  -> prior merged PRs touching the same files (local git history)
 *
 * Onion layer: presentation - getContext -> one service call -> reply. The response
 * schemas make the serializer enforce the contract (a mismatch is a 500, i.e. a bug).
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return new BlastService(app.container, req.log).getBlastRadius(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/prior-prs',
    { schema: { params: IdParams, response: { 200: PriorPrsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return new BlastService(app.container, req.log).getPriorPrs(workspaceId, req.params.id);
    },
  );
}
