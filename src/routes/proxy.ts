import { Hono } from 'hono';
import { apiKeyAuth } from '../middleware/auth.js';
import { extractSessionId } from '../middleware/session.js';
import { findUpstreamByName, findUpstreamById, type RawUpstream } from '../services/upstreams.js';
import { parseModelId } from '../services/model-id.js';
import { resolveModelMapping } from '../services/model-mappings.js';
import { forward, type ForwardResult } from '../services/proxy.js';
import { forwardChatGPTCodex } from '../services/chatgpt-codex-proxy.js';
import { buildLogRecord, writeLogRecord } from '../services/logging.js';
import {
  countPromptTokens,
  countCompletionTokens,
  getStreamCounter,
  type ChatMessage,
} from '../tokenizer/index.js';
import { buildApiError, HttpError } from '../lib/errors.js';

const app = new Hono();

app.onError((err, c) => {
  const client = c.var.client;
  if (err instanceof HttpError) {
    return c.json(err.toJson(), err.status as any);
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (client) {
    writeLogRecord(
      buildLogRecord({
        clientId: client.id,
        clientName: client.name,
        modelId: (c.req.query('model') as string) || 'unknown',
        upstream: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        latencyMs: 0,
        timeToFirstTokenMs: null,
        finishReason: null,
        status: 'error',
        statusCode: 500,
        errorMessage: message,
        startTime: new Date(),
      })
    );
  }
  console.error('[proxy] Unhandled error:', message);
  return c.json(buildApiError(message, 'internal_server_error'), 500);
});

app.use('/chat/completions', apiKeyAuth(), extractSessionId());

app.post('/chat/completions', async (c) => {
  const start = Date.now();
  const startTime = new Date();
  const client = c.var.client;

  // 1. Parse body
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json(buildApiError('Invalid JSON body', 'invalid_request_error'), 400);
  }

  if (typeof body.model !== 'string' || !Array.isArray(body.messages)) {
    const msg =
      typeof body.model !== 'string'
        ? 'Missing or invalid "model" field'
        : 'Missing or invalid "messages" field';
    return c.json(buildApiError(msg, 'invalid_request_error'), 400);
  }

  const modelId = body.model;

  // 3. Resolve model ID (abstract mapping wins over direct routing)
  let provider: string | undefined;
  let modelPath: string;
  let upstream: RawUpstream | null = null;

  const lookupName =
    typeof modelId === 'string' && modelId.startsWith('manticore/')
      ? modelId.slice('manticore/'.length)
      : (modelId as string);

  const mapping = resolveModelMapping(lookupName);

  if (mapping) {
    upstream = findUpstreamById(mapping.upstreamId);
    modelPath = mapping.modelPath;
  } else {
    // Fall back to direct provider/model routing
    try {
      const parsed = parseModelId(modelId as string);
      provider = parsed.provider;
      modelPath = parsed.modelPath;
      upstream = findUpstreamByName(provider);
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return c.json(err.toJson(), err.status as any);
      }
      return c.json(buildApiError('Invalid model ID', 'invalid_request_error'), 400);
    }
  }
  if (!upstream) {
    const errorMsg = provider != null
      ? `Unknown provider '${provider}'`
      : `Upstream for model '${modelId}' not found`;
    const log = buildLogRecord({
      clientId: client.id,
      clientName: client.name,
      modelId,
      upstream: null,
      sessionId: c.var.sessionId,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      latencyMs: Date.now() - start,
      timeToFirstTokenMs: null,
      finishReason: null,
      status: 'error',
      statusCode: 404,
      errorMessage: errorMsg,
      startTime,
    });
    writeLogRecord(log);
    return c.json(
      buildApiError(errorMsg, 'not_found'),
      404
    );
  }

  // 5. Count prompt tokens (best-effort) — use resolved modelPath so abstract
  // names do not confuse the tokenizer
  let promptTokens: number | null;
  try {
    promptTokens = await countPromptTokens(body.messages as ChatMessage[], modelPath);
  } catch (err: unknown) {
    // Tokenizer errors are non-fatal (best-effort counting)
    promptTokens = null;
    console.warn('[proxy] Tokenizer error (prompt):', err instanceof Error ? err.message : String(err));
  }

  // 6. Record start and forward
  const isStream = body.stream === true;

  let forwardResult: ForwardResult;
  try {
    forwardResult =
      upstream.type === 'chatgpt-codex'
        ? await forwardChatGPTCodex({
            modelPath,
            requestBody: body,
            isStream,
            sessionId: c.var.sessionId,
          })
        : await forward({
            upstream,
            modelPath,
            requestBody: body,
            isStream,
          });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLogRecord(
      buildLogRecord({
        clientId: client.id,
        clientName: client.name,
        modelId,
        upstream,
        sessionId: c.var.sessionId,
        promptTokens,
        completionTokens: null,
        totalTokens: promptTokens,
        latencyMs: Date.now() - start,
        timeToFirstTokenMs: null,
        finishReason: null,
        status: 'error',
        statusCode: 502,
        errorMessage: msg,
        startTime,
      })
    );
    return c.json(buildApiError(`Upstream request failed: ${msg}`, 'api_error'), 502);
  }

  const sessionId = c.var.sessionId;

  // 8. Streaming
  if (isStream) {
    return handleStreamingResponse(c, {
      forwardResult,
      client,
      modelId,
      modelPath,
      upstream,
      sessionId,
      promptTokens,
      start,
      startTime,
    });
  }

  // 9. Non-streaming
  return handleNonStreamingResponse(c, {
    forwardResult,
    client,
    modelId,
    modelPath,
    upstream,
    sessionId,
    promptTokens,
    start,
    startTime,
  });
});

