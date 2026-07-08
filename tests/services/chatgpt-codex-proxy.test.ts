import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardChatGPTCodex } from '../../src/services/chatgpt-codex-proxy.js';

vi.mock('../../src/services/chatgpt-codex-auth.js', () => ({
  getFreshChatGPTCodexCredentials: async () => ({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accountId: 'acc_123',
    expiresAt: new Date(Date.now() + 3600_000),
  }),
}));

function sse(events: unknown[]): ReadableStream<Uint8Array> {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

describe('forwardChatGPTCodex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards OpenAI chat tools to Codex and streams function calls back as tool_calls', async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody.tools).toEqual([
        {
          type: 'function',
          name: 'bash',
          description: 'Run a command',
          strict: false,
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string' },
            },
            required: ['command'],
          },
        },
      ]);
      return new Response(
        sse([
          {
            type: 'response.output_item.done',
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'bash',
              arguments: '{"command":"ls -la"}',
            },
          },
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              usage: {
                input_tokens: 10,
                output_tokens: 2,
              },
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await forwardChatGPTCodex({
      modelPath: 'gpt-5-codex',
      isStream: true,
      requestBody: {
        messages: [{ role: 'user', content: 'list files' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'bash',
              description: 'Run a command',
              parameters: {
                type: 'object',
                properties: {
                  command: { type: 'string' },
                },
                required: ['command'],
              },
            },
          },
        ],
      },
    });

    const body = await readStream(result.body);
    expect(body).toContain('"tool_calls"');
    expect(body).toContain('"id":"call_1"');
    expect(body).toContain('"name":"bash"');
    expect(body).toContain('"{\\"command\\":\\"ls -la\\"}"');
    expect(body).toContain('"finish_reason":"tool_calls"');
  });
});
