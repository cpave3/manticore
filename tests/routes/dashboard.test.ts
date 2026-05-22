import { describe, it, expect } from 'vitest';
import { withFreshDb } from '../helpers/db.js';
import { makeLogRecord } from '../helpers/factories.js';
import dashboardApp from '../../src/routes/dashboard.js';
import { getDb } from '../../src/db/client.js';

describe('dashboard routes', () => {
  it('GET /summary returns aggregated counts', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { status: 'success', promptTokens: 10, completionTokens: 5, totalTokens: 15 });
      await makeLogRecord(db, { status: 'error', promptTokens: 3, completionTokens: 1, totalTokens: 4 });

      const res = await dashboardApp.request('/summary');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('totalRequests', 2);
      expect(body).toHaveProperty('totalPromptTokens', 13);
      expect(body).toHaveProperty('totalCompletionTokens', 6);
      expect(body).toHaveProperty('totalTokens', 19);
    });
  });

  it('GET /breakdown/client returns array of breakdown rows', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { clientId: 'c1', clientName: 'Alice', promptTokens: 5, totalTokens: 5 });

      const res = await dashboardApp.request('/breakdown/client');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0]).toHaveProperty('key');
      expect(body[0]).toHaveProperty('label');
    });
  });

  it('GET /breakdown/model returns array', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { modelId: 'openai/gpt-4' });

      const res = await dashboardApp.request('/breakdown/model');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  it('GET /breakdown/upstream returns array', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { upstreamName: 'openai', totalTokens: 10 });

      const res = await dashboardApp.request('/breakdown/upstream');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  it('GET /breakdown/bogus returns 400', async () => {
    await withFreshDb(async () => {
      const res = await dashboardApp.request('/breakdown/bogus');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('GET /time-series?bucket=hour returns 200, sorted ascending', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { createdAt: new Date() });

      const res = await dashboardApp.request('/time-series?bucket=hour');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      if (body.length >= 2) {
        expect(body[0].bucketStart <= body[1].bucketStart).toBe(true);
      }
    });
  });

  it('GET /time-series?bucket=junk returns 400', async () => {
    await withFreshDb(async () => {
      const res = await dashboardApp.request('/time-series?bucket=junk');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('GET /events?page=1&pageSize=5 returns items + total', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, {});
      await makeLogRecord(db, {});

      const res = await dashboardApp.request('/events?page=1&pageSize=5');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.total).toBe('number');
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(5);
    });
  });

  it('GET /summary?startDate filters out older records', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { createdAt: new Date('2024-01-01T00:00:00Z'), totalTokens: 100 });
      await makeLogRecord(db, { createdAt: new Date('2024-06-15T12:00:00Z'), totalTokens: 200 });

      const res = await dashboardApp.request('/summary?startDate=2024-06-01T00:00:00Z');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalRequests).toBe(1);
      expect(body.totalTokens).toBe(200);
    });
  });

  it('GET /summary?endDate filters out newer records', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { createdAt: new Date('2024-01-01T00:00:00Z'), totalTokens: 100 });
      await makeLogRecord(db, { createdAt: new Date('2024-06-15T12:00:00Z'), totalTokens: 200 });

      const res = await dashboardApp.request('/summary?endDate=2024-02-01T00:00:00Z');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalRequests).toBe(1);
      expect(body.totalTokens).toBe(100);
    });
  });

  it('GET /breakdown/client?startDate respects range', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { clientId: 'c1', clientName: 'Alice', createdAt: new Date('2024-01-01T00:00:00Z'), totalTokens: 100 });
      await makeLogRecord(db, { clientId: 'c1', clientName: 'Alice', createdAt: new Date('2024-06-15T12:00:00Z'), totalTokens: 200 });

      const res = await dashboardApp.request('/breakdown/client?startDate=2024-06-01T00:00:00Z');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].totalTokens).toBe(200);
    });
  });

  it('GET /time-series?startDate&endDate returns custom range', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { createdAt: new Date('2024-01-01T10:00:00Z'), promptTokens: 5 });
      await makeLogRecord(db, { createdAt: new Date('2024-01-02T10:00:00Z'), promptTokens: 10 });
      await makeLogRecord(db, { createdAt: new Date('2024-01-03T10:00:00Z'), promptTokens: 15 });

      const res = await dashboardApp.request('/time-series?bucket=day&startDate=2024-01-01T00:00:00Z&endDate=2024-01-02T23:59:59Z');
      expect(res.status).toBe(200);
      const body = await res.json() as { promptTokens: number }[];
      expect(body.length).toBe(2);
      expect(body.reduce((s: number, p: { promptTokens: number }) => s + p.promptTokens, 0)).toBe(15);
    });
  });

  it('GET /events?startDate&endDate filters log', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { createdAt: new Date('2024-01-01T00:00:00Z'), totalTokens: 100 });
      await makeLogRecord(db, { createdAt: new Date('2024-06-01T00:00:00Z'), totalTokens: 200 });

      const res = await dashboardApp.request('/events?page=1&pageSize=50&startDate=2024-05-01T00:00:00Z&endDate=2024-12-31T23:59:59Z');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBe(1);
      expect(body.total).toBe(1);
    });
  });

  it('GET /events?sortBy=garbage returns 400', async () => {
    await withFreshDb(async () => {
      const res = await dashboardApp.request('/events?sortBy=garbage');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('GET /summary?startDate=invalid returns 400', async () => {
    await withFreshDb(async () => {
      const res = await dashboardApp.request('/summary?startDate=invalid');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('GET /summary with future range returns empty aggregates', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      await makeLogRecord(db, { createdAt: new Date('2024-01-01T00:00:00Z'), totalTokens: 100 });

      const res = await dashboardApp.request('/summary?startDate=2099-01-01T00:00:00Z');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalRequests).toBe(0);
      expect(body.totalTokens).toBe(0);
    });
  });
});