// Catch-all for non-chat endpoints
app.all('/embeddings', (c) => {
  return c.json(
    buildApiError('Only /v1/chat/completions is supported', 'not_found'),
    404
  );
});

app.all('/images/*', (c) => {
  return c.json(
    buildApiError('Only /v1/chat/completions is supported', 'not_found'),
    404
  );
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

type StreamContext = {
  forwardResult: ForwardResult;
  client: { id: string; name: string };
  modelId: string;
  modelPath: string;
  upstream: RawUpstream;
  sessionId: string | null;
  promptTokens: number | null;
  start: number;
  startTime: Date;
};

async function handleStreamingResponse(c: any, ctx: StreamContext) {
  const { forwardResult, client, modelId, modelPath, upstream, sessionId, promptTokens, start, startTime } = ctx;

  const counter = await getStreamCounter(modelPath);
  const decoder = new TextDecoder();
  let buffer = '';
  let firstTokenTime: number | null = null;
  let finishReason: string | null = null;
  let upstreamUsage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null = null;
  let logWritten = false;

  function finalizeLog(status: 'success' | 'cancelled' | 'error') {
    if (logWritten) return;
    logWritten = true;

    const p = upstreamUsage?.prompt_tokens ?? promptTokens;
    const comp = upstreamUsage?.completion_tokens ?? (counter?.total() ?? null);
    const t =
      upstreamUsage?.total_tokens ??
      (p != null && comp != null ? p + comp : null);

    writeLogRecord(
      buildLogRecord({
        clientId: client.id,
        clientName: client.name,
        modelId,
        upstream,
        sessionId,
        promptTokens: p,
        completionTokens: comp,
        totalTokens: t,
        latencyMs: Date.now() - start,
        timeToFirstTokenMs: firstTokenTime,
        finishReason,
        status,
        statusCode: forwardResult.status,
        errorMessage: status === 'error' ? 'Upstream returned non-2xx or stream error' : null,
        startTime,
      })
    );
  }

  function processEvent(event: string) {
    if (firstTokenTime === null) {
      firstTokenTime = Date.now() - start;
    }

    const dataLines: string[] = [];
    for (const line of event.split('\n')) {
      if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      }
    }
    if (dataLines.length === 0) return;

    const payload = dataLines.join('\n');
    if (payload.trim() === '[DONE]') return;

    try {
      const json = JSON.parse(payload) as Record<string, unknown>;
      if (json.usage && typeof json.usage === 'object') {
        const u = json.usage as Record<string, unknown>;
        upstreamUsage = {
          prompt_tokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined,
          completion_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined,
          total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : undefined,
        };
      }
      const choices = json.choices as Array<Record<string, unknown>> | undefined;
      if (choices && choices[0]) {
        const delta = choices[0].delta as Record<string, unknown> | undefined;
        if (delta && typeof delta.content === 'string' && counter) {
          counter.feed(delta.content);
        }
        if (choices[0].finish_reason != null) {
          finishReason = String(choices[0].finish_reason);
        }
      }
    } catch {
      // ignore parse errors for individual events
    }
  }

  // Build the response stream manually so we can handle client aborts
  // gracefully. `pipeTo` on a TransformStream can reject with `undefined`
  // when the readable side is cancelled by the framework on disconnect,
  // breaking the downstream agent. Pumping manually lets us catch that
  // cleanly via the abort signal.
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!forwardResult.body) {
        controller.close();
        finalizeLog('error');
        return;
      }

      const reader = forwardResult.body.getReader();
      let aborted = false;

      const onAbort = () => {
        aborted = true;
        reader.cancel().catch(() => {});
        finalizeLog('cancelled');
      };
      c.req.raw.signal.addEventListener('abort', onAbort, { once: true });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          buffer += text.replace(/\r\n/g, '\n');

          while (true) {
            const idx = buffer.indexOf('\n\n');
            if (idx === -1) break;
            const event = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (event.trim()) {
              processEvent(event);
            }
          }

          controller.enqueue(value);
        }

        if (buffer.trim()) {
          processEvent(buffer);
        }
        controller.close();
        finalizeLog('success');
      } catch (e: unknown) {
        if (!aborted) {
          finalizeLog('error');
        }
        // Swallow the error here; if aborted the consumer is gone,
        // if real the framework will handle it.
      } finally {
        c.req.raw.signal.removeEventListener('abort', onAbort);
        reader.releaseLock();
      }
    },
  });

  return c.newResponse(responseStream, forwardResult.status, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
}

