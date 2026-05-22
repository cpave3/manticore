import { sql, count, desc, asc, gte, lte, and, gt, eq, isNotNull } from 'drizzle-orm';
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

function dateFilters(start?: Date, end?: Date) {
  const filters = [];
  if (start) filters.push(gte(logRecords.createdAt, start));
  if (end) filters.push(lte(logRecords.createdAt, end));
  return filters.length > 0 ? and(...filters) : undefined;
}

export async function summary(range?: { start?: Date; end?: Date }): Promise<DashboardSummary> {
  const db = getDb();
  const where = dateFilters(range?.start, range?.end);
  const row = await db
    .select({
      totalRequests: count(),
      totalPromptTokens: sql<number>`COALESCE(SUM(${logRecords.promptTokens}), 0)`,
      totalCompletionTokens: sql<number>`COALESCE(SUM(${logRecords.completionTokens}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`,
      totalLatencyMs: sql<number>`COALESCE(SUM(${logRecords.latencyMs}), 0)`,
    })
    .from(logRecords)
    .where(where)
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
  groupBy: 'client' | 'model' | 'upstream' | 'session',
  range?: { start?: Date; end?: Date },
  clientId?: string,
): Promise<DashboardBreakdownRow[]> {
  const db = getDb();
  const baseFilters = dateFilters(range?.start, range?.end);
  const clientFilter = clientId ? eq(logRecords.clientId, clientId) : undefined;
  const where = baseFilters && clientFilter ? and(baseFilters, clientFilter) : clientFilter ?? baseFilters;

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
      .where(where)
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
      .where(where)
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

  if (groupBy === 'session') {
    const sessionWhere = where
      ? and(where, isNotNull(logRecords.sessionId))
      : isNotNull(logRecords.sessionId);
    const rows = await db
      .select({
        key: logRecords.sessionId,
        label: logRecords.sessionId,
        requests: count(),
        promptTokens: sql<number>`COALESCE(SUM(${logRecords.promptTokens}), 0)`,
        completionTokens: sql<number>`COALESCE(SUM(${logRecords.completionTokens}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${logRecords.totalTokens}), 0)`,
        latencyMs: sql<number>`COALESCE(SUM(${logRecords.latencyMs}), 0)`,
      })
      .from(logRecords)
      .where(sessionWhere)
      .groupBy(logRecords.sessionId)
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

  // upstream
  const upstreamWhere = where
    ? and(where, isNotNull(logRecords.upstreamName))
    : isNotNull(logRecords.upstreamName);
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
    .where(upstreamWhere)
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
  range?: { start?: Date; end?: Date },
): Promise<DashboardTimeSeriesPoint[]> {
  const db = getDb();

  const bucketExpr =
    bucket === 'hour'
      ? sql<string>`strftime('%Y-%m-%dT%H:00:00Z', ${logRecords.createdAt} / 1000, 'unixepoch')`
      : sql<string>`strftime('%Y-%m-%dT00:00:00Z', ${logRecords.createdAt} / 1000, 'unixepoch')`;

  let userFilter = dateFilters(range?.start, range?.end);
  if (!range?.start && !range?.end) {
    // Default cutoff when no range provided (preserve existing behavior)
    const cutoffMs =
      bucket === 'hour'
        ? Date.now() - 24 * 60 * 60 * 1000
        : Date.now() - 30 * 24 * 60 * 60 * 1000;
    userFilter = gt(logRecords.createdAt, new Date(cutoffMs));
  }

  const rows = await db
    .select({
      bucketStart: bucketExpr,
      requests: count(),
      promptTokens: sql<number>`COALESCE(SUM(${logRecords.promptTokens}), 0)`,
      completionTokens: sql<number>`COALESCE(SUM(${logRecords.completionTokens}), 0)`,
    })
    .from(logRecords)
    .where(userFilter)
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
  start?: Date;
  end?: Date;
}): Promise<EventLogResponse> {
  const db = getDb();
  const { page, pageSize, sortBy, sortDir, start, end } = params;
  const where = dateFilters(start, end);

  const totalRow = await db.select({ count: count() }).from(logRecords).where(where).get();
  const total = Number(totalRow?.count ?? 0);

  const orderFn = sortDir === 'desc' ? desc : asc;
  const orderCol = sortBy
    ? sortableColumns[sortBy as keyof typeof sortableColumns]
    : logRecords.createdAt;

  const rows = await db
    .select()
    .from(logRecords)
    .where(where)
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
    sessionId: row.sessionId ?? null,
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
