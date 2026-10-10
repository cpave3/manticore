import { describe, it, expect } from 'vitest';
import { withFreshDb } from '../helpers/db.js';
import { makeClient } from '../helpers/factories.js';
import { createApp } from '../../src/server.js';
import { getDb } from '../../src/db/client.js';

type App = ReturnType<typeof createApp>;

function report(app: App, apiKey: string | null, body: unknown, headers: Record<string, string> = {}) {
  return app.request('/v1/usage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function eventLog(app: App) {
  const res = await app.request('/api/dashboard/events?sortBy=createdAt&sortDir=asc');
  return (await res.json()).items;
}

describe('reported usage', () => {
  it('records a request Manticore did not proxy, attributed to the reporting Client', async () => {
    await withFreshDb(async () => {
      const client = await makeClient(getDb(), { name: 'claude-code' });
      const app = createApp();

      const res = await report(
        app,
        client.apiKey,
        {
          records: [
            {
              model: 'claude-opus-5-5',
              upstream: 'anthropic',
              prompt_tokens: 1200,
              completion_tokens: 300,
              latency_ms: 4200,
              time_to_first_token_ms: 800,
              finish_reason: 'end_turn',
              started_at: 1790000000000,
            },
          ],
        },
        { 'X-Session-Id': 'task-1' },
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ accepted: 1, duplicates: 0 });
      expect(await eventLog(app)).toEqual([
        expect.objectContaining({
          clientId: client.id,
          clientName: 'claude-code',
          modelId: 'claude-opus-5-5',
          upstreamId: null,
          upstreamName: 'anthropic',
          sessionId: 'task-1',
          promptTokens: 1200,
          completionTokens: 300,
          totalTokens: 1500,
          latencyMs: 4200,
          timeToFirstTokenMs: 800,
          finishReason: 'end_turn',
          status: 'success',
          createdAt: new Date(1790000000000).toISOString(),
        }),
      ]);
    });
  });

  it('keeps how much of the prompt the upstream cache served or stored', async () => {
    await withFreshDb(async () => {
      const client = await makeClient(getDb());
      const app = createApp();

      const res = await report(app, client.apiKey, {
        records: [
          {
            model: 'claude-opus-5-5',
            prompt_tokens: 1200,
            completion_tokens: 300,
            cache_read_tokens: 1000,
            cache_creation_tokens: 150,
          },
          { model: 'claude-haiku-5-5', prompt_tokens: 40, completion_tokens: 5 },
        ],
      });

      expect(res.status).toBe(200);
      const items = await eventLog(app);
      // Cached tokens are part of the prompt, not added to it.
      expect(items.find((item: { modelId: string }) => item.modelId === 'claude-opus-5-5')).toEqual(
        expect.objectContaining({
          promptTokens: 1200,
          totalTokens: 1500,
          cacheReadTokens: 1000,
          cacheCreationTokens: 150,
        }),
      );
      // A report that says nothing about the cache leaves it unknown.
      expect(items.find((item: { modelId: string }) => item.modelId === 'claude-haiku-5-5')).toEqual(
        expect.objectContaining({ cacheReadTokens: null, cacheCreationTokens: null }),
      );
    });
  });

  it('refuses a report without a Client API key and records nothing', async () => {
    await withFreshDb(async () => {
      await makeClient(getDb());
      const app = createApp();
      const body = { records: [{ model: 'claude-opus-5-5', prompt_tokens: 10, completion_tokens: 1 }] };

      expect((await report(app, null, body)).status).toBe(401);
      expect((await report(app, 'mc_not-a-key', body)).status).toBe(401);
      expect(await eventLog(app)).toEqual([]);
    });
  });

  it.each([
    ['a body that is not JSON', '{not json'],
    ['no records', { records: [] }],
    ['a record without a model', { records: [{ prompt_tokens: 10, completion_tokens: 1 }] }],
    ['a negative token count', { records: [{ model: 'm', prompt_tokens: -1, completion_tokens: 1 }] }],
    [
      'more cached tokens than the prompt holds',
      { records: [{ model: 'm', prompt_tokens: 10, completion_tokens: 1, cache_read_tokens: 8, cache_creation_tokens: 3 }] },
    ],
  ])('rejects %s as a bad request', async (_name, body) => {
    await withFreshDb(async () => {
      const client = await makeClient(getDb());
      const app = createApp();

      const res = await report(app, client.apiKey, body);

      expect(res.status).toBe(400);
      expect((await res.json()).error.type).toBe('invalid_request_error');
    });
  });

  it('records none of a report when one of its records is invalid', async () => {
    await withFreshDb(async () => {
      const client = await makeClient(getDb());
      const app = createApp();

      const res = await report(app, client.apiKey, {
        records: [
          { model: 'claude-opus-5-5', prompt_tokens: 10, completion_tokens: 1 },
          { model: 'claude-opus-5-5', prompt_tokens: 'many', completion_tokens: 1 },
        ],
      });

      expect(res.status).toBe(400);
      // The message names the record at fault so the reporter can be fixed.
      expect((await res.json()).error.message).toContain('records.1.prompt_tokens');
      expect(await eventLog(app)).toEqual([]);
    });
  });

  it('does not count a request twice when its report is sent again', async () => {
    await withFreshDb(async () => {
      const client = await makeClient(getDb());
      const app = createApp();
      const request = (id: string) => ({ id, model: 'claude-opus-5-5', prompt_tokens: 10, completion_tokens: 1 });

      const first = await report(app, client.apiKey, { records: [request('turn-1:0'), request('turn-1:1')] });
      // The reporter never saw the answer, so it sends the second again with what came next.
      const again = await report(app, client.apiKey, { records: [request('turn-1:1'), request('turn-1:2')] });

      expect(await first.json()).toEqual({ accepted: 2, duplicates: 0 });
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ accepted: 1, duplicates: 1 });
      expect(await eventLog(app)).toHaveLength(3);
    });
  });

  it("keeps one Client's record ids apart from another's", async () => {
    await withFreshDb(async () => {
      const one = await makeClient(getDb(), { name: 'one' });
      const other = await makeClient(getDb(), { name: 'other' });
      const app = createApp();
      const records = [{ id: 'turn-1:0', model: 'claude-opus-5-5', prompt_tokens: 10, completion_tokens: 1 }];

      await report(app, one.apiKey, { records });
      const res = await report(app, other.apiKey, { records });

      expect(await res.json()).toEqual({ accepted: 1, duplicates: 0 });
      expect((await eventLog(app)).map((item: { clientName: string }) => item.clientName).sort()).toEqual(['one', 'other']);
    });
  });

  it('shows reported requests in the upstream breakdown under the upstream they name', async () => {
    await withFreshDb(async () => {
      const client = await makeClient(getDb());
      const app = createApp();
      await report(app, client.apiKey, {
        records: [
          { model: 'claude-opus-5-5', upstream: 'anthropic', prompt_tokens: 100, completion_tokens: 10 },
          { model: 'claude-haiku-5-5', upstream: 'anthropic', prompt_tokens: 20, completion_tokens: 2 },
        ],
      });

      const rows = await (await app.request('/api/dashboard/breakdown/upstream')).json();

      expect(rows).toEqual([
        expect.objectContaining({ key: 'anthropic', label: 'anthropic', requests: 2, promptTokens: 120, completionTokens: 12 }),
      ]);
    });
  });
});
