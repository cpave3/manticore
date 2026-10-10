import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { logRecords, type LogRecordInsert } from '../db/schema.js';
import type { UsageRecordInput } from '../schemas/usage.js';

export type UsageReportResult = {
  accepted: number;
  duplicates: number;
};

// Persists Reported Usage: one LogRecord per request the Client made to a
// model provider itself, without Manticore forwarding it. Unlike the proxy's
// own logging this throws on failure, so the reporter knows to send it again.
//
// A record that names an `id` is stored once however often it is sent: the
// id is the Client's own, so it is kept under that Client.
export function recordReportedUsage(params: {
  client: { id: string; name: string };
  sessionId: string | null;
  records: UsageRecordInput[];
}): UsageReportResult {
  const { client, sessionId, records } = params;
  const now = new Date();
  const rows: LogRecordInsert[] = records.map((record) => ({
    id: record.id ? `${client.id}:${record.id}` : randomUUID(),
    clientId: client.id,
    clientName: client.name,
    modelId: record.model,
    upstreamId: null,
    upstreamName: record.upstream ?? null,
    sessionId,
    promptTokens: record.prompt_tokens,
    completionTokens: record.completion_tokens,
    totalTokens: record.prompt_tokens + record.completion_tokens,
    cacheReadTokens: record.cache_read_tokens ?? null,
    cacheCreationTokens: record.cache_creation_tokens ?? null,
    latencyMs: record.latency_ms ?? 0,
    timeToFirstTokenMs: record.time_to_first_token_ms ?? null,
    finishReason: record.finish_reason ?? null,
    status: 'success',
    statusCode: null,
    errorMessage: null,
    createdAt: record.started_at ? new Date(record.started_at) : now,
  }));

  const { changes } = getDb().insert(logRecords).values(rows).onConflictDoNothing().run();

  return { accepted: changes, duplicates: rows.length - changes };
}
