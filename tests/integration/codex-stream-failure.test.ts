import { describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/db/client.js';
import { logRecords } from '../../src/db/schema.js';
import proxyApp from '../../src/routes/proxy.js';
import { withFreshDb } from '../helpers/db.js';
import { makeClient, makeUpstream } from '../helpers/factories.js';

// A Codex upstream that fails partway must reach the client as an error,
// never as an empty answer that looks finished.

vi.mock('../../src/services/chatgpt-codex-auth.js', () => ({
  getFreshChatGPTCodexCredentials: async () => ({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accountId: 'acc_123',
    expiresAt: new Date(Date.now() + 3600_000),
  }),
}));

vi.mock('../../src/tokenizer/index.js', () => ({
  countPromptTokens: vi.fn().mockResolvedValue(4),
  countCompletionTokens: vi.fn().mockResolvedValue(2),
  getStreamCounter: vi.fn().mockResolvedValue({ feed: vi.fn(), total: vi.fn().mockReturnValue(0) }),
}));

/** Codex SSE events, as the Responses API sends them (no [DONE]). */
function codexStream(events: unknown[]): Response {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function chat(stream: boolean, upstreamEvents: unknown[]) {
  const db = getDb();
  const client = await makeClient(db);
  await makeUpstream(db, { name: 'codex', type: 'chatgpt-codex' });
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(codexStream(upstreamEvents));
  try {
    const response = await proxyApp.request('/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${client.apiKey}`, 'Content-Type': 'application/json', 'X-Session-Id': 'AG-1' },
      body: JSON.stringify({ model: 'codex/gpt-5.6-sol', stream, messages: [{ role: 'user', content: 'run the tests' }] }),
    });
    const body = await response.text();
    // The request log is written when the stream finishes.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = db.select().from(logRecords).all();
    return { response, body, log: rows.at(-1) };
  } finally {
    fetchSpy.mockRestore();
  }
}

/** The JSON payloads of an OpenAI chat-completions SSE body. */
function chunks(body: string): Array<Record<string, any>> {
  return body
    .split('\n\n')
    .map((event) => event.replace(/^data: /, '').trim())
    .filter((data) => data && data !== '[DONE]')
    .map((data) => JSON.parse(data));
}

const failed = {
  type: 'response.failed',
  response: { status: 'failed', error: { code: 'server_error', message: 'An error occurred while processing your request.' } },
};

describe('Codex upstream failure while streaming', () => {
  it('sends the upstream error to the client instead of a finished, empty answer', async () => {
    await withFreshDb(async () => {
      const { response, body, log } = await chat(true, [{ type: 'response.created', response: { status: 'in_progress' } }, failed]);

      expect(response.status).toBe(200);
      const sent = chunks(body);
      expect(sent.some((chunk) => chunk.choices?.[0]?.finish_reason)).toBe(false);
      expect(sent.at(-1)).toEqual({
        error: { message: 'An error occurred while processing your request.', type: 'api_error', code: 'server_error' },
      });
      expect(body.trimEnd().endsWith('data: [DONE]')).toBe(true);
      expect(log).toMatchObject({
        status: 'error',
        sessionId: 'AG-1',
        errorMessage: 'An error occurred while processing your request.',
      });
    });
  });

  it.each([
    {
      label: 'an error event',
      events: [{ type: 'error', code: 'rate_limit_exceeded', message: 'Rate limit reached.' }],
      error: { message: 'Rate limit reached.', type: 'api_error', code: 'rate_limit_exceeded' },
    },
    {
      label: 'a stream that ends before the response does',
      events: [
        { type: 'response.created', response: { status: 'in_progress' } },
        { type: 'response.output_text.delta', delta: 'Running the tests' },
      ],
      error: { message: 'Codex stream ended before the response completed', type: 'api_error' },
    },
  ])('reports $label as an error', async ({ events, error }) => {
    await withFreshDb(async () => {
      const { body, log } = await chat(true, events);

      const sent = chunks(body);
      expect(sent.some((chunk) => chunk.choices?.[0]?.finish_reason)).toBe(false);
      expect(sent.at(-1)).toEqual({ error });
      expect(log).toMatchObject({ status: 'error', errorMessage: error.message });
    });
  });

  it('keeps a completed response unchanged', async () => {
    await withFreshDb(async () => {
      const { body, log } = await chat(true, [
        { type: 'response.output_text.delta', delta: 'All tests passed.' },
        { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 9, output_tokens: 4 } } },
      ]);

      const sent = chunks(body);
      expect(sent.some((chunk) => 'error' in chunk)).toBe(false);
      expect(sent.at(-1)).toMatchObject({ choices: [{ finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 4 } });
      expect(log).toMatchObject({ status: 'success', errorMessage: null });
    });
  });
});

describe('Codex upstream failure without streaming', () => {
  it('returns 502 with the upstream error', async () => {
    await withFreshDb(async () => {
      const { response, body, log } = await chat(false, [failed]);

      expect(response.status).toBe(502);
      expect(JSON.parse(body).error.message).toContain('An error occurred while processing your request.');
      expect(log).toMatchObject({ status: 'error', statusCode: 502 });
    });
  });
});
