import { z } from 'zod';

// Schemas and types used by both web and api, defined once.

export const HealthResponse = z.object({
  ok: z.boolean(),
  db: z.boolean().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
