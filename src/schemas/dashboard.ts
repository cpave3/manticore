import { z } from 'zod';

export const summaryQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const breakdownQuerySchema = z.object({
  groupBy: z.enum(['client', 'model', 'upstream', 'session']),
  clientId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const timeSeriesQuerySchema = z.object({
  bucket: z.enum(['hour', 'day']).default('hour'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const eventLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  sortBy: z.enum(['createdAt', 'clientName', 'sessionId', 'modelId', 'upstreamName', 'promptTokens', 'completionTokens', 'totalTokens', 'latencyMs', 'status']).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  clientId: z.string().uuid().optional(),
  status: z.enum(['success', 'error', 'cancelled']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
