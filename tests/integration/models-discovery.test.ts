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

describe('GET /v1/models — alias limit discovery', () => {
  it('lists a mapped alias with limits discovered from the upstream catalogue', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const upstream = await makeUpstream(db, {
        name: 'go',
        baseUrl: 'https://opencode.ai/inference/go/openai/v1',
        apiKey: 'go-key',
        headers: JSON.stringify({
          'x-opencode-session': '{sessionId}',
          'User-Agent': 'manticore',
        }),
      });
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'go-kimi', upstreamId: upstream.id, modelPath: 'kimi-k3' });

      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(
          catalogueBody([
            {
              id: 'kimi-k3',
              object: 'model',
              created: 1730000000,
              owned_by: 'opencode',
              limit: limit(262144, 131072, 32768),
            },
          ])
        )
      );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/models', { headers: authHeaders(client) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.object).toBe('list');

      const alias = body.data.find((m: { id: string }) => m.id === 'go-kimi');
      expect(alias).toBeDefined();
      expect(alias.modelPath).toBe('kimi-k3');
      expect(alias.ownedBy).toBe('go');
      expect(alias.limits).toEqual({
        context: { status: 'discovered', value: 262144 },
        input: { status: 'discovered', value: 131072 },
        output: { status: 'discovered', value: 32768 },
      });

      // One catalogue fetch: chat base URL + /models, upstream credential,
      // static headers forwarded, per-session header omitted.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
      expect(url).toBe('https://opencode.ai/inference/go/openai/v1/models');
      expect(init.method).toBe('GET');
      const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
      expect(headers.get('Authorization')).toBe('Bearer go-key');
      expect(headers.get('User-Agent')).toBe('manticore');
      expect(headers.get('x-opencode-session')).toBeNull();
    });
  });
});
