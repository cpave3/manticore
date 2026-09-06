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
  it.each([
    { url: null },
    { url: '' },
    { url: 'data:text/plain;base64,aGVsbG8=' },
    { url: 'data:image/png;base64,not base64' },
    { url: 'data:image/svg+xml;base64,PHN2Zy8+' },
    { url: 'file:///tmp/secret.png' },
    { url: 'https://user:secret@example.com/image.png' },
    { url: 'https://example.com/image.png', detail: 'invented' },
    { url: 'https://example.com/image.png', detail: 'original', model: 'gpt-5-codex' },
    { url: 'https://example.com/image.png', model: 'gpt-5.3-codex-spark' },
  ])('rejects invalid image input before upstream access: %j', async ({ url, detail, model }) => {
    const fetchMock = vi.fn(async () => new Response(sse([{ type: 'response.completed', response: { status: 'completed' } }])));
    vi.stubGlobal('fetch', fetchMock);
    await expect(forwardChatGPTCodex({ modelPath: model ?? 'gpt-5.6-sol', isStream: false,
      requestBody: { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url, detail } }] }] },
    })).rejects.toMatchObject({ status: 400, code: 'invalid_image_input' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([false, true])('preserves mixed text and images in the Codex request (stream=%s)', async (isStream) => {
    const fetchMock = vi.fn(async () => new Response(sse([
      { type: 'response.completed', response: { status: 'completed' } },
    ])));
    vi.stubGlobal('fetch', fetchMock);
    const image = 'data:image/png;base64,iVBORw==';
    const result = await forwardChatGPTCodex({ modelPath: 'gpt-5.6-sol', isStream, requestBody: {
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Compare these images' },
        { type: 'image_url', image_url: { url: image, detail: 'high' } },
        { type: 'text', text: 'with this one' },
        { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } },
      ] }], reasoning_effort: 'max', parallel_tool_calls: false,
    } });
    expect(result.body).not.toBeNull();
    await readStream(result.body!);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.input).toEqual([{ role: 'user', content: [
      { type: 'input_text', text: 'Compare these images' },
      { type: 'input_image', image_url: image, detail: 'high' },
      { type: 'input_text', text: 'with this one' },
      { type: 'input_image', image_url: 'https://example.com/photo.jpg' },
    ] }]);
    expect(body.reasoning.effort).toBe('max');
    expect(body.parallel_tool_calls).toBe(false);
  });
  it.each([false, true])('preserves reasoning summaries and opaque tool-continuation data (stream=%s)', async (isStream) => {
    const imageMessage = { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw==' } }] };
    const reasoning = { type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque-ciphertext', summary: [{ type: 'summary_text', text: 'A short summary' }] };
    const fetchMock = vi.fn(async () => new Response(sse([
      { type: 'response.output_item.done', item: reasoning },
      { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_1', name: 'test', arguments: '{}' } },
      { type: 'response.completed', response: { status: 'completed' } },
    ])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await forwardChatGPTCodex({ modelPath: 'gpt-5.6-sol', isStream, requestBody: { messages: [imageMessage] } });
    const output = await readStream(result.body);
    expect(output).toContain('reasoning_content');
    expect(output).toContain('A short summary');
    expect(output).toContain('codex_reasoning');
    expect(output).toContain('opaque-ciphertext');
    fetchMock.mockImplementation(async (_url?: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.input).toContainEqual(reasoning);
      expect(request.input).toContainEqual({ role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,iVBORw==' }] });
      expect(request.input).toContainEqual({ type: 'function_call_output', call_id: 'call_1', output: 'done' });
      expect(request.input.filter((item: { role?: string }) => item.role === 'assistant')).not.toContainEqual(expect.objectContaining({ content: expect.stringContaining('opaque-ciphertext') }));
      return new Response(sse([{ type: 'response.completed', response: { status: 'completed' } }]));
    });
    await forwardChatGPTCodex({ modelPath: 'gpt-5.6-sol', isStream: false, requestBody: { messages: [
      imageMessage,
      { role: 'assistant', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'test', arguments: '{}' }, codex_reasoning: [reasoning] }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'done' },
    ] } });
  });
  it('preserves explicit generation settings through the Codex request', async () => {
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.reasoning).toEqual({ effort: 'max', summary: null });
      expect(body.parallel_tool_calls).toBe(false);
      expect(body.text).toEqual({ verbosity: 'high' });
      expect(body.service_tier).toBe('priority');
      return new Response(sse([{ type: 'response.completed', response: { status: 'completed' } }]));
    });
    vi.stubGlobal('fetch', fetchMock);
    await forwardChatGPTCodex({
      modelPath: 'gpt-5.6-sol', isStream: false,
      requestBody: {
        messages: [{ role: 'user', content: 'hello' }], reasoning_effort: 'max',
        reasoning_summary: null, parallel_tool_calls: false, verbosity: 'high', service_tier: 'priority',
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { reasoning_effort: 'none' },
    { reasoning_effort: ['high'] },
    { thinking: { type: 'disabled' } },
    { reasoning_effort: 'invented' },
    { verbosity: 'high', text_verbosity: 'low' },
    { parallel_tool_calls: 'false' },
    { temperature: 0 },
  ])('rejects unsupported or conflicting settings before sending a request: %j', async (settings) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(forwardChatGPTCodex({
      modelPath: 'gpt-5.6-sol', isStream: true,
      requestBody: { messages: [], ...settings },
    })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
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
