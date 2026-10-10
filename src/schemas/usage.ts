import { z } from 'zod';

const tokenCount = z.number().int().min(0);
const milliseconds = z.number().int().min(0);

// One request a Client made to a model provider itself. `prompt_tokens` is
// the whole prompt; the two cache counts say how much of it the provider's
// prompt cache served or stored, so they can never add up to more.
export const usageRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(200).optional(),
    model: z.string().trim().min(1).max(200),
    upstream: z.string().trim().min(1).max(100).optional(),
    prompt_tokens: tokenCount,
    completion_tokens: tokenCount,
    cache_read_tokens: tokenCount.optional(),
    cache_creation_tokens: tokenCount.optional(),
    latency_ms: milliseconds.optional(),
    time_to_first_token_ms: milliseconds.optional(),
    finish_reason: z.string().max(100).optional(),
    started_at: z.number().int().positive().optional(),
  })
  .refine(
    (record) => (record.cache_read_tokens ?? 0) + (record.cache_creation_tokens ?? 0) <= record.prompt_tokens,
    { path: ['prompt_tokens'], message: 'must include the cached tokens' },
  );

export const usageReportSchema = z.object({
  records: z.array(usageRecordSchema).min(1).max(500),
});

export type UsageRecordInput = z.infer<typeof usageRecordSchema>;
