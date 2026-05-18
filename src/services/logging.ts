import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { logRecords, type LogRecordInsert } from '../db/schema.js';
import type { RawUpstream } from './upstreams.js';

export type LogRecordInput = LogRecordInsert;

export function buildLogRecord(params: {
  clientId: string;
  clientName: string;
  modelId: string;
  upstream: RawUpstream | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
  timeToFirstTokenMs: number | null;
  finishReason: string | null;
  status: 'success' | 'error' | 'cancelled';
  statusCode: number | null;
  errorMessage: string | null;
  startTime: Date;
}): LogRecordInsert {
  return {
    id: randomUUID(),
    clientId: params.clientId,
    clientName: params.clientName,
    modelId: params.modelId,
    upstreamId: params.upstream?.id ?? null,
    upstreamName: params.upstream?.name ?? null,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens: params.totalTokens,
    latencyMs: params.latencyMs,
    timeToFirstTokenMs: params.timeToFirstTokenMs,
    finishReason: params.finishReason,
    status: params.status,
    statusCode: params.statusCode,
    errorMessage: params.errorMessage,
    createdAt: params.startTime,
  };
}

export function writeLogRecord(input: LogRecordInsert): void {
  try {
    const db = getDb();
    db.insert(logRecords).values(input).run();
  } catch (err: unknown) {
    console.error(
      '[logging] Failed to write log record:',
      err instanceof Error ? err.message : String(err)
    );
  }
}
