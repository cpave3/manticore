import type { LanguageModelV3CallOptions, LanguageModelV3Prompt, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { randomUUID } from 'node:crypto';
import { createChatGPTCodexProvider } from '../providers/chatgpt-codex/provider.js';
import { getFreshChatGPTCodexCredentials } from './chatgpt-codex-auth.js';
import type { ForwardResult } from './proxy.js';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type ChatTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
    strict?: boolean;
  };
};

export async function forwardChatGPTCodex({
  modelPath,
  requestBody,
  isStream,
  sessionId,
}: {
  modelPath: string;
  requestBody: Record<string, unknown>;
  isStream: boolean;
  sessionId?: string | null;
}): Promise<ForwardResult> {
  const provider = createChatGPTCodexProvider({
    getCredentials: getFreshChatGPTCodexCredentials,
  });
  const model = provider.languageModel(modelPath);
  const prompt = openAIToLanguageModelPrompt(requestBody.messages as ChatMessage[]);
  const tools = openAIToLanguageModelTools(requestBody.tools);
  const providerOptions = { 'chatgpt-codex': compactJsonObject({
    reasoningEffort: requestBody.reasoning_effort,
    reasoningSummary: requestBody.reasoning_summary,
    serviceTier: requestBody.service_tier,
    textVerbosity: requestBody.text_verbosity,
  }) };

  if (!isStream) {
    const result = await model.doGenerate({
      prompt,
      tools,
      providerOptions,
    });
    const text = result.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
    const toolCalls = result.content
      .filter((part) => part.type === 'tool-call')
      .map((part) => ({
        id: part.toolCallId,
        type: 'function' as const,
        function: {
          name: part.toolName,
          arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input ?? {}),
        },
      }));
    const payload = {
      id: `chatcmpl-${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelPath,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: text || null,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          },
          finish_reason:
            toolCalls.length > 0
              ? 'tool_calls'
              : result.finishReason.unified === 'length'
                ? 'length'
                : 'stop',
        },
      ],
      usage: usageToOpenAI(result.usage),
    };
    return jsonForwardResult(payload, 200);
  }

  const streamResult = await model.doStream({
    prompt,
    tools,
    providerOptions: {
      ...providerOptions,
      'chatgpt-codex': {
        ...(providerOptions['chatgpt-codex'] as object),
        ...(sessionId ? { sessionId } : {}),
      },
    },
  });
  return {
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    status: 200,
    body: toOpenAISSE(streamResult.stream, modelPath),
  };
}

function compactJsonObject(value: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean'
    ) {
      out[key] = item;
    }
  }
  return out;
}

function jsonForwardResult(value: unknown, status: number): ForwardResult {
  return {
    headers: new Headers({ 'Content-Type': 'application/json' }),
    status,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(value)));
        controller.close();
      },
    }),
  };
}

function openAIToLanguageModelPrompt(messages: ChatMessage[]): LanguageModelV3Prompt {
  const toolNamesByCallId = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const toolCall of message.tool_calls ?? []) {
      toolNamesByCallId.set(toolCall.id, toolCall.function.name);
    }
  }
  return messages.map((message) => {
    if (message.role === 'system') {
      return { role: 'system', content: stringifyContent(message.content) };
    }
    if (message.role === 'user') {
      return { role: 'user', content: [{ type: 'text', text: stringifyContent(message.content) }] };
    }
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: message.tool_call_id ?? randomUUID(),
            toolName: toolNamesByCallId.get(message.tool_call_id ?? '') ?? 'tool',
            output: { type: 'text', value: stringifyContent(message.content) },
          },
        ],
      };
    }
    return {
      role: 'assistant',
      content: [
        ...(message.content != null ? [{ type: 'text' as const, text: stringifyContent(message.content) }] : []),
        ...(message.tool_calls ?? []).map((toolCall) => ({
          type: 'tool-call' as const,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: safeJsonParse(toolCall.function.arguments),
        })),
      ],
    };
  });
}

function openAIToLanguageModelTools(tools: unknown): LanguageModelV3CallOptions['tools'] {
  if (!Array.isArray(tools)) return undefined;
  return tools
    .filter((tool): tool is ChatTool => {
      if (!tool || typeof tool !== 'object') return false;
      const candidate = tool as Partial<ChatTool>;
      return candidate.type === 'function' && typeof candidate.function?.name === 'string';
    })
    .map((tool) => ({
      type: 'function' as const,
      name: tool.function.name,
      description: tool.function.description,
      inputSchema: tool.function.parameters,
      ...(typeof tool.function.strict === 'boolean' ? { strict: tool.function.strict } : {}),
    }));
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }
        return JSON.stringify(part);
      })
      .join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function usageToOpenAI(usage: {
  inputTokens: { total: number | undefined };
  outputTokens: { total: number | undefined };
}) {
  const prompt = usage.inputTokens.total ?? 0;
  const completion = usage.outputTokens.total ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  };
}

function toOpenAISSE(stream: ReadableStream<LanguageModelV3StreamPart>, modelPath: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const id = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      const reader = stream.getReader();
      let emittedToolCall = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.type === 'text-delta') {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  id,
                  object: 'chat.completion.chunk',
                  created,
                  model: modelPath,
                  choices: [{ index: 0, delta: { content: value.delta }, finish_reason: null }],
                })}\n\n`,
              ),
            );
          }
          if (value.type === 'tool-call') {
            emittedToolCall = true;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  id,
                  object: 'chat.completion.chunk',
                  created,
                  model: modelPath,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: value.toolCallId,
                            type: 'function',
                            function: {
                              name: value.toolName,
                              arguments:
                                typeof value.input === 'string'
                                  ? value.input
                                  : JSON.stringify(value.input ?? {}),
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                })}\n\n`,
              ),
            );
          }
          if (value.type === 'finish') {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  id,
                  object: 'chat.completion.chunk',
                  created,
                  model: modelPath,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason:
                        emittedToolCall
                          ? 'tool_calls'
                          : value.finishReason.unified === 'length'
                            ? 'length'
                            : 'stop',
                    },
                  ],
                  usage: usageToOpenAI(value.usage),
                })}\n\n`,
              ),
            );
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
