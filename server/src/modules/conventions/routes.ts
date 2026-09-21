import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionUpdateInput, ConventionsToSkillInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions Extractor.
 *   POST  /repos/:id/conventions/extract → run a scan (samples → model → evidence check → persist)
 *   GET   /repos/:id/conventions         → persisted candidates (rejected ones are hidden)
 *   PATCH /conventions/:id               → accept / reject / edit one candidate
 *   GET   /repos/:id/conventions/skill-draft → name/description/body prefill for the modal
 *   POST  /repos/:id/conventions/skill   → accepted candidates → skill (+ optional agent link)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions/skill-draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.skillDraft(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionUpdateInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: ConventionsToSkillInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.createSkill(workspaceId, req.params.id, req.body);
    },
  );
}
