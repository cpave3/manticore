import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withFreshDb } from '../helpers/db.js';
import { makeClient, makeUpstream } from '../helpers/factories.js';
import proxyApp from '../../src/routes/proxy.js';
import { getDb } from '../../src/db/client.js';
import {
  resetModelDiscoveryForTesting,
  DISCOVERY_CACHE_CONSTANTS,
} from '../../src/services/model-discovery.js';
import type { ClientSelect, UpstreamSelect } from '../../src/db/schema.js';

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

const T0 = 1_700_000_000_000;
const ONE_MINUTE = 60 * 1000;

/** Registers `go` with an alias `go-kimi` → `kimi-k3` and a controllable clock. */
async function setupAliasDb(overrides: Partial<UpstreamSelect> = {}) {
  const db = getDb();
  const client = await makeClient(db);
  const upstream = await makeUpstream(db, {
    name: 'go',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'go-key',
    ...overrides,
  });
  const { createMapping } = await import('../../src/services/model-mappings.js');
  createMapping({ abstractName: 'go-kimi', upstreamId: upstream.id, modelPath: 'kimi-k3' });
  return { client, upstream };
}

function findModel(body: { data: Array<{ id: string }> }, id: string) {
  return body.data.find((m) => m.id === id);
}

async function requestModels(client: ClientSelect) {
  const res = await proxyApp.request('/models', { headers: authHeaders(client) });
  expect(res.status).toBe(200);
  return res.json();
}

/** Lets kicked-off background refreshes settle before the next assertion. */
function flushBackground() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

describe('GET /v1/model-capabilities — discovered limits', () => {
  it('adds a discovered limits block while keeping the existing capability fields intact', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const upstream = await makeUpstream(db, {
        name: 'go',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'go-key',
      });
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'go-kimi', upstreamId: upstream.id, modelPath: 'kimi-k3' });

      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(
          catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144, 131072, 32768) }])
        )
      );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/model-capabilities?model=go-kimi', {
        headers: authHeaders(client),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      // The additive limits block, resolved through the same route as chat.
      expect(body.limits).toEqual({
        context: { status: 'discovered', value: 262144 },
        input: { status: 'discovered', value: 131072 },
        output: { status: 'discovered', value: 32768 },
      });
      // Existing capability consumers keep their fields unchanged.
      expect(body.schemaVersion).toBe(1);
      expect(body.modelId).toBe('kimi-k3');
      expect(body.requestedModel).toBe('go-kimi');
      expect(body.profile).toBe('unknown');
      expect(body.source).toBe('unknown');
      expect(typeof body.fingerprint).toBe('string');
      expect(body.settings.thinking.status).toBe('unknown');
      expect(body.inputModalities).toBeUndefined();
    });
  });

  it('serves unknown limits for codex routes with no fetch, keeping the codex profile', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const codex = await makeUpstream(db, { name: 'codex', type: 'chatgpt-codex' });
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'sol', upstreamId: codex.id, modelPath: 'gpt-5.6-sol' });

      const fetchMock = vi.fn().mockRejectedValue(new Error('no catalogue expected'));
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const res = await proxyApp.request('/model-capabilities?model=sol', {
        headers: authHeaders(client),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.limits).toEqual({
        context: { status: 'unknown' },
        input: { status: 'unknown' },
        output: { status: 'unknown' },
      });
      expect(body.profile).toBe('codex');
      expect(body.settings.reasoningEffort.values).toContain('max');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('keeps the capability fingerprint stable while discovered limits change', async () => {
    await withFreshDb(async () => {
      const { client } = await setupAliasDb();
      const dateSpy = vi.spyOn(Date, 'now');
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
        );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const caps = () =>
        proxyApp.request('/model-capabilities?model=go-kimi', { headers: authHeaders(client) });

      dateSpy.mockReturnValue(T0);
      const first = await (await caps()).json();
      expect(first.limits.context).toEqual({ status: 'discovered', value: 262144 });

      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 1000);
      fetchMock.mockResolvedValue(
        jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(999999) }]))
      );
      const second = await (await caps()).json();
      // Fresh values exist, so this response serves last-known and refreshes
      // behind itself.
      expect(second.limits.context).toEqual({ status: 'discovered', value: 262144 });
      expect(second.fingerprint).toBe(first.fingerprint);
      await flushBackground();

      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 2000);
      const third = await (await caps()).json();
      expect(third.limits.context).toEqual({ status: 'discovered', value: 999999 });
      // Limits are additive discovery data: the capabilities fingerprint a
      // settings consumer keys on does not move with them.
      expect(third.fingerprint).toBe(first.fingerprint);
    });
  });
});

