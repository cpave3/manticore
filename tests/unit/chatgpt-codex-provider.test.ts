import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatGPTCodexProvider } from '../../src/providers/chatgpt-codex/provider.js';
import { extractChatGPTAccountId } from '../../src/providers/chatgpt-codex/credentials.js';

function accessToken(accountId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': {
        chatgpt_account_id: accountId,
      },
    }),
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

function sse(events: unknown[]): ReadableStream<Uint8Array> {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe('ChatGPT Codex provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts ChatGPT account id from access token', () => {
    expect(extractChatGPTAccountId(accessToken('acc_123'))).toBe('acc_123');
  });

  it('maps Codex SSE into AI SDK v6 generate result', async () => {
    const token = accessToken('acc_456');
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
      expect(headers.get('chatgpt-account-id')).toBe('acc_456');
      expect(headers.get('OpenAI-Beta')).toBe('responses=experimental');
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody.model).toBe('gpt-5.5');
      expect(requestBody.reasoning.effort).toBe('medium');
      return new Response(
        sse([
          { type: 'response.output_text.delta', delta: 'Hello' },
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              usage: {
                input_tokens: 7,
                output_tokens: 3,
                input_tokens_details: { cached_tokens: 2 },
              },
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createChatGPTCodexProvider({
      getCredentials: async () => ({
        accessToken: token,
        refreshToken: 'refresh',
        accountId: 'acc_456',
        expiresAt: new Date(Date.now() + 3600_000),
      }),
    });
    const result = await provider.languageModel('gpt-5.5').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Say hi' }] }],
    });

    expect(result.content).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(result.finishReason.unified).toBe('stop');
    expect(result.usage.inputTokens.total).toBe(7);
    expect(result.usage.inputTokens.cacheRead).toBe(2);
    expect(result.usage.outputTokens.total).toBe(3);
  });
});
