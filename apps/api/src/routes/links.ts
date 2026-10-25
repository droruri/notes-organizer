import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LinkReader } from '../domain/links/preview';

const Query = z.object({
  url: z
    .string()
    .max(2000)
    .refine((u) => URL.canParse(u)),
  reader: z.literal('1').optional(),
});

export function linksRoutes(app: FastifyInstance, links: LinkReader): void {
  app.get('/links/preview', async (req, reply) => {
    const query = Query.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_query' });
    const preview = await links.preview(query.data.url, query.data.reader === '1');
    if (!preview) return reply.code(422).send({ error: 'unreachable' });
    return preview;
  });
}
