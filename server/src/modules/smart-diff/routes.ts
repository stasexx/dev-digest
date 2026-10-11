import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * smart-diff module routes.
 *
 * GET /pulls/:id/smart-diff -> files grouped by role + finding lines (deterministic, no LLM)
 *
 * Onion layer: presentation — getContext -> one service call -> reply.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return new SmartDiffService(app.container, req.log).forPull(workspaceId, req.params.id);
    },
  );
}
