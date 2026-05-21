import { sql, count, desc, asc, gt, isNotNull } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { logRecords } from '../db/schema.js';
import { tokensPerSecond } from '../lib/metrics.js';
import type {
  DashboardSummary,
  DashboardBreakdownRow,
  DashboardTimeSeriesPoint,
  EventLogResponse,
  LogRecordResponse,
} from '../types/api.js';

export async function summary(): Promise<DashboardSummary> {
  const db = getDb();
  const row = await db
    .select({
      totalRequests: count(),
      totalPromptTokens: sql<number>`COALESCE(SUM(${logRecords.promptTokens}), 0)`,
      totalCompletionTokens: sql<number>`COALESCE(SUM(${logRecords.completionTokens}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`,
      totalLatencyMs: sql<number>`COALESCE(SUM(${logRecords.latencyMs}), 0)`,
    })
    .from(logRecords)
    .get();

  const totalCompletionTokens = Number(row?.totalCompletionTokens ?? 0);
  const totalLatencyMs = Number(row?.totalLatencyMs ?? 0);

  return {
    totalRequests: Number(row?.totalRequests ?? 0),
    totalPromptTokens: Number(row?.totalPromptTokens ?? 0),
    totalCompletionTokens,
    totalTokens: Number(row?.totalTokens ?? 0),
    tokensPerSecond: tokensPerSecond(totalCompletionTokens, totalLatencyMs),
  };
}

export async function breakdown(
  groupBy: 'client' | 'model' | 'upstream',
): Promise<DashboardBreakdownRow[]> {
  const db = getDb();

  if (groupBy === 'client') {
    const rows = await db
      .select({
        key: logRecords.clientId,
        label: logRecords.clientName,
        requests: count(),
        promptTokens: sql<number>`COALESCE(SUM(${logRecords.promptTokens}), 0)`,
        completionTokens: sql<number>`COALESCE(SUM(${logRecords.completionTokens}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`,
        latencyMs: sql<number>`COALESCE(SUM(${logRecords.latencyMs}), 0)`,
      })
      .from(logRecords)
      .groupBy(logRecords.clientId, logRecords.clientName)
      .orderBy(desc(sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`))
      .all();

    return rows.map((r) => ({
      key: r.key,
      label: r.label,
      requests: Number(r.requests),
      promptTokens: Number(r.promptTokens),
      completionTokens: Number(r.completionTokens),
      totalTokens: Number(r.totalTokens),
      tokensPerSecond: tokensPerSecond(Number(r.completionTokens), Number(r.latencyMs)),
    }));
  }

  if (groupBy === 'model') {
    const rows = await db
      .select({
        key: logRecords.modelId,
        label: logRecords.modelId,
        requests: count(),
        promptTokens: sql<number>`COALESCE(SUM(${logRecords.promptTokens}), 0)`,
        completionTokens: sql<number>`COALESCE(SUM(${logRecords.completionTokens}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`,
        latencyMs: sql<number>`COALESCE(SUM(${logRecords.latencyMs}), 0)`,
      })
      .from(logRecords)
      .groupBy(logRecords.modelId)
      .orderBy(desc(sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`))
      .all();

    return rows.map((r) => ({
      key: r.key,
      label: r.label,
      requests: Number(r.requests),
      promptTokens: Number(r.promptTokens),
      completionTokens: Number(r.completionTokens),
      totalTokens: Number(r.totalTokens),
      tokensPerSecond: tokensPerSecond(Number(r.completionTokens), Number(r.latencyMs)),
    }));
  }

  // upstream
  const rows = await db
    .select({
      key: logRecords.upstreamName,
      label: logRecords.upstreamName,
      requests: count(),
      promptTokens: sql<number>`COALESCE(SUM(${logRecords.promptTokens}), 0)`,
      completionTokens: sql<number>`COALESCE(SUM(${logRecords.completionTokens}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`,
      latencyMs: sql<number>`COALESCE(SUM(${logRecords.latencyMs}), 0)`,
    })
    .from(logRecords)
    .where(isNotNull(logRecords.upstreamName))
    .groupBy(logRecords.upstreamName)
    .orderBy(desc(sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`))
    .all();

  return rows.map((r) => ({
    key: r.key!,
    label: r.label!,
    requests: Number(r.requests),
    promptTokens: Number(r.promptTokens),
    completionTokens: Number(r.completionTokens),
    totalTokens: Number(r.totalTokens),
    tokensPerSecond: tokensPerSecond(Number(r.completionTokens), Number(r.latencyMs)),
  }));
}

export async function timeSeries(
  bucket: 'hour' | 'day',
): Promise<DashboardTimeSeriesPoint[]> {
  const db = getDb();

  const bucketExpr =
    bucket === 'hour'
      ? sql<string>`strftime('%Y-%m-%dT%H:00:00Z', ${logRecords.createdAt} / 1000, 'unixepoch')`
      : sql<string>`strftime('%Y-%m-%dT00:00:00Z', ${logRecords.createdAt} / 1000, 'unixepoch')`;

  const cutoffMs =
    bucket === 'hour'
      ? Date.now() - 24 * 60 * 60 * 1000
      : Date.now() - 30 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs);

  const rows = await db
    .select({
      bucketStart: bucketExpr,
      requests: count(),
      promptTokens: sql<number>`COALESCE(SUM(${logRecords.promptTokens}), 0)`,
      completionTokens: sql<number>`COALESCE(SUM(${logRecords.completionTokens}), 0)`,
    })
    .from(logRecords)
    .where(gt(logRecords.createdAt, cutoff))
    .groupBy(bucketExpr)
    .orderBy(asc(bucketExpr))
    .all();

  return rows.map((r) => ({
    bucketStart: r.bucketStart,
    requests: Number(r.requests),
    promptTokens: Number(r.promptTokens),
    completionTokens: Number(r.completionTokens),
  }));
}

const sortableColumns = {
  createdAt: logRecords.createdAt,
  latencyMs: logRecords.latencyMs,
  totalTokens: logRecords.totalTokens,
  status: logRecords.status,
} as const;

export async function eventLog(params: {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}): Promise<EventLogResponse> {
  const db = getDb();
  const { page, pageSize, sortBy, sortDir } = params;

  const totalRow = await db.select({ count: count() }).from(logRecords).get();
  const total = Number(totalRow?.count ?? 0);

  const orderFn = sortDir === 'desc' ? desc : asc;
  const orderCol = sortBy
    ? sortableColumns[sortBy as keyof typeof sortableColumns]
    : logRecords.createdAt;

  const rows = await db
    .select()
    .from(logRecords)
    .orderBy(orderFn(orderCol))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const items: LogRecordResponse[] = rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    modelId: row.modelId,
    upstreamId: row.upstreamId ?? null,
    upstreamName: row.upstreamName ?? null,
    promptTokens: row.promptTokens ?? null,
    completionTokens: row.completionTokens ?? null,
    totalTokens: row.totalTokens ?? null,
    latencyMs: row.latencyMs,
    timeToFirstTokenMs: row.timeToFirstTokenMs ?? null,
    finishReason: row.finishReason ?? null,
    status: row.status,
    statusCode: row.statusCode ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt.toISOString(),
    tokensPerSecond: tokensPerSecond(row.completionTokens, row.latencyMs),
  }));

  return {
    items,
    total,
    page,
    pageSize,
  };
}
