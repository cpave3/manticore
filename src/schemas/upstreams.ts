import { z } from 'zod';

export const createUpstreamBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i, {
      message: 'Name must be a valid path segment',
    }),
  baseUrl: z.string().url(),
  apiKey: z.string().optional().nullable(),
  headers: z.record(z.string(), z.string()).optional().nullable(),
});

export type CreateUpstreamBody = z.infer<typeof createUpstreamBodySchema>;

export const updateUpstreamBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i, {
      message: 'Name must be a valid path segment',
    }),
});

export type UpdateUpstreamBody = z.infer<typeof updateUpstreamBodySchema>;

export const upstreamIdParamSchema = z.object({
  id: z.string(),
});

export type UpstreamIdParam = z.infer<typeof upstreamIdParamSchema>;
