import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  ProviderV3,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { randomUUID } from 'node:crypto';
import type {
  ChatGPTCodexCredentials,
  ChatGPTCodexMessage,
  ChatGPTCodexProviderOptions,
  ChatGPTCodexRequest,
  ChatGPTCodexUsage,
} from './types.js';
import { CHATGPT_CODEX_BASE_URL, CHATGPT_CODEX_PROVIDER_ID, type ChatGPTCodexModelId } from './types.js';

export type ChatGPTCodexProviderSettings = {
  baseURL?: string;
  headers?: Record<string, string>;
  getCredentials: () => Promise<ChatGPTCodexCredentials>;
  reasoningEffort?: ChatGPTCodexProviderOptions['reasoningEffort'];
  reasoningSummary?: ChatGPTCodexProviderOptions['reasoningSummary'];
  serviceTier?: ChatGPTCodexProviderOptions['serviceTier'];
  textVerbosity?: ChatGPTCodexProviderOptions['textVerbosity'];
};

type BuildArgsResult = {
  body: ChatGPTCodexRequest;
  warnings: SharedV3Warning[];
};

type ParsedStreamResult = {
  content: LanguageModelV3Content[];
  finishReason: LanguageModelV3FinishReason;
  usage: LanguageModelV3Usage;
};

const MODEL_CONTEXT: Record<string, { contextWindow: number; maxTokens: number }> = {
  'gpt-5.5': { contextWindow: 272000, maxTokens: 128000 },
  'gpt-5.4': { contextWindow: 272000, maxTokens: 128000 },
  'gpt-5.4-mini': { contextWindow: 272000, maxTokens: 128000 },
  'gpt-5.3-codex-spark': { contextWindow: 128000, maxTokens: 128000 },
  'gpt-5-codex': { contextWindow: 200000, maxTokens: 100000 },
  'codex-mini-latest': { contextWindow: 200000, maxTokens: 100000 },
};

export function createChatGPTCodexProvider(settings: ChatGPTCodexProviderSettings): ProviderV3 {
  const provider: ProviderV3 & ((modelId: ChatGPTCodexModelId) => LanguageModelV3) = Object.assign(
    (modelId: ChatGPTCodexModelId) => new ChatGPTCodexLanguageModel(modelId, settings),
    {
      specificationVersion: 'v3' as const,
      languageModel: (modelId: string) => new ChatGPTCodexLanguageModel(modelId, settings),
      embeddingModel: () => {
        throw new Error('ChatGPT Codex does not support embeddings');
      },
      imageModel: () => {
        throw new Error('ChatGPT Codex does not support image generation');
      },
    },
  );
  return provider;
}

