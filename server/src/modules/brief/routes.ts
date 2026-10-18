import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BRIEF_GENERATE_RATE_LIMIT } from './constants.js';
import { BriefService } from './service.js';

/**
 * brief module routes.
 *
 * GET  /pulls/:id/brief -> stored brief + staleness; never calls a model or GitHub
 * POST /pulls/:id/brief -> (re)generate with one model call (rate limited)
 *
 * Onion layer: presentation - getContext -> one service call -> reply.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return new BriefService(app.container, req.log).get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: { rateLimit: BRIEF_GENERATE_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return new BriefService(app.container, req.log).generate(workspaceId, req.params.id);
    },
  );
}