describe('GET /v1/models — discovery cache behaviour', () => {
  it('throttles: one catalogue fetch serves every request inside the refresh interval', async () => {
    await withFreshDb(async () => {
      const { client } = await setupAliasDb();
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144, 131072, 32768) }]))
      );
      const dateSpy = vi.spyOn(Date, 'now');
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      dateSpy.mockReturnValue(T0);
      const first = await requestModels(client);
      expect(first.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context).toEqual({
        status: 'discovered',
        value: 262144,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      dateSpy.mockReturnValue(T0 + ONE_MINUTE);
      const second = await requestModels(client);
      expect(second.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context).toEqual({
        status: 'discovered',
        value: 262144,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('refreshes behind the response after the refresh interval and serves last-known values first', async () => {
    await withFreshDb(async () => {
      const { client } = await setupAliasDb();
      const dateSpy = vi.spyOn(Date, 'now');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
        )
        .mockResolvedValue(
          jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(999999) }]))
        );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      dateSpy.mockReturnValue(T0);
      await requestModels(client);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 1000);
      const refreshedWindow = await requestModels(client);
      // The response is served immediately from last-known values…
      expect(
        refreshedWindow.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context
      ).toEqual({ status: 'discovered', value: 262144 });
      // …while the refresh runs behind it.
      await flushBackground();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 2000);
      const afterRefresh = await requestModels(client);
      expect(afterRefresh.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context).toEqual({
        status: 'discovered',
        value: 999999,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps last-known limits when a refresh fails, and throttles the failing upstream', async () => {
    await withFreshDb(async () => {
      const { client } = await setupAliasDb();
      const dateSpy = vi.spyOn(Date, 'now');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
        )
        .mockRejectedValue(new Error('upstream down'));
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      dateSpy.mockReturnValue(T0);
      const first = await requestModels(client);
      expect(first.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context).toEqual({
        status: 'discovered',
        value: 262144,
      });

      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 1000);
      const second = await requestModels(client);
      expect(second.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context).toEqual({
        status: 'discovered',
        value: 262144,
      });
      await flushBackground();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Inside the throttle window the failing upstream is not retried.
      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 2000);
      const third = await requestModels(client);
      expect(third.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context).toEqual({
        status: 'discovered',
        value: 262144,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('serves unknown once a discovery exceeds its max verified age, and recovers on the next success', async () => {
    await withFreshDb(async () => {
      const { client } = await setupAliasDb();
      const dateSpy = vi.spyOn(Date, 'now');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
        )
        .mockRejectedValueOnce(new Error('upstream down'))
        .mockResolvedValue(
          jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(524288) }]))
        );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      dateSpy.mockReturnValue(T0);
      const first = await requestModels(client);
      expect(first.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context.status).toBe('discovered');

      // Past the max verified age, a failed refresh leaves the limit explicitly
      // unknown instead of resurrecting the stale value.
      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.maxStaleMs + 1000);
      const expired = await requestModels(client);
      expect(expired.data.find((m: { id: string }) => m.id === 'go-kimi').limits).toEqual({
        context: { status: 'unknown' },
        input: { status: 'unknown' },
        output: { status: 'unknown' },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // One refresh interval later the upstream answers again and the same
      // request discovers the fresh value.
      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.maxStaleMs + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 1000);
      const recovered = await requestModels(client);
      expect(recovered.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context).toEqual({
        status: 'discovered',
        value: 524288,
      });
    });
  });

  it('single-flights concurrent cold requests into one catalogue fetch', async () => {
    await withFreshDb(async () => {
      const { client } = await setupAliasDb();
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(T0);

      let resolveFetch!: (body: Response) => void;
      const pending = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      const fetchMock = vi.fn().mockReturnValue(pending);
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const first = proxyApp.request('/models', { headers: authHeaders(client) });
      const second = proxyApp.request('/models', { headers: authHeaders(client) });
      await flushBackground();

      resolveFetch(
        jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
      );
      const [resA, resB] = await Promise.all([first, second]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      for (const res of [resA, resB]) {
        const body = await res.json();
        expect(body.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context).toEqual({
          status: 'discovered',
          value: 262144,
        });
      }
    });
  });

  it('shares one catalogue between upstream records with the same endpoint and credentials', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const shared = { baseUrl: 'https://api.example.com/v1', apiKey: 'shared-key' };
      await makeUpstream(db, { name: 'go', ...shared });
      await makeUpstream(db, { name: 'go-mirror', ...shared });
      const { createMapping } = await import('../../src/services/model-mappings.js');
      const go = await import('../../src/services/upstreams.js');
      void go;
      const upstreams = go.listRawUpstreams();
      createMapping({ abstractName: 'a-go', upstreamId: upstreams.find((u) => u.name === 'go')!.id, modelPath: 'kimi-k3' });
      createMapping({ abstractName: 'a-mirror', upstreamId: upstreams.find((u) => u.name === 'go-mirror')!.id, modelPath: 'kimi-k3' });

      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
      );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const body = await requestModels(client);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(body.data.find((m: { id: string }) => m.id === 'a-go').limits.context).toEqual({
        status: 'discovered',
        value: 262144,
      });
      expect(body.data.find((m: { id: string }) => m.id === 'a-mirror').limits.context).toEqual({
        status: 'discovered',
        value: 262144,
      });
    });
  });

  it('isolates catalogues by credential and by static headers', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'go', baseUrl: 'https://api.example.com/v1', apiKey: 'key-a' });
      await makeUpstream(db, { name: 'go2', baseUrl: 'https://api.example.com/v1', apiKey: 'key-b' });
      await makeUpstream(db, {
        name: 'go3',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key-a',
        headers: JSON.stringify({ 'X-Static': 'differentiates' }),
      });

      const fetchMock = vi.fn().mockImplementation(async () =>
        jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
      );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      await requestModels(client);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const auths = fetchMock.mock.calls.map(
        ([, init]: unknown[]) => new Headers((init as { headers: Headers }).headers).get('Authorization')
      );
      expect(auths[0]).toBe('Bearer key-a');
      expect(auths[1]).toBe('Bearer key-b');
      expect(auths[2]).toBe('Bearer key-a');
      expect(new Headers((fetchMock.mock.calls[2][1] as { headers: Headers }).headers).get('X-Static')).toBe(
        'differentiates'
      );
    });
  });

  it('re-discovers through the new route when a mapping is repointed', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const { client, upstream } = await setupAliasDb();
      const other = await makeUpstream(db, {
        name: 'other',
        baseUrl: 'https://other.example.com/v1',
        apiKey: 'other-key',
      });
      const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.startsWith('https://api.example.com')) {
          return jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]));
        }
        if (urlStr.startsWith('https://other.example.com')) {
          return jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(111) }]));
        }
        throw new Error(`unexpected fetch: ${urlStr}`);
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const before = await requestModels(client);
      expect(before.data.find((m: { id: string }) => m.id === 'go-kimi').limits.context.value).toBe(262144);

      const { updateMapping, listMappings } = await import('../../src/services/model-mappings.js');
      const mapping = listMappings().find((m) => m.abstractName === 'go-kimi')!;
      updateMapping(mapping.id, { upstreamId: other.id, modelPath: 'kimi-k3' });

      const after = await requestModels(client);
      const alias = after.data.find((m: { id: string }) => m.id === 'go-kimi');
      expect(alias.ownedBy).toBe('other');
      expect(alias.limits.context).toEqual({ status: 'discovered', value: 111 });
      // The old upstream's catalogue is never consulted for the remapped alias.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1][0])).toBe('https://other.example.com/v1/models');
      void upstream;
    });
  });

  it('keeps last-known values for limit fields a newer catalogue omits, without renewing their age', async () => {
    await withFreshDb(async () => {
      const { client } = await setupAliasDb();
      const dateSpy = vi.spyOn(Date, 'now');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144, undefined, 32768) }])
          )
        )
        .mockResolvedValue(
          // Newer catalogue re-verifies context only; input/output are omitted.
          jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(999999) }]))
        );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      dateSpy.mockReturnValue(T0);
      await requestModels(client);

      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 1000);
      const omitted = await requestModels(client);
      await flushBackground();
      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 2000);
      const afterOmission = await requestModels(client);
      const limits = afterOmission.data.find((m: { id: string }) => m.id === 'go-kimi').limits;
      expect(limits.context).toEqual({ status: 'discovered', value: 999999 });
      expect(limits.output).toEqual({ status: 'discovered', value: 32768 }); // last known, retained

      // The retained fields keep their original discovery age: once that
      // passes max verified age they turn unknown even though the upstream
      // keeps omitting them.
      dateSpy.mockReturnValue(
        T0 + DISCOVERY_CACHE_CONSTANTS.maxStaleMs + DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs + 1000
      );
      const aged = await requestModels(client);
      const agedLimits = aged.data.find((m: { id: string }) => m.id === 'go-kimi').limits;
      expect(agedLimits.context).toEqual({ status: 'discovered', value: 999999 });
      expect(agedLimits.output).toEqual({ status: 'unknown' });
      void omitted;
    });
  });

  it('waits for the refresh and recovers a fully expired direct catalogue on the same request', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      // No mappings: this upstream is reachable only through direct routes.
      await makeUpstream(db, { name: 'go', baseUrl: 'https://api.example.com/v1', apiKey: 'k' });
      const dateSpy = vi.spyOn(Date, 'now');

      let resolveRefresh!: (body: Response) => void;
      const pendingRefresh = new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(262144) }]))
        )
        .mockImplementationOnce(() => pendingRefresh);
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      dateSpy.mockReturnValue(T0);
      const first = await requestModels(client);
      expect(first.data.find((m: { id: string }) => m.id === 'go/kimi-k3').limits.context).toEqual({
        status: 'discovered',
        value: 262144,
      });

      // Past the max verified age, with the healthy upstream's refresh still
      // in flight: the request waits for it instead of answering unknown.
      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.maxStaleMs + 1000);
      const pendingResponse = proxyApp.request('/models', { headers: authHeaders(client) });
      await flushBackground();
      resolveRefresh(
        jsonResponse(catalogueBody([{ id: 'kimi-k3', object: 'model', limit: limit(524288) }]))
      );
      const body = await (await pendingResponse).json();
      expect(body.data.find((m: { id: string }) => m.id === 'go/kimi-k3').limits.context).toEqual({
        status: 'discovered',
        value: 524288,
      });
    });
  });

  it('lists a mapping whose name collides with its direct route exactly once, as the alias', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const go = await makeUpstream(db, { name: 'go', baseUrl: 'https://api.example.com/v1', apiKey: 'k' });
      // The alias name IS the direct spelling, and it resolves to the same route.
      const { createMapping } = await import('../../src/services/model-mappings.js');
      createMapping({ abstractName: 'go/kimi', upstreamId: go.id, modelPath: 'kimi' });

      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(catalogueBody([{ id: 'kimi', object: 'model', limit: limit(262144) }]))
      );
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      const body = await requestModels(client);
      const entries = body.data.filter((m: { id: string }) => m.id === 'go/kimi');
      expect(entries).toHaveLength(1);
      expect(entries[0].ownedBy).toBe('go');
      expect(entries[0].modelPath).toBe('kimi');
      expect(entries[0].limits.context).toEqual({ status: 'discovered', value: 262144 });
    });
  });

  it('ages a disappeared catalogue model out of the direct listing', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'go', baseUrl: 'https://api.example.com/v1', apiKey: 'k' });
      const dateSpy = vi.spyOn(Date, 'now');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            catalogueBody([
              { id: 'm1', object: 'model', limit: limit(262144) },
              { id: 'm2', object: 'model', limit: limit(128) },
            ])
          )
        )
        .mockResolvedValue(jsonResponse(catalogueBody([{ id: 'm2', object: 'model', limit: limit(128) }])));
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      dateSpy.mockReturnValue(T0);
      const first = await requestModels(client);
      expect(first.data.find((m: { id: string }) => m.id === 'go/m1')).toBeDefined();
      expect(first.data.find((m: { id: string }) => m.id === 'go/m2')).toBeDefined();

      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.maxStaleMs + 1000);
      await requestModels(client); // triggers the refresh that drops m1
      await flushBackground();
      dateSpy.mockReturnValue(T0 + DISCOVERY_CACHE_CONSTANTS.maxStaleMs + 2000);
      const after = await requestModels(client);
      expect(after.data.find((m: { id: string }) => m.id === 'go/m1')).toBeUndefined();
      expect(after.data.find((m: { id: string }) => m.id === 'go/m2')).toBeDefined();
    });
  });
});