export class ChatGPTCodexLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = CHATGPT_CODEX_PROVIDER_ID;
  readonly modelId: string;
  readonly supportedUrls = { 'image/*': [/^https?:\/\//] };

  private readonly settings: ChatGPTCodexProviderSettings;

  constructor(modelId: string, settings: ChatGPTCodexProviderSettings) {
    this.modelId = modelId;
    this.settings = settings;
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { body, warnings } = this.buildRequestBody(options);
    const response = await this.fetchCodex(body, options);
    const responseBody = requireResponseBody(response);
    const parsed = await collectCodexStream(responseBody, false);
    return {
      content: parsed.content,
      finishReason: parsed.finishReason,
      usage: parsed.usage,
      warnings,
      request: { body },
      response: {
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { body, warnings } = this.buildRequestBody(options);
    const response = await this.fetchCodex(body, options);
    const responseBody = requireResponseBody(response);
    return {
      stream: streamCodexResponse(responseBody, warnings, options.includeRawChunks === true),
      request: { body },
      response: {
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  }

  private async fetchCodex(body: ChatGPTCodexRequest, options: LanguageModelV3CallOptions): Promise<Response> {
    const credentials = await this.settings.getCredentials();
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${credentials.accessToken}`,
      'chatgpt-account-id': credentials.accountId,
      'OpenAI-Beta': 'responses=experimental',
      originator: 'manticore',
      ...(this.settings.headers ?? {}),
      ...(options.headers ?? {}),
    });

    const response = await fetch(`${(this.settings.baseURL ?? CHATGPT_CODEX_BASE_URL).replace(/\/+$/, '')}/codex/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`ChatGPT Codex API error (${response.status}): ${text || response.statusText}`);
    }
    if (!response.body) {
      throw new Error('ChatGPT Codex API returned no response body');
    }
    return response;
  }

  private buildRequestBody(options: LanguageModelV3CallOptions): BuildArgsResult {
    const warnings: SharedV3Warning[] = [];
    const providerOptions = readProviderOptions(options.providerOptions?.[CHATGPT_CODEX_PROVIDER_ID]);
    const modelDefaults = MODEL_CONTEXT[this.modelId];
    const input = convertPrompt(options.prompt, warnings);
    const reasoningEffort =
      providerOptions.reasoningEffort ?? this.settings.reasoningEffort ?? defaultReasoningEffort(this.modelId);
    const reasoningSummary = providerOptions.reasoningSummary ?? this.settings.reasoningSummary ?? 'auto';
    const include: string[] = [];
    const body: ChatGPTCodexRequest = {
      model: this.modelId,
      store: false,
      stream: true,
      instructions: extractInstructions(options.prompt),
      input,
      parallel_tool_calls: true,
      tool_choice: 'auto',
      text: {
        verbosity: providerOptions.textVerbosity ?? this.settings.textVerbosity ?? 'low',
      },
    };

    if (reasoningEffort && reasoningEffort !== 'none') {
      body.reasoning = {
        effort: mapReasoningEffort(this.modelId, reasoningEffort),
        summary: reasoningSummary === 'off' ? null : reasoningSummary,
      };
      include.push('reasoning.encrypted_content');
    }
    if (include.length > 0) {
      body.include = include;
    }

    const serviceTier = providerOptions.serviceTier ?? this.settings.serviceTier;
    if (serviceTier) {
      body.service_tier = serviceTier;
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools
        .filter((tool) => tool.type === 'function')
        .map((tool) => ({
          type: 'function',
          name: tool.name,
          description: tool.description ?? '',
          strict: false,
          parameters: tool.inputSchema,
        }));
      if (body.tools.length !== options.tools.length) {
        warnings.push({ type: 'unsupported', feature: 'provider tools' });
      }
    }

    if (options.temperature !== undefined) {
      warnings.push({ type: 'unsupported', feature: 'temperature' });
    }
    if (options.topP !== undefined) {
      warnings.push({ type: 'unsupported', feature: 'topP' });
    }
    if (options.stopSequences !== undefined) {
      warnings.push({ type: 'unsupported', feature: 'stopSequences' });
    }
    if (options.maxOutputTokens && modelDefaults && options.maxOutputTokens > modelDefaults.maxTokens) {
      warnings.push({ type: 'other', message: `maxOutputTokens exceeds known ${this.modelId} output limit` });
    }

    return { body, warnings };
  }
}

function readProviderOptions(value: unknown): ChatGPTCodexProviderOptions {
  if (!value || typeof value !== 'object') return {};
  return value as ChatGPTCodexProviderOptions;
}

function requireResponseBody(response: Response): ReadableStream<Uint8Array> {
  if (!response.body) throw new Error('ChatGPT Codex API returned no response body');
  return response.body;
}

function defaultReasoningEffort(modelId: string): ChatGPTCodexProviderOptions['reasoningEffort'] {
  if (modelId === 'gpt-5.3-codex-spark') return 'low';
  if (modelId.startsWith('gpt-5') || modelId.startsWith('codex')) return 'medium';
  return undefined;
}

function mapReasoningEffort(modelId: string, effort: NonNullable<ChatGPTCodexProviderOptions['reasoningEffort']>): string {
  if (modelId === 'gpt-5.3-codex-spark' && effort === 'xhigh') return 'xhigh';
  if (effort === 'minimal') return 'low';
  return effort;
}

function extractInstructions(prompt: LanguageModelV3Prompt): string {
  const system = prompt
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim();
  return system || 'You are a helpful assistant.';
}

function convertPrompt(prompt: LanguageModelV3Prompt, warnings: SharedV3Warning[]): ChatGPTCodexMessage[] {
  const messages: ChatGPTCodexMessage[] = [];
  for (const message of prompt) {
    if (message.role === 'system') {
      continue;
    }
    if (message.role === 'user') {
      messages.push({ role: 'user', content: partsToText(message.content, warnings) });
      continue;
    }
    if (message.role === 'assistant') {
      const content = partsToText(message.content.filter((part) => part.type !== 'tool-call'), warnings);
      if (content) {
        messages.push({
          role: 'assistant',
          content,
        });
      }
      for (const part of message.content) {
        if (part.type !== 'tool-call') continue;
        messages.push({
          type: 'function_call',
          call_id: part.toolCallId,
          name: part.toolName,
          arguments: JSON.stringify(part.input ?? {}),
        });
      }
      continue;
    }
    if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.type !== 'tool-result') continue;
        messages.push({
          type: 'function_call_output',
          call_id: part.toolCallId,
          output: toolOutputToText(part.output),
        });
      }
    }
  }
  return messages;
}

function partsToText(parts: Array<{ type: string }>, warnings: SharedV3Warning[]): string {
  const out: string[] = [];
  for (const part of parts) {
    const record = part as Record<string, unknown>;
    if (part.type === 'text' || part.type === 'reasoning') {
      out.push(String(record.text ?? ''));
      continue;
    }
    if (part.type === 'file') {
      const mediaType = String(record.mediaType ?? 'application/octet-stream');
      if (mediaType.startsWith('image/')) {
        if (record.data instanceof URL) {
          out.push(`[Image: ${record.data.href}]`);
        } else if (typeof record.data === 'string') {
          out.push(`[Image: data:${mediaType};base64,${record.data}]`);
        } else if (record.data instanceof Uint8Array) {
          out.push(`[Image: data:${mediaType};base64,${Buffer.from(record.data).toString('base64')}]`);
        }
      } else {
        out.push(`[File: ${String(record.filename ?? 'unnamed')}]`);
      }
      continue;
    }
    warnings.push({ type: 'other', message: `Unsupported prompt part type: ${part.type}` });
  }
  return out.join('\n');
}

