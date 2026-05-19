import { z } from 'zod';

export const createModelMappingBodySchema = z.object({
  abstractName: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_.]*$/i, {
      message: 'Invalid abstract model name',
    }),
  upstreamId: z.string().min(1),
  modelPath: z.string().min(1),
  priority: z.number().int().min(1).optional(),
});

export type CreateModelMappingBody = z.infer<typeof createModelMappingBodySchema>;

export const modelMappingIdParamSchema = z.object({
  id: z.string(),
});

export type ModelMappingIdParam = z.infer<typeof modelMappingIdParamSchema>;
