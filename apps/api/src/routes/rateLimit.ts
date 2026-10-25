import { currentUser } from '../auth';
import type { FastifyRequest } from 'fastify';

/** Route config for every LLM-backed route: 30 requests a minute per signed-in user. */
export const llmRateLimit = {
  rateLimit: {
    max: 30,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => currentUser(req).id,
  },
};
