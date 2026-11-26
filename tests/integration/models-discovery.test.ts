import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withFreshDb } from '../helpers/db.js';
import { makeClient, makeUpstream } from '../helpers/factories.js';
import proxyApp from '../../src/routes/proxy.js';
import { getDb } from '../../src/db/client.js';
import {
  resetModelDiscoveryForTesting,
  DISCOVERY_CACHE_CONSTANTS,
} from '../../src/services/model-discovery.js';

function catalogueBody(models: Array<Record<string, unknown>>) {
  return { object: 'list', data: models };
}

function limit(context?: number, input?: number, output?: number) {
  const limit: Record<string, number> = {};
  if (context !== undefined) limit.context = context;
  if (input !== undefined) limit.input = input;
  if (output !== undefined) limit.output = output;
  return limit;
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authHeaders(client: { apiKey: string }): Record<string, string> {
  return { Authorization: `Bearer ${client.apiKey}` };
}

beforeEach(() => {
  resetModelDiscoveryForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /v1/models — client authentication', () => {
  it('401 — missing API key', async () => {
    await withFreshDb(async () => {
      const res = await proxyApp.request('/models');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.type).toBe('invalid_request_error');
    });
  });

  it('401 — invalid API key', async () => {
    await withFreshDb(async () => {
      const res = await proxyApp.request('/models', {
        headers: { Authorization: 'Bearer mc-not-a-real-key' },
      });
      expect(res.status).toBe(401);
    });
  });

  it('200 — valid client key lists models from an empty store', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const res = await proxyApp.request('/models', { headers: authHeaders(client) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.object).toBe('list');
      expect(body.data).toEqual([]);
    });
  });
});

// Keep the imported constants referenced so the import stays honest as slices grow.
void DISCOVERY_CACHE_CONSTANTS;
