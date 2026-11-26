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

describe('GET /v1/models — direct routes and unknown limits', () => {
  it('lists discovered catalogue models as direct {provider}/{model} routes', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, {
        name: 'go',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'go-key',
      });
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(
          catalogueBody([
            { id: 'kimi-k3', object: 'model', created: 1730000000, owned_by: 'opencode', limit: limit(262144, undefined, 32768) },
            { id: 'gpt-5.6-sol', object: 'model', created: 1730000001, owned_by: 'opencode', limit: limit(524288, undefined, 65536) },
          ])
        )
      );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/models', { headers: authHeaders(client) });
      expect(res.status).toBe(200);
      const body = await res.json();

      const kimi = body.data.find((m: { id: string }) => m.id === 'go/kimi-k3');
      expect(kimi).toBeDefined();
      expect(kimi.ownedBy).toBe('go');
      expect(kimi.modelPath).toBe('kimi-k3');
      expect(kimi.created).toBe(1730000000);
      expect(kimi.limits).toEqual({
        context: { status: 'discovered', value: 262144 },
        input: { status: 'unknown' },
        output: { status: 'discovered', value: 32768 },
      });

      const sol = body.data.find((m: { id: string }) => m.id === 'go/gpt-5.6-sol');
      expect(sol).toBeDefined();
      expect(sol.limits).toEqual({
        context: { status: 'discovered', value: 524288 },
        input: { status: 'unknown' },
        output: { status: 'discovered', value: 65536 },
      });
    });
  });

  it('suppresses a direct spelling that a mapping intercepts, and lists that mapping instead', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const go = await makeUpstream(db, { name: 'go', baseUrl: 'https://api.example.com/v1', apiKey: 'go-key' });
      const other = await makeUpstream(db, { name: 'other', baseUrl: 'https://other.example.com/v1', apiKey: 'other-key' });
      // A mapping whose abstract name IS the direct spelling routes elsewhere.
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'go/kimi-k3', upstreamId: other.id, modelPath: 'remapped-model' });

      const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.startsWith('https://api.example.com')) {
          return jsonResponse(catalogueBody([
            { id: 'kimi-k3', object: 'model', limit: limit(262144) },
          ]));
        }
        if (urlStr.startsWith('https://other.example.com')) {
          return jsonResponse(catalogueBody([
            { id: 'remapped-model', object: 'model', limit: limit(1024) },
          ]));
        }
        throw new Error(`unexpected fetch: ${urlStr}`);
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/models', { headers: authHeaders(client) });
      const body = await res.json();

      // The alias (a mapping) is listed with its own route and limits.
      const alias = body.data.find((m: { id: string }) => m.id === 'go/kimi-k3');
      expect(alias).toBeDefined();
      expect(alias.ownedBy).toBe('other');
      expect(alias.modelPath).toBe('remapped-model');
      expect(alias.limits.context).toEqual({ status: 'discovered', value: 1024 });

      // The direct spelling must not appear a second time claiming the go route.
      expect(body.data.filter((m: { id: string }) => m.id === 'go/kimi-k3')).toHaveLength(1);
    });
  });

  it('lists a codex-mapped alias with unknown limits and never fetches a codex catalogue', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const codex = await makeUpstream(db, { name: 'codex', type: 'chatgpt-codex' });
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'sol', upstreamId: codex.id, modelPath: 'gpt-5.6-sol' });

      const fetchMock = vi.fn().mockRejectedValue(new Error('no catalogue expected'));
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/models', { headers: authHeaders(client) });
      expect(res.status).toBe(200);
      const body = await res.json();

      const alias = body.data.find((m: { id: string }) => m.id === 'sol');
      expect(alias).toBeDefined();
      expect(alias.ownedBy).toBe('codex');
      expect(alias.modelPath).toBe('gpt-5.6-sol');
      expect(alias.limits).toEqual({
        context: { status: 'unknown' },
        input: { status: 'unknown' },
        output: { status: 'unknown' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('lists an alias without a discoverable base URL as unknown, without fetching', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const blank = await makeUpstream(db, { name: 'blank', baseUrl: '' });
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'blank-model', upstreamId: blank.id, modelPath: 'x' });

      const fetchMock = vi.fn().mockRejectedValue(new Error('no catalogue expected'));
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/models', { headers: authHeaders(client) });
      expect(res.status).toBe(200);
      const body = await res.json();

      const alias = body.data.find((m: { id: string }) => m.id === 'blank-model');
      expect(alias).toBeDefined();
      expect(alias.limits).toEqual({
        context: { status: 'unknown' },
        input: { status: 'unknown' },
        output: { status: 'unknown' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('keeps an alias whose model is absent from the catalogue listed with unknown limits', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const upstream = await makeUpstream(db, { name: 'go', baseUrl: 'https://api.example.com/v1', apiKey: 'k' });
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'phantom', upstreamId: upstream.id, modelPath: 'not-in-catalogue' });

      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
      );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/models', { headers: authHeaders(client) });
      const body = await res.json();

      const alias = body.data.find((m: { id: string }) => m.id === 'phantom');
      expect(alias).toBeDefined();
      expect(alias.limits).toEqual({
        context: { status: 'unknown' },
        input: { status: 'unknown' },
        output: { status: 'unknown' },
      });
      // The catalogue model is still discoverable through its direct spelling.
      expect(body.data.find((m: { id: string }) => m.id === 'go/kimi-k3')).toBeDefined();
    });
  });

  it('drops invalid upstream limit values to unknown instead of caching them', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const upstream = await makeUpstream(db, { name: 'go', baseUrl: 'https://api.example.com/v1', apiKey: 'k' });
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'broken', upstreamId: upstream.id, modelPath: 'broken-limits' });

      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(
          catalogueBody([
            {
              id: 'broken-limits',
              object: 'model',
              limit: { context: 0, input: -5, output: 4096.5 },
            },
          ])
        )
      );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/models', { headers: authHeaders(client) });
      const body = await res.json();

      const alias = body.data.find((m: { id: string }) => m.id === 'broken');
      expect(alias.limits).toEqual({
        context: { status: 'unknown' },
        input: { status: 'unknown' },
        output: { status: 'unknown' },
      });
    });
  });
});

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

// Keep the imported constants referenced so tests can assert against them as slices grow.
void DISCOVERY_CACHE_CONSTANTS;
