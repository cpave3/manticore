import { z } from 'zod';

export const breakdownQuerySchema = z.object({
  groupBy: z.enum(['client', 'model', 'upstream']),
});

export const timeSeriesQuerySchema = z.object({
  bucket: z.enum(['hour', 'day']).default('hour'),
});

export const eventLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  sortBy: z.enum(['createdAt', 'latencyMs', 'totalTokens', 'status']).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
