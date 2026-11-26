import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/server.js';
import { withFreshDb } from '../helpers/db.js';

vi.mock('../../src/tokenizer/index.js', () => ({
  countPromptTokens: vi.fn().mockResolvedValue(null),
  countCompletionTokens: vi.fn().mockResolvedValue(null),
  getStreamCounter: vi.fn().mockResolvedValue(null),
}));

async function withUpstream(
  run: (baseUrl: string, received: IncomingMessage['headers'][]) => Promise<void>,
) {
  const received: IncomingMessage['headers'][] = [];
  const server = createServer((req, res) => {
    req.resume();
    received.push(req.headers);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, received);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

async function configure(baseUrl: string) {
  const app = createApp();
  const json = (body: object) => ({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const client = await (await app.request('/api/clients', json({ name: 'test-client' }))).json();
  const upstream = await app.request('/api/upstreams', json({
    name: 'test-upstream', baseUrl, apiKey: 'local-test-key',
    headers: { 'x-conversation': '{sessionId}', 'x-fixed': 'fixed-value', 'x-literal': 'prefix-{sessionId}' },
  }));
  expect(upstream.status).toBe(201);
  return (sessionId?: string) => app.request('/v1/chat/completions', {
    ...json({ model: 'test-upstream/test-model', messages: [{ role: 'user', content: 'Hello' }] }),
    headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${client.apiKey}`,
      ...(sessionId === undefined ? {} : { 'X-Session-Id': sessionId }),
    },
  });
}

describe('upstream session header templates through /v1/chat/completions', () => {
  it('expands the normalized session identity, stays stable on repeat requests, and preserves fixed headers', async () => {
    await withFreshDb(async () => {
      await withUpstream(async (baseUrl, received) => {
        const request = await configure(baseUrl);
        for (const sessionId of [' session-a ', 'session-a', 'session-b']) {
          const response = await request(sessionId);
          expect(response.status).toBe(200);
          expect((await response.json()).choices[0].message.content).toBe('Hello');
        }
        expect(received.map((headers) => headers['x-conversation'])).toEqual(['session-a', 'session-a', 'session-b']);
        for (const headers of received) {
          expect(headers['x-fixed']).toBe('fixed-value');
          expect(headers['x-literal']).toBe('prefix-{sessionId}');
          expect(headers.authorization).toBe('Bearer local-test-key');
        }
      });
    });
  });

  it.each([undefined, '   '])('returns 400 before forwarding when X-Session-Id is missing or blank (%s)', async (sessionId) => {
    await withFreshDb(async () => {
      await withUpstream(async (baseUrl, received) => {
        const request = await configure(baseUrl);
        const response = await request(sessionId);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: {
          type: 'invalid_request_error',
          message: "Upstream 'test-upstream' requires X-Session-Id: send a stable conversation ID",
        } });
        expect(received).toHaveLength(0);
      });
    });
  });
});
