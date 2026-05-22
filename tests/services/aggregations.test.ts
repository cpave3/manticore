import { describe, it, expect } from 'vitest';
import { freshDb, schema } from '../helpers/db.js';
import { makeClient, makeUpstream, makeLogRecord } from '../helpers/factories.js';
import { summary, breakdown, timeSeries, eventLog } from '../../src/services/aggregations.js';

describe('aggregations service', () => {
  async function seedData(db: ReturnType<typeof freshDb>['db']) {
    const clientA = await makeClient(db, { name: 'Client A' });
    const clientB = await makeClient(db, { name: 'Client B' });
    const upstream1 = await makeUpstream(db, { name: 'ollama', baseUrl: 'http://localhost:11434' });
    const upstream2 = await makeUpstream(db, { name: 'openai', baseUrl: 'https://api.openai.com' });

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

    await makeLogRecord(db, {
      clientId: clientA.id,
      clientName: clientA.name,
      modelId: 'openai/gpt-4o',
      upstreamId: upstream1.id,
      upstreamName: upstream1.name,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      latencyMs: 100,
      createdAt: now,
      status: 'success',
    });

    await makeLogRecord(db, {
      clientId: clientA.id,
      clientName: clientA.name,
      modelId: 'openai/gpt-4o',
      upstreamId: upstream1.id,
      upstreamName: upstream1.name,
      promptTokens: 5,
      completionTokens: 10,
      totalTokens: 15,
      latencyMs: 200,
      createdAt: hourAgo,
      status: 'success',
    });

    await makeLogRecord(db, {
      clientId: clientB.id,
      clientName: clientB.name,
      modelId: 'anthropic/claude-3',
      upstreamId: upstream2.id,
      upstreamName: upstream2.name,
      promptTokens: 20,
      completionTokens: 40,
      totalTokens: 60,
      latencyMs: 50,
      createdAt: twoHoursAgo,
      status: 'success',
    });

    // log without upstream
    await makeLogRecord(db, {
      clientId: clientB.id,
      clientName: clientB.name,
      modelId: 'anthropic/claude-3',
      upstreamId: null,
      upstreamName: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      latencyMs: 300,
      createdAt: yesterday,
      status: 'error',
    });

    // Old data for timeSeries tests
    await makeLogRecord(db, {
      clientId: clientA.id,
      clientName: clientA.name,
      modelId: 'openai/gpt-4o',
      upstreamId: upstream1.id,
      upstreamName: upstream1.name,
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      latencyMs: 400,
      createdAt: thirtyDaysAgo,
      status: 'success',
    });

    await makeLogRecord(db, {
      clientId: clientA.id,
      clientName: clientA.name,
      modelId: 'openai/gpt-4o',
      upstreamId: upstream1.id,
      upstreamName: upstream1.name,
      promptTokens: 1000,
      completionTokens: 2000,
      totalTokens: 3000,
      latencyMs: 500,
      createdAt: fortyDaysAgo,
      status: 'success',
    });

    return { clientA, clientB, upstream1, upstream2 };
  }

  describe('summary', () => {
    it('returns correct aggregates and does not treat null tokens as NaN', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const result = await summary();
        expect(result.totalRequests).toBe(6);
        expect(result.totalPromptTokens).toBe(1135);
        expect(result.totalCompletionTokens).toBe(2270);
        expect(result.totalTokens).toBe(3405);
      } finally {
        dbCtx.cleanup();
      }
    });

    it('returns weighted tokens-per-second across all records', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const result = await summary();
        // 2270 completion tokens / (1550ms / 1000) seconds
        expect(result.tokensPerSecond).not.toBeNull();
        expect(result.tokensPerSecond!).toBeCloseTo(2270 / 1.55, 3);
      } finally {
        dbCtx.cleanup();
      }
    });

    it('returns null tokensPerSecond when there are no records', async () => {
      const dbCtx = freshDb();
      try {
        const result = await summary();
        expect(result.tokensPerSecond).toBeNull();
      } finally {
        dbCtx.cleanup();
      }
    });
  });

  describe('breakdown by client', () => {
    it('groups by clientId with correct sums, ordered by totalTokens desc, label = clientName', async () => {
      const dbCtx = freshDb();
      try {
        const { clientA, clientB } = await seedData(dbCtx.db);
        const rows = await breakdown('client');
        expect(rows.length).toBe(2);
        // clientB has 60 totalTokens from one record, clientA has more
        expect(rows[0].key).toBe(clientA.id);
        expect(rows[0].label).toBe(clientA.name);
        expect(rows[0].totalTokens).toBe(3345);
        expect(rows[1].key).toBe(clientB.id);
        expect(rows[1].label).toBe(clientB.name);
        expect(rows[1].totalTokens).toBe(60);
      } finally {
        dbCtx.cleanup();
      }
    });
  });

  describe('breakdown by model', () => {
    it('groups by modelId with correct sums', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const rows = await breakdown('model');
        expect(rows.length).toBe(2);
        const gptRow = rows.find((r) => r.key === 'openai/gpt-4o');
        const claudeRow = rows.find((r) => r.key === 'anthropic/claude-3');
        expect(gptRow).toBeDefined();
        expect(gptRow!.totalTokens).toBe(3345);
        expect(claudeRow).toBeDefined();
        expect(claudeRow!.totalTokens).toBe(60);
      } finally {
        dbCtx.cleanup();
      }
    });

    it('returns weighted tokens-per-second per group', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const rows = await breakdown('model');
        const gptRow = rows.find((r) => r.key === 'openai/gpt-4o')!;
        const claudeRow = rows.find((r) => r.key === 'anthropic/claude-3')!;
        // gpt-4o: completion 20+10+200+2000 = 2230, latency 100+200+400+500 = 1200
        expect(gptRow.tokensPerSecond).not.toBeNull();
        expect(gptRow.tokensPerSecond!).toBeCloseTo(2230 / 1.2, 3);
        // claude-3: completion 40 (null treated as 0) = 40, latency 50+300 = 350
        expect(claudeRow.tokensPerSecond).not.toBeNull();
        expect(claudeRow.tokensPerSecond!).toBeCloseTo(40 / 0.35, 3);
      } finally {
        dbCtx.cleanup();
      }
    });
  });

  describe('breakdown by upstream', () => {
    it('excludes rows where upstreamName is null', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const rows = await breakdown('upstream');
        expect(rows.length).toBe(2);
        const nullRow = rows.find((r) => r.upstreamName === null);
        expect(nullRow).toBeUndefined();
      } finally {
        dbCtx.cleanup();
      }
    });
  });

  describe('timeSeries hour', () => {
    it('returns sorted ascending buckets with correct sums, excludes data older than 24 hours', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const points = await timeSeries('hour');
        // The 40-day-old record should be excluded
        expect(points.length).toBeGreaterThan(0);
        for (let i = 1; i < points.length; i++) {
          expect(points[i].bucketStart >= points[i - 1].bucketStart).toBe(true);
        }
        const totalReqs = points.reduce((sum, p) => sum + p.requests, 0);
        expect(totalReqs).toBe(3); // now, hourAgo, twoHoursAgo only (yesterday > 24h, excluded)
      } finally {
        dbCtx.cleanup();
      }
    });
  });

  describe('timeSeries day', () => {
    it('covers the last 30 days, correct bucket strings', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const points = await timeSeries('day');
        expect(points.length).toBeGreaterThan(0);
        for (let i = 1; i < points.length; i++) {
          expect(points[i].bucketStart >= points[i - 1].bucketStart).toBe(true);
        }
        const totalReqs = points.reduce((sum, p) => sum + p.requests, 0);
        expect(totalReqs).toBe(4); // now, hourAgo, twoHoursAgo, yesterday (30d+ excluded)
        // bucket strings should end in T00:00:00Z
        expect(points[0].bucketStart).toMatch(/T00:00:00Z$/);
      } finally {
        dbCtx.cleanup();
      }
    });
  });

  describe('eventLog', () => {
    it('returns paginated items with correct total, default sort is createdAt desc', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const result = await eventLog({ page: 1, pageSize: 2, sortDir: 'desc' });
        expect(result.items.length).toBe(2);
        expect(result.total).toBe(6);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(2);
        // Default sort is createdAt desc, so first item should be most recent
        expect(result.items[0].createdAt >= result.items[1].createdAt).toBe(true);
      } finally {
        dbCtx.cleanup();
      }
    });

    it('includes per-row tokensPerSecond and returns null for rows without completion tokens', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const result = await eventLog({ page: 1, pageSize: 50, sortDir: 'desc' });
        const successRow = result.items.find(
          (r) => r.completionTokens === 20 && r.latencyMs === 100,
        );
        const errorRow = result.items.find((r) => r.status === 'error');
        expect(successRow).toBeDefined();
        expect(successRow!.tokensPerSecond).not.toBeNull();
        expect(successRow!.tokensPerSecond!).toBeCloseTo(200, 3); // 20 / 0.1s
        expect(errorRow).toBeDefined();
        expect(errorRow!.tokensPerSecond).toBeNull();
        expect(successRow!.sessionId).toBeNull();
      } finally {
        dbCtx.cleanup();
      }
    });

    it('sorts by latencyMs ascending when requested', async () => {
      const dbCtx = freshDb();
      try {
        await seedData(dbCtx.db);
        const result = await eventLog({
          page: 1,
          pageSize: 50,
          sortBy: 'latencyMs',
          sortDir: 'asc',
        });
        expect(result.items.length).toBe(6);
        for (let i = 1; i < result.items.length; i++) {
          expect(result.items[i].latencyMs).toBeGreaterThanOrEqual(result.items[i - 1].latencyMs);
        }
      } finally {
        dbCtx.cleanup();
      }
    });
  });

  describe('breakdown by session', () => {
    it('groups by sessionId with correct sums, excludes null, ordered by totalTokens desc', async () => {
      const dbCtx = freshDb();
      try {
        const { db } = dbCtx;
        const client = await makeClient(db, { name: 'Test Client' });
        const upstream = await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

        await makeLogRecord(db, {
          clientId: client.id,
          clientName: client.name,
          upstreamId: upstream.id,
          upstreamName: upstream.name,
          sessionId: 'session-a',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          latencyMs: 100,
          createdAt: new Date(),
          status: 'success',
        });
        await makeLogRecord(db, {
          clientId: client.id,
          clientName: client.name,
          upstreamId: upstream.id,
          upstreamName: upstream.name,
          sessionId: 'session-a',
          promptTokens: 5,
          completionTokens: 10,
          totalTokens: 15,
          latencyMs: 50,
          createdAt: new Date(),
          status: 'success',
        });
        await makeLogRecord(db, {
          clientId: client.id,
          clientName: client.name,
          upstreamId: upstream.id,
          upstreamName: upstream.name,
          sessionId: 'session-b',
          promptTokens: 20,
          completionTokens: 40,
          totalTokens: 60,
          latencyMs: 200,
          createdAt: new Date(),
          status: 'success',
        });
        await makeLogRecord(db, {
          clientId: client.id,
          clientName: client.name,
          upstreamId: upstream.id,
          upstreamName: upstream.name,
          sessionId: null,
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
          latencyMs: 10,
          createdAt: new Date(),
          status: 'success',
        });

        const rows = await breakdown('session');
        expect(rows.length).toBe(2);
        expect(rows[0].key).toBe('session-b');
        expect(rows[0].totalTokens).toBe(60);
        expect(rows[1].key).toBe('session-a');
        expect(rows[1].totalTokens).toBe(45);
      } finally {
        dbCtx.cleanup();
      }
    });

    it('filters to a single client when clientId is provided', async () => {
      const dbCtx = freshDb();
      try {
        const { db } = dbCtx;
        const clientA = await makeClient(db, { name: 'Client A' });
        const clientB = await makeClient(db, { name: 'Client B' });
        const upstream = await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

        await makeLogRecord(db, {
          clientId: clientA.id,
          clientName: clientA.name,
          upstreamId: upstream.id,
          upstreamName: upstream.name,
          sessionId: 'sess-a',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          latencyMs: 100,
          createdAt: new Date(),
          status: 'success',
        });
        await makeLogRecord(db, {
          clientId: clientB.id,
          clientName: clientB.name,
          upstreamId: upstream.id,
          upstreamName: upstream.name,
          sessionId: 'sess-b',
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
          latencyMs: 1000,
          createdAt: new Date(),
          status: 'success',
        });

        const rowsA = await breakdown('session', undefined, clientA.id);
        expect(rowsA.length).toBe(1);
        expect(rowsA[0].key).toBe('sess-a');
        expect(rowsA[0].totalTokens).toBe(30);

        const rowsB = await breakdown('session', undefined, clientB.id);
        expect(rowsB.length).toBe(1);
        expect(rowsB[0].key).toBe('sess-b');
        expect(rowsB[0].totalTokens).toBe(300);
      } finally {
        dbCtx.cleanup();
      }
    });
  });

  describe('eventLog sessionId', () => {
    it('returns sessionId when it is set', async () => {
      const dbCtx = freshDb();
      try {
        const { db } = dbCtx;
        const client = await makeClient(db, { name: 'Test Client' });
        await makeLogRecord(db, {
          clientId: client.id,
          clientName: client.name,
          sessionId: 'thread-42',
          latencyMs: 100,
          createdAt: new Date(),
          status: 'success',
        });

        const result = await eventLog({ page: 1, pageSize: 50, sortDir: 'desc' });
        expect(result.items.length).toBe(1);
        expect(result.items[0].sessionId).toBe('thread-42');
      } finally {
        dbCtx.cleanup();
      }
    });
  });

});
