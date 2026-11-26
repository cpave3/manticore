import type { RawUpstream } from './upstreams.js';
import { HttpError } from '../lib/errors.js';

export type ForwardResult = {
  headers: Headers;
  status: number;
  body: ReadableStream<Uint8Array> | null;
};

export async function forward({
  upstream,
  modelPath,
  requestBody,
  isStream,
  sessionId,
}: {
  upstream: RawUpstream;
  modelPath: string;
  requestBody: Record<string, unknown>;
  isStream: boolean;
  sessionId?: string | null;
}): Promise<ForwardResult> {
  if (!upstream.baseUrl) {
    throw new Error(`Upstream '${upstream.name}' does not have an OpenAI-compatible base URL`);
  }
  const base = upstream.baseUrl.replace(/\/$/, '');
  const url = `${base}/chat/completions`;

  const body = { ...requestBody, model: modelPath };

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (upstream.apiKey) {
    headers.set('Authorization', `Bearer ${upstream.apiKey}`);
  }
  if (upstream.headers) {
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (value === '{sessionId}') {
        if (!sessionId) {
          throw new HttpError({
            status: 400,
            type: 'invalid_request_error',
            message: `Upstream '${upstream.name}' requires X-Session-Id: send a stable conversation ID`,
          });
        }
        headers.set(key, sessionId);
      } else {
        headers.set(key, value);
      }
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return {
    headers: response.headers,
    status: response.status,
    body: response.body,
  };
}
