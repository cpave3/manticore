import { describe, it, expect, vi } from 'vitest';
import { withFreshDb } from '../helpers/db.js';
import { makeClient, makeUpstream } from '../helpers/factories.js';
import proxyApp from '../../src/routes/proxy.js';
import { getDb } from '../../src/db/client.js';
import * as schema from '../../src/db/schema.js';
import { logRecords } from '../../src/db/schema.js';

vi.mock('../../src/tokenizer/index.js', () => ({
  countPromptTokens: vi.fn().mockResolvedValue(4),
  countCompletionTokens: vi.fn().mockResolvedValue(2),
  getStreamCounter: vi.fn().mockResolvedValue({
    feed: vi.fn(),
    total: vi.fn().mockReturnValue(2),
  }),
}));

function mockFetchOk(body: object): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function mockFetchError(status: number, body: object): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
}

async function getLogRows(db: ReturnType<typeof getDb>) {
  return db.select().from(logRecords).orderBy(logRecords.createdAt).all();
}

describe('proxy integration', () => {
  it('400 — missing model (valid auth, body {messages:[]})', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client.apiKey}`,
        },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('400 — bad model id (no slash)', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client.apiKey}`,
        },
        body: JSON.stringify({ model: 'no-slash', messages: [] }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'invalid_request_error');
    });
  });

  it('404 — unknown provider writes LogRecord with status=error, statusCode=404', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client.apiKey}`,
        },
        body: JSON.stringify({ model: 'provider/foo', messages: [] }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'not_found');

      const rows = await getLogRows(db);
      const row = rows.find((r) => r.modelId === 'provider/foo');
      expect(row).toBeDefined();
      expect(row!.status).toBe('error');
      expect(row!.statusCode).toBe(404);
    });
  });

  it('non-streaming success — logs tokens, rewrites model, forwards upstream key', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const upstream = await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com', apiKey: 'up-secret' });

      const fetchMock = mockFetchOk({
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      });
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
          },
          body: JSON.stringify({ model: 'fake/gpt-4', messages: [{ role: 'user', content: 'hello' }] }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        });

        // Assert fetch was called with rewritten model and upstream key
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
        const sentBody = JSON.parse(init.body);
        expect(sentBody.model).toBe('gpt-4');
        const headers = new Headers(init.headers as Record<string, string>);
        expect(headers.get('Authorization')).toBe('Bearer up-secret');

        // Assert LogRecord
        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'fake/gpt-4');
        expect(row).toBeDefined();
        expect(row!.status).toBe('success');
        expect(row!.promptTokens).toBe(10);
        expect(row!.completionTokens).toBe(5);
        expect(row!.totalTokens).toBe(15);
        expect(row!.upstreamName).toBe('fake');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('non-streaming upstream error — returns 502 and logs error', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

      const fetchMock = mockFetchError(502, { error: { message: 'bad gateway' } });
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
          },
          body: JSON.stringify({ model: 'fake/gpt-4', messages: [{ role: 'user', content: 'hello' }] }),
        });

        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toHaveProperty('message', 'bad gateway');

        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'fake/gpt-4');
        expect(row).toBeDefined();
        expect(row!.status).toBe('error');
        expect(row!.statusCode).toBe(502);
        expect(row!.errorMessage).toBe('bad gateway');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('non-streaming fetch throws — returns 502 OpenAI-style error and logs', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

      const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
          },
          body: JSON.stringify({ model: 'fake/gpt-4', messages: [{ role: 'user', content: 'hello' }] }),
        });

        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toHaveProperty('type', 'api_error');
        expect(body.error.message).toContain('Upstream request failed');

        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'fake/gpt-4');
        expect(row).toBeDefined();
        expect(row!.status).toBe('error');
        expect(row!.statusCode).toBe(502);
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('streaming success — text/event-stream, passes through, logs on completion', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

      const stream = sseStream([
        'data: {"choices":[{"delta":{"content":"a"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"b"}}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}',
        '',
        'data: [DONE]',
        '',
      ]);

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
          },
          body: JSON.stringify({ model: 'fake/gpt-4', messages: [{ role: 'user', content: 'hi' }], stream: true }),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/event-stream');

        // Read all bytes to let the TransformStream finish
        const reader = res.body!.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        const decoder = new TextDecoder();
        const text = chunks.map((c) => decoder.decode(c)).join('');
        expect(text).toContain('data:');
        expect(text).toContain('[DONE]');

        // Give finalize hook time to flush after stream closes
        await new Promise((r) => setTimeout(r, 300));

        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'fake/gpt-4');
        expect(row).toBeDefined();
        expect(row!.status).toBe('success');
        expect(row!.finishReason).toBe('stop');
        expect(row!.promptTokens).toBe(2);
        expect(row!.completionTokens).toBe(2);
        expect(row!.totalTokens).toBe(4);
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('manticore/{abstract} resolves via model mapping and forwards mapped modelPath', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const upstream = await makeUpstream(db, { name: 'synthetic', baseUrl: 'https://api.synthetic.new', apiKey: 'syn-key' });

      await db.insert(schema.modelMappings).values({
        id: 'test-mapping-id',
        abstractName: 'kimi-k2.5',
        upstreamId: upstream.id,
        modelPath: 'kimi-k2.5-202501',
        priority: 1,
        createdAt: new Date(),
      });

      const fetchMock = mockFetchOk({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      });
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
          },
          body: JSON.stringify({
            model: 'manticore/kimi-k2.5',
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.choices[0].message.content).toBe('ok');

        // Assert fetch was called with the mapped modelPath
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
        const sentBody = JSON.parse(init.body);
        expect(sentBody.model).toBe('kimi-k2.5-202501');

        // Assert LogRecord uses the original abstract model ID
        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'manticore/kimi-k2.5');
        expect(row).toBeDefined();
        expect(row!.upstreamName).toBe('synthetic');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('manticore/{abstract} unknown mapping falls through to direct provider route', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const res = await proxyApp.request('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client.apiKey}`,
        },
        body: JSON.stringify({
          model: 'manticore/unknown-model',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      // Strips prefix → "unknown-model" not in mappings → falls through →
      // parseModelId("manticore/unknown-model") → provider="manticore" → upstream not found
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toHaveProperty('type', 'not_found');
    });
  });

  it('bare abstract model name resolves via mapping', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      const upstream = await makeUpstream(db, { name: 'synthetic', baseUrl: 'https://api.synthetic.new', apiKey: 'syn-key' });

      await db.insert(schema.modelMappings).values({
        id: 'test-mapping-id-2',
        abstractName: 'kimi-k2.5',
        upstreamId: upstream.id,
        modelPath: 'kimi-k2.5-202501',
        priority: 1,
        createdAt: new Date(),
      });

      const fetchMock = mockFetchOk({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      });
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
          },
          body: JSON.stringify({
            model: 'kimi-k2.5',
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
        const sentBody = JSON.parse(init.body);
        expect(sentBody.model).toBe('kimi-k2.5-202501');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('non-streaming success with X-Session-Id — sessionId in LogRecord', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

      const fetchMock = mockFetchOk({
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      });
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
            'X-Session-Id': 'thread-42',
          },
          body: JSON.stringify({ model: 'fake/gpt-4', messages: [{ role: 'user', content: 'hello' }] }),
        });

        expect(res.status).toBe(200);

        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'fake/gpt-4');
        expect(row).toBeDefined();
        expect(row!.sessionId).toBe('thread-42');
        expect(row!.status).toBe('success');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('non-streaming upstream error with X-Session-Id — sessionId in LogRecord', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

      const fetchMock = mockFetchError(502, { error: { message: 'bad gateway' } });
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
            'X-Session-Id': 'thread-43',
          },
          body: JSON.stringify({ model: 'fake/gpt-4', messages: [{ role: 'user', content: 'hello' }] }),
        });

        expect(res.status).toBe(502);

        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'fake/gpt-4');
        expect(row).toBeDefined();
        expect(row!.sessionId).toBe('thread-43');
        expect(row!.status).toBe('error');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('streaming success with X-Session-Id — sessionId in LogRecord', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

      const stream = sseStream([
        'data: {"choices":[{"delta":{"content":"a"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"b"}}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}',
        '',
        'data: [DONE]',
        '',
      ]);

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
            'X-Session-Id': 'thread-44',
          },
          body: JSON.stringify({ model: 'fake/gpt-4', messages: [{ role: 'user', content: 'hi' }], stream: true }),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/event-stream');

        const reader = res.body!.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }

        await new Promise((r) => setTimeout(r, 300));

        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'fake/gpt-4');
        expect(row).toBeDefined();
        expect(row!.sessionId).toBe('thread-44');
        expect(row!.status).toBe('success');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('request without X-Session-Id — sessionId is null in LogRecord', async () => {
    await withFreshDb(async () => {
      const db = getDb();
      const client = await makeClient(db);
      await makeUpstream(db, { name: 'fake', baseUrl: 'http://example.com' });

      const fetchMock = mockFetchOk({
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      });
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

      try {
        const res = await proxyApp.request('/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiKey}`,
          },
          body: JSON.stringify({ model: 'fake/gpt-4', messages: [{ role: 'user', content: 'hello' }] }),
        });

        expect(res.status).toBe(200);

        const rows = await getLogRows(db);
        const row = rows.find((r) => r.modelId === 'fake/gpt-4');
        expect(row).toBeDefined();
        expect(row!.sessionId).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('reject /v1/embeddings — 404 mentioning chat completions', async () => {
    await withFreshDb(async () => {
      const res = await proxyApp.request('/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.message).toContain('chat/completions');
    });
  });
});