type NonStreamContext = {
  forwardResult: ForwardResult;
  client: { id: string; name: string };
  modelId: string;
  modelPath: string;
  upstream: RawUpstream;
  sessionId: string | null;
  promptTokens: number | null;
  start: number;
  startTime: Date;
};

async function handleNonStreamingResponse(c: any, ctx: NonStreamContext) {
  const { forwardResult, client, modelId, modelPath, upstream, sessionId, promptTokens, start, startTime } = ctx;

  const rawBody = forwardResult.body ? await new Response(forwardResult.body).text() : '';

  let parsedBody: Record<string, unknown> | null = null;
  try {
    parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    parsedBody = null;
  }

  if (forwardResult.status < 200 || forwardResult.status >= 300) {
    const errorMsg =
      (parsedBody?.error as Record<string, unknown> | undefined)?.message as string | undefined;
    writeLogRecord(
      buildLogRecord({
        clientId: client.id,
        clientName: client.name,
        modelId,
        upstream,
        sessionId,
        promptTokens,
        completionTokens: null,
        totalTokens: promptTokens,
        latencyMs: Date.now() - start,
        timeToFirstTokenMs: Date.now() - start,
        finishReason: null,
        status: 'error',
        statusCode: forwardResult.status,
        errorMessage: errorMsg || rawBody,
        startTime,
      })
    );

    if (parsedBody) {
      return c.json(parsedBody, forwardResult.status);
    }
    return c.body(rawBody || null, forwardResult.status);
  }

  // Success
  const usage = parsedBody?.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined;

  let completionTokens: number | null = null;
  if (usage?.completion_tokens != null) {
    completionTokens = usage.completion_tokens;
  } else {
    const msg = (parsedBody?.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message;
    const content = msg && typeof msg === 'object' && 'content' in msg ? String(msg.content) : undefined;
    if (typeof content === 'string') {
      try {
        completionTokens = await countCompletionTokens(content, modelPath);
      } catch (err: unknown) {
        completionTokens = null;
        console.warn('[proxy] Tokenizer error (completion):', err instanceof Error ? err.message : String(err));
      }
    }
  }

  const p = usage?.prompt_tokens ?? promptTokens;
  const comp = completionTokens;
  const t = usage?.total_tokens ?? (p != null && comp != null ? p + comp : null);

  const finishReason =
    (parsedBody?.choices as Array<Record<string, unknown>> | undefined)?.[0]?.finish_reason as
      | string
      | undefined;

  writeLogRecord(
    buildLogRecord({
      clientId: client.id,
      clientName: client.name,
      modelId,
      upstream,
      sessionId,
      promptTokens: p,
      completionTokens: comp,
      totalTokens: t,
      latencyMs: Date.now() - start,
      timeToFirstTokenMs: Date.now() - start,
      finishReason: finishReason ?? null,
      status: 'success',
      statusCode: forwardResult.status,
      errorMessage: null,
      startTime,
    })
  );

  if (parsedBody) {
    return c.json(parsedBody, forwardResult.status);
  }
  return c.body(rawBody || null, forwardResult.status);
}

export default app;
