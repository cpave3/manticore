import { z } from 'zod';

const upstreamNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/i, {
    message: 'Name must be a valid path segment',
  });

export const upstreamTypeSchema = z
  .union([z.literal('openai-compatible'), z.literal('chatgpt-codex')])
  .optional()
  .default('openai-compatible');

export const createUpstreamBodySchema = z
  .object({
    type: upstreamTypeSchema,
    name: upstreamNameSchema,
    baseUrl: z.string().url().optional().nullable(),
    apiKey: z.string().optional().nullable(),
    headers: z.record(z.string(), z.string()).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'openai-compatible' && !value.baseUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: 'baseUrl is required for openai-compatible upstreams',
      });
    }
  });

export type CreateUpstreamBody = z.infer<typeof createUpstreamBodySchema>;

export const updateUpstreamBodySchema = z.object({
  name: upstreamNameSchema,
});

export type UpdateUpstreamBody = z.infer<typeof updateUpstreamBodySchema>;

export const upstreamIdParamSchema = z.object({
  id: z.string(),
});

export type UpstreamIdParam = z.infer<typeof upstreamIdParamSchema>;
