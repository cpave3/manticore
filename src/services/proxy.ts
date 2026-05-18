import type { RawUpstream } from './upstreams.js';

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
}: {
  upstream: RawUpstream;
  modelPath: string;
  requestBody: Record<string, unknown>;
  isStream: boolean;
}): Promise<ForwardResult> {
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
      headers.set(key, value);
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