function toolOutputToText(output: unknown): string {
  if (!output || typeof output !== 'object') return String(output ?? '');
  const typed = output as { type?: string; value?: unknown };
  if (typed.type === 'text' || typed.type === 'error-text') return String(typed.value ?? '');
  return JSON.stringify(typed.value ?? output);
}

function usageFromCodex(raw?: ChatGPTCodexUsage): LanguageModelV3Usage {
  const inputTotal = raw?.input_tokens;
  const cacheRead = raw?.input_tokens_details?.cached_tokens;
  const outputTotal = raw?.output_tokens;
  return {
    inputTokens: {
      total: inputTotal,
      cacheRead,
      cacheWrite: undefined,
      noCache: inputTotal != null && cacheRead != null ? inputTotal - cacheRead : inputTotal,
    },
    outputTokens: {
      total: outputTotal,
      text: outputTotal,
      reasoning: raw?.output_tokens_details?.reasoning_tokens,
    },
    raw: raw as any,
  };
}

function finishReasonFromCodex(status?: string, incompleteReason?: string): LanguageModelV3FinishReason {
  if (status === 'incomplete' || incompleteReason === 'max_output_tokens') {
    return { unified: 'length', raw: incompleteReason ?? status };
  }
  if (status === 'failed') return { unified: 'error', raw: status };
  if (status === 'cancelled') return { unified: 'other', raw: status };
  return { unified: 'stop', raw: status };
}

async function* parseSSE(body: ReadableStream<Uint8Array>, includeRaw: boolean): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      while (true) {
        const idx = buffer.indexOf('\n\n');
        if (idx === -1) break;
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = chunk
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n')
          .trim();
        if (!data || data === '[DONE]') continue;
        const parsed = JSON.parse(data) as unknown;
        if (includeRaw) yield { type: 'raw', rawValue: parsed };
        yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function streamCodexResponse(
  body: ReadableStream<Uint8Array>,
  warnings: SharedV3Warning[],
  includeRaw: boolean,
): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream<LanguageModelV3StreamPart>({
    async start(controller) {
      controller.enqueue({ type: 'stream-start', warnings });
      let textStarted = false;
      let finalUsage = usageFromCodex();
      let finalReason = finishReasonFromCodex('completed');
      try {
        for await (const event of parseSSE(body, includeRaw)) {
          if (isRawPart(event)) {
            controller.enqueue(event);
            continue;
          }
          const record = event as Record<string, any>;
          if (record.type === 'response.output_text.delta' && typeof record.delta === 'string') {
            if (!textStarted) {
              textStarted = true;
              controller.enqueue({ type: 'text-start', id: 'text-0' });
            }
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: record.delta });
          }
          if (record.type === 'response.output_item.done' && record.item?.type === 'function_call') {
            controller.enqueue({
              type: 'tool-call',
              toolCallId: String(record.item.call_id ?? record.item.id ?? randomUUID()),
              toolName: String(record.item.name ?? 'unknown'),
              input: String(record.item.arguments ?? '{}'),
            });
          }
          if (record.type === 'response.completed' || record.type === 'response.done' || record.type === 'response.incomplete') {
            const response = record.response ?? {};
            finalUsage = usageFromCodex(response.usage);
            finalReason = finishReasonFromCodex(response.status, response.incomplete_details?.reason);
          }
        }
        if (textStarted) controller.enqueue({ type: 'text-end', id: 'text-0' });
        controller.enqueue({ type: 'finish', usage: finalUsage, finishReason: finalReason });
        controller.close();
      } catch (error) {
        controller.enqueue({ type: 'error', error });
        controller.error(error);
      }
    },
  });
}

function isRawPart(value: unknown): value is Extract<LanguageModelV3StreamPart, { type: 'raw' }> {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === 'raw';
}

async function collectCodexStream(body: ReadableStream<Uint8Array>, includeRaw: boolean): Promise<ParsedStreamResult> {
  const stream = streamCodexResponse(body, [], includeRaw);
  const reader = stream.getReader();
  let text = '';
  let usage = usageFromCodex();
  let finishReason = finishReasonFromCodex('completed');
  const content: LanguageModelV3Content[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === 'text-delta') {
        text += value.delta;
      } else if (value.type === 'tool-call') {
        content.push(value);
      } else if (value.type === 'finish') {
        usage = value.usage;
        finishReason = value.finishReason;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (text) content.unshift({ type: 'text', text });
  return { content, usage, finishReason };
}
