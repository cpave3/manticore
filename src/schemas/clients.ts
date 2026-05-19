import { z } from 'zod';

export const createClientBodySchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateClientBodySchema = z.object({
  name: z.string().min(1).max(100),
});

export const clientIdParamSchema = z.object({
  id: z.string(),
});
